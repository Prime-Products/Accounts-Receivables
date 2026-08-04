# Promises without a stated amount — findings (2026-08-01)

## User requirement (verbatim intent)

"Πολλές φορές ο πελάτης μου λέει ότι θα πληρώσει αλλά δεν λέει το ποσό — είναι
σημαντικό να καταχωρείται η υπόσχεση χωρίς ποσό σαν task."

So an amount-less promise is a **valid, first-class record**, not an error. The
promised **date stays mandatory**; only the amount may be unknown. It must create
a follow-up task like any other promise.

## What the user saw (screenshot)

Log Call dialog on group DYNACOM, contact Andreas Gkoros, Outcome "Reached",
Customer Response "Promise to Pay" showed a yellow banner:

> Open promise exists: €0 due 08/08/2026 (DYNACOM TANKERS MANAGEMENT LTD)

The user objected because DYNACOM has **no open promise task**.

## Database evidence

All 5 Pending promises (`promises_to_pay`):

| id | customer | group | amount | due | created | notes |
|---|---|---|---|---|---|---|
| 7260001 | MINERVA MARINE INC | MINERVA (MARTINOS) | 0.00 | 2026-08-01 | 07-31 21:37 | — |
| 6780001 | TMS TANKERS LTD. | TMS GROUP | 99999.00 | 2026-08-07 | 07-31 17:33 | "με διαβεβαιωσε..." |
| 6510001 | CAPITAL GAS SHIP MANAGEMENT | CAPITAL SHIP (VANIMAR) | 66666.00 | 2026-08-06 | 07-31 12:26 | — |
| 6270001 | DYNACOM TANKERS MANAGEMENT LTD | DYNACOM | 0.00 | 2026-08-08 | 07-31 10:28 | — |
| 6240001 | MSC SHIPMANAGEMENT LTD | MSC SHIPMANAGEMENT LTD | 80000.00 | 2026-08-01 | 07-30 22:30 | — |

Totals across the table: Pending 5 (2 with amount 0), Broken 268 (7 zero), Kept 11.

**Open tasks for DYNACOM customers (ids 143, 144): NONE.** So the two amount-less
promises exist without the follow-up task that every promise is supposed to get.

## ROOT CAUSE (confirmed)

The tasks WERE created; they were later closed, but the promise row stayed `Pending`:

| promise | task | task status |
|---|---|---|
| 6270001 DYNACOM | 7050001 "Promise to Pay — DYNACOM" | **Completed** |
| 6270001 DYNACOM | 7890001 "Escalated: Promise to Pay — DYNACOM" | **Cancelled** |
| 7260001 MINERVA | 8130001 "Promise to Pay — MINERVA (MARTINOS)" | **Completed** |
| 7260001 MINERVA | 8130002 "Escalated: Promise to Pay — MINERVA (MARTINOS)" | **Cancelled** |

So the defect is a **lifecycle desync**: closing/escalating the promise-check task
does not settle the promise (`Kept`/`Broken`). `findOpenGroupPromise` only filters
`status === "Pending"`, so the orphaned promise keeps firing the yellow
"Open promise exists" banner even though, from the user's point of view, the
promise has no live task and therefore does not exist.

Fix direction: when a promise-check task is Completed or Cancelled, settle the
linked promise (or treat a promise whose every linked task is closed as not open).
Prefer settling at the task-transition site so data stays consistent.
2. **"€0" display.** An unknown amount is rendered as `€0`, which reads as "zero
   euros owed". Must render "amount not stated" instead, in: Log Call banner
   (`client/src/components/LogCallDialog.tsx:354`), Collections Desk, task
   titles, group card.

## Relevant code map

- `server/routers/ar.ts:168` `createGroupPromise` — creates promise + activity + task; already handles `amt > 0` labels.
- `server/routers/ar.ts:257` `findOpenGroupPromise` — powers the yellow banner; filters only `status === "Pending"`.
- `server/routers/ar.ts:4120` `addPromise` mutation.
- `server/routers/ar.ts:5013` `logCall` mutation.
- `server/routers/ar.ts:5166` `getOpenPromise` query.
- `client/src/components/LogCallDialog.tsx:69,351-358` — banner rendering.
- Probe scripts: `scripts/probe-pending-promises.py`, `scripts/probe-dynacom-promise.py`.

## Architecture note the user confirmed

The screen reached from Collections Desk is **not** the customer's master record;
it is the receivables/collections management view (balances, overdue, promises,
tasks, communication history). The customer entity itself (companies, vessels,
contacts, departments, gifts) lives in **Address Book**. The user agreed with this
description. A possible future improvement (not yet approved): unify both into one
customer card with "Receivables" and "Details" tabs.
