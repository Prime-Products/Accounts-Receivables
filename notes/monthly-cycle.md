# Monthly cycle — how it works TODAY (read from code 2026-08-02)

Kostas's operating reality: "κάθε μήνα τρέχουμε το forecast και ξεκινάει όλη η
δουλειά. Τα status γίνονται reset κάθε μήνα, εκτός αν έχει follow-up ή promise."

## Implemented rule — `isConfirmationStale()` in server/routers/ar.ts:128
There is NO scheduled job and NO stored month key. The reset is **computed on
read**: a status row is treated as `Not Contacted` when it is "stale".

| Status | Behaviour at month change |
|---|---|
| `Not Contacted` | always stale (nothing active) |
| `Kept` | **resets** to Not Contacted if `updatedAt` is in a previous month |
| `Broken` | **resets** to Not Contacted if `updatedAt` is in a previous month |
| `Confirmed` | **carries over**, flagged `carriedOver: true` |
| `Pending Follow-up` | **carries over**, flagged `carriedOver: true` |
| `Escalated` | **carries over**, flagged `carriedOver: true` |

Helpers:
- `isFromPreviousMonth(updatedAt, now)` — UTC year/month comparison (ar.ts:145)
- `effectiveConfirmation(row)` → `{ status, amount, stale, carriedOver }` (ar.ts:160).
  When stale it returns `Not Contacted` / amount 0 — the raw row is NOT mutated.
- `isTaskOverdue(task)` (ar.ts:152) — open task past dueDate → red badge instead
  of resetting the status.

So the code already matches what Kostas described: closed outcomes reset monthly,
open commitments (promise / follow-up / escalation) survive the month boundary.

## Consequence for the design
The month is the unit of work. Therefore:
1. The Call Back list and the card must show whether a status is **carried over
   from last month** vs **set this month** (`carriedOver` already exists — surface it).
2. Communication history must be readable **per month**, because "what happened
   this cycle" is the question, not "everything ever".
3. `Kept`/`Broken` visually resetting is correct, but the **history must stay** —
   the reset applies to the badge, not the record.
4. Amount confirmed vs forecast is a per-month figure; the card shows
   "Forecast (this month)" / "Remain to Collect (this month)" already.

## DECIDED (Kostas, 2026-08-02): "το τρέχω ξεχωριστά"
The forecast is run separately by the user each month. A promise-to-pay must
**never** write into `forecast_entries` or alter the monthly forecast figure.
A promise dated in a later month only has to:
- carry its status over (already the case), and
- appear in the Call Back list when its date arrives.
No automatic forecast coupling.
