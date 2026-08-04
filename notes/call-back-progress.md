# Call Back page — build progress

## Done
- `server/db.ts` → `callSummaryByGroup()` now also returns `lastCallTitle` and
  `lastCallNote` (the note text from `activity_log.description`).
- `server/routers/ar.ts` → group rows expose `lastCallOutcome` + `lastCallNote`.
- `server/routers/ar.ts` → new `customers.callBackList` procedure. Derives rows
  purely from stored dates: Pending promise whose `promisedDate <= now`,
  `group_confirmation_status.followUpDate <= now`, and overdue groups with no
  logged call. One row per group (earliest trigger wins). Sorted oldest first,
  ties by overdue amount.
- `client/src/pages/CallBack.tsx` → new page, buckets Overdue / Today /
  Scheduled, shows reason badge, days late, unanswered attempts, promised
  amount, overdue balance, last-call author and the full note. Row actions:
  Log call (opens LogCallDialog bound to the group) and Open card.
- Route `/call-back` + sidebar entry "Call Back" (PhoneCall icon) after
  Collections Desk.

## Observed on first render (screenshot)
244 rows, all bucketed "Today". Two problems to fix:
1. **Never-contacted rows dominate** — every overdue group with no logged call
   appears, so the list is a backlog dump rather than a schedule. Needs to be
   separated from date-driven rows (own bucket, collapsed by default).
2. Bucketing uses `dueDate` for never-contacted rows, which is set to
   `startOfToday`, so they all land in "Today". They have no real due date.

## Next
- [x] Give never-contacted its own collapsed section after the date-driven work.

## SERIOUS data finding (2026-08-02)
`promises_to_pay` has **zero** Pending rows:

| status | count | of which future-dated |
|---|---|---|
| Broken | 273 | **206** |
| Kept | 11 | 1 |
| Pending | **0** | 0 |

206 promises whose `promisedDate` is still in the **future** are marked
**Broken**. A promise cannot be broken before its date arrives. This is the
same root cause as the task churn: the promise status was being driven by the
task/status side effects rather than by the promised date and payment.

Consequence for the Call Back list: the `promise_due` branch can never fire,
because it filters on `status === "Pending"`. The list currently shows only
follow-up dates (2 rows) plus the never-contacted backlog (242).

Needs: (a) find what sets Broken prematurely, (b) repair the 206 rows back to
Pending, (c) only mark Broken when the date has passed and nothing was paid.

## RESOLVED by full test-data wipe (2026-08-02, user: "ολα ειναι τεστ, σβηστα")
Kostas confirmed everything collections-related was test data and asked for a
clean slate. Cleared (row counts before delete):

| table | deleted |
|---|---|
| promises_to_pay | 284 |
| tasks | 324 |
| group_confirmation_status | 14 |
| activity_log | 1908 |
| group_notes | 170 |
| group_watch_status | 85 |
| task_watchers | 51 |
| task_invoices | 10 |
| on_hold_proposals | 2 |
| group_collection_profile | 1 |

**Untouched master data** (verified after): customers 3620, invoices 5635,
vessels 184, payment_contacts 7762, payment_behavior 614, forecast_entries 721,
email_history 871, audit_logs 48684.

Verified on screenshots after the wipe: Call Back (0 due, 252 never contacted,
folded), Collections Desk (all groups "Not Contacted", Last Contact = "never
called", Promised = "—"), Tasks (clean empty state), Forecast unaffected.
No console/runtime errors.
