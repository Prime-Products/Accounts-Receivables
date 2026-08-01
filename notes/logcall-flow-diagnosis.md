# Log Call → task → status: what the code actually does

`ar.logCall` (server/routers/ar.ts:5047) writes, in order:

1. **Always** an `activity_log` row `call` titled `Call logged — Reached|No Answer`.
2. **Only if `confirmationStatus` was chosen**: upsert `group_confirmation_status`
   (status, amount, followUpDate, notes), then `cleanupStatusArtifacts(previous → new)`.
3. `Confirmed` → `createGroupPromise` (or `rescheduleGroupPromise`) which creates
   the promise row + a promise-check task.
4. `Pending Follow-up` + date → `upsertFollowUpTask`.
5. `audit(...)`.

## Structural observations (before looking at data)

- **A task is NOT created on every call.** Only `Confirmed` and
  `Pending Follow-up` create one. `Reached` with no status chosen, or
  `No Answer`, leaves only the activity_log row. So "κάθε log call φτιάχνει
  task" is not what the code does → this is very likely the mismatch the user
  feels.
- **Status is per GROUP, not per company.** `group_confirmation_status` is keyed
  on `groupName`. A call to one company moves the whole group's status.
- **Linking of task ↔ status is by string matching inside `task.description`**
  (`(Follow-up: <group>)`, `(Promise #<id>)`), not by a foreign key. Any group
  name containing regex-ish/odd characters, a renamed group, or an edited
  description silently breaks the link → status shows active but no task is
  found (`getActiveCommunication` returns null).
- **`isConfirmationStale`** can flip a status back to `Not Contacted` purely on
  age/date, without touching the task → status and task disagree.

To verify next: counts of calls vs auto-tasks, orphan statuses (active status
with no open linked task), and tasks whose group no longer matches.

## What the real data says (01/08/2026)

```
calls logged                     185
  of which "No Answer"             0   ← nobody ever logs an unsuccessful call
distinct groups called            86
  groups with NO status row       76   ← 88% of called groups have no status at all
status rows total                 16
  Pending Follow-up                1
  Confirmed                        0
  Escalated                        2
  Not Contacted                   13   ← called, then reset back to "not contacted"
  Kept / Broken                    0
open follow-up tasks               1
open promise-check tasks           0
```

### The core problem

185 calls produced **1 open task and 3 active statuses**. The tracking the user
built exists in code but almost never fires, because:

1. **The status/task creation is optional and off the main path.** `logCall`
   only writes a status + task when the collector explicitly picks a
   `confirmationStatus`. In practice the collector picks `Reached`, types notes,
   and saves → only an `activity_log` row. 76 of 86 called groups took exactly
   this path.
2. **"Reached" is not an outcome.** There is no answer to "και τώρα τι;". The
   dialog does not force a next step, so no task and no status exist to review.
3. **No Answer never gets logged (0/185)** — so an unreachable customer looks
   identical to one that was never called. The tracking the user wants
   ("με ποιους έχει μιλήσει ο χρήστης") cannot distinguish them.
4. **13 groups sit at "Not Contacted" although they were called.** Either a
   later save reset them, or `cleanupStatusArtifacts` swept them; the call
   history says "we talked", the status says "never contacted". Two sources of
   truth that disagree — this is what "κάτι δεν μου πάει καλά" feels like.
5. **Status is group-level, single-slot.** One row per group, overwritten on
   every call: no history of statuses, and a call to company A overwrites the
   state set by a call to company B in the same group.
6. **Task ↔ status linking is string matching in `task.description`**
   (`(Follow-up: <group>)`, `(Promise #<id>)`). Rename a group or edit a
   description → the link silently dies, the badge shows an active status with
   no task behind it.

### Recommended fix (order matters)

1. **Make the outcome mandatory** in Log Call: every save must answer "what
   next" — Promise to Pay / Call again on <date> / Escalate / No answer, retry
   <date> / Nothing needed (closed). Only "Nothing needed" creates no task.
2. **Every call writes a status row**, including `No Answer` → a real
   "Attempted, no contact" status instead of nothing.
3. **Replace the string markers with real columns** (`tasks.promiseId`,
   `tasks.groupName` / `confirmationId`) so the link cannot break.
4. **Keep status history** (append-only), with the card showing the latest —
   then "ποιους έχει πάρει ο χρήστης και με τι αποτέλεσμα" is a query, not a
   guess.
5. **Per-user call tracking view**: calls per collector per day, with outcome
   and whether a next step exists.

## CONFIRMED BUG — group names with a parenthesis get truncated

The status table contains duplicate, broken keys:

```
key=[EVALEND (TANKERS]   len=16  status=Escalated      calls=0  customers matched=0
key=[EVALEND (TANKERS)]  len=17  status=Not Contacted  calls=2  customers matched=10
key=[MINERVA (MARTINOS]  len=17  status=Escalated      calls=0  customers matched=0
key=[MINERVA (MARTINOS)] len=18  status=Not Contacted  calls=1  customers matched=2
```

Root cause — `tasks.escalate` (server/routers/ar.ts:3475):

```ts
const followUpMatch = task.description?.match(/\(Follow-up: (.+?)\)/);
let group = followUpMatch?.[1] ?? null;
```

The marker written by `upsertFollowUpTask` is `(Follow-up: EVALEND (TANKERS))`.
The **non-greedy** `(.+?)\)` stops at the FIRST `)`, so the captured group is
`EVALEND (TANKERS` — the real group name minus its closing paren. Escalation
then writes the `Escalated` status onto that phantom key.

Consequences, all matching what the user feels:

- The group card reads the correct key `EVALEND (TANKERS)` → still shows
  **Not Contacted**, even though the case was escalated. The escalation is
  invisible on the card.
- `Escalated` is parked on a key no customer maps to → 2 of the 3 "active"
  statuses in the whole database are orphans (`matched=0`).
- The escalated task exists and is assigned, so work is happening with **no
  status on the account** — exactly "δεν βλέπω με ποιους έχει μιλήσει".
- Any group whose name contains `)` is affected. In this DB that is most of the
  big ones: EVALEND (TANKERS), MINERVA (MARTINOS), CAPITAL SHIP (VANIMAR),
  TMS GROUP (TANKERS & BULKERS), REEDEREI NORD (GERMANY), MERCURIA ENERGY (MM
  MARINE), SAFETY (HATZIOANNOY V) …

The same non-greedy/first-`)` fragility applies anywhere the code parses these
string markers instead of using a column, so the marker parsing must be made
greedy/anchored AND the group should be stored on the task.
