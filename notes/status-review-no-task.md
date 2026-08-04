# Reviewing customer status without creating a task

## Why
Today a status only changes through Log Call, and two statuses (Promise to Pay,
Pending Follow-up) always spawn a task. So "I checked this account, nothing is
pending" has no cheap way to be recorded, and the desk shows 185 calls against
1 open task and 16 statuses.

## Server
`calls.reviewStatus` — single group; `calls.reviewStatusBulk` — many groups.
Both accept only `Not Contacted | Broken | Kept`, i.e. statuses that imply no
pending work. They:
- upsert the status with amount 0 and no follow-up date
- run `cleanupStatusArtifacts` so an earlier follow-up task/promise is cancelled
- write a `status_change` activity log line ("Status reviewed — …")
- write an audit entry, and never create a task

Task-backed statuses (Confirmed / Pending Follow-up / Escalated) are rejected on
purpose: those must keep going through Log Call so promise + check task are
created together.

## Payload
`customers.groups` now also returns `confirmationUpdatedAt` and
`confirmationUpdatedBy` (team member name, falling back to the user account) so
review freshness is visible in the list.

## UI
Collections Desk badge is now split: the badge itself keeps its old behaviour
(open the linked task / reset a stale status / log a call), and a caret opens a
review menu with the three no-task statuses, a "Log a call instead…" escape and
the "Last reviewed <date> by <name>" line.

## Remaining
- bulk review from selected rows
- filter/sort by review freshness (stale statuses)

## Contact tracking (phase 4/5)
- `No Answer` in Log Call now records a contact attempt: `confirmationStatus` is
  sent as `undefined`, the response select is disabled, an explanatory panel is
  shown, and the activity line says "Contact attempt — no one answered; status
  unchanged". No task, no status change.
- `db.callSummaryByGroup()` aggregates the `call` activity rows once per request
  into lastCallAt / lastCallBy / calls / noAnswer per group.
- `customers.groups` exposes `lastCallAt`, `lastCallBy`, `callCount`,
  `noAnswerCount`.
- Collections Desk has a "Last Contact" column (LastContactCell): "today /
  yesterday / Nd ago", the caller's name, unanswered count, amber when never
  called or older than 14 days.
