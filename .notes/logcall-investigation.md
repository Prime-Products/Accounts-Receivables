# Log Call error investigation (user request 30/7)

## User's request (Greek, paraphrased)
1. "Όταν πατάω log call μέσα από τον πελάτη βγαίνει error" — Log Call from the customer (card) errors.
2. When pressing new Log Call from a group and there is ALREADY an active communication log call/task,
   ask the user: open the existing task OR create a new log call. What if they want a third?
3. Question: when a log call is created from the group, is a task also created?
4. User asked for help structuring their thoughts (flow design).

## Findings so far
- LogCallDialog used in: client/src/pages/Customers.tsx:172 (ConfirmationBadge), GroupDetail.tsx:156 (ActionsMenu "Log Call" green button), GroupDetail.tsx:241 (GroupConfirmationBadge).
- CustomerDetail.tsx has NO Log Call entry point (grep found nothing) — "μέσα από τον πελάτη" likely means GroupDetail page (group card) or the company view.
- GroupDetail ActionsMenu passes companies + defaultCustomerId; GroupConfirmationBadge passes NO defaultCustomerId (line 241).
- LogCallDialog handleSubmit requires confirmationStatus; builds logData {group, outcome, confirmationStatus, notes, customerId?, contactId?/contactName?, Confirmed→amount/promisedDate/promiseMode, Pending Follow-up→amount/followUpDate}.
- Browser console errors seen (old, Jul 28-29): DB failed queries on invoices list & tasks list (transient), FileSignature undefined in Home.tsx (fixed earlier?). No recent LogCall-specific error captured yet in logs.
- Need to reproduce: open a group page, click Log Call, submit. Also check calls.logCall procedure server-side for group-not-found/oversized errors.
- GroupConfirmationBadge (GroupDetail.tsx:201) hasLinkedTask only checks status "Pending Follow-up"/"Confirmed" — NOT "Escalated" (may need updating after Escalated status added).

## More findings (round 2)

## User clarification (round 3)
- Error happens ONLY from green "Log Call" button in the group card, and ONLY when an active log call / communication already exists. Fresh group works fine.
- Suspects: getOpenPromise / getOpenFollowUpTask / reschedulePromiseId path in LogCallDialog when openPromise exists → "Confirmed" flow with promiseMode=reschedule; or upsertFollowUpTask; or something renders openPromise/openFollowUp and crashes (e.g. null field access).

## BUG FOUND (round 4)
- LogCallDialog.tsx line 191: `<SelectItem value="">All companies</SelectItem>` — EMPTY STRING value.
  Radix Select throws runtime error: "A <Select.Item /> must have a value prop that is not an empty string".
  This renders when `companies.length > 1` (group card passes companies). Template's Common Pitfalls explicitly forbids empty SelectItem values.
  BUT: would crash always, not only when a log call exists... unless the crash shows only when combined with openPromise render (openPromise.promisedDate/amount null?).
- Also suspect: line 305 `new Date(openPromise.promisedDate)` and `Number(openPromise.amount)` — if promisedDate null → Invalid Date (no crash). `openPromise.customerName` might be undefined — no crash.
- openFollowUp render section not yet reviewed (lines ~330-400) — check for `.toLocaleDateString` on null followUpDate.
- FIX plan: replace empty-string SelectItem with value="all" sentinel; guard null dates; review openFollowUp block.
- server logCall procedure (ar.ts:4065): throws BAD_REQUEST if Confirmed without promisedDate, or Pending Follow-up without followUpDate. LogCallDialog sends promisedDate only `promisedDate ? ... : undefined` — if the user picks Confirmed but leaves the date empty → server error toast. Same for follow-up. LIKELY the visible "error".
- ConfirmationBadgeButton (Customers.tsx:89): loads members via customers.list on click; defaultCustomerId = biggest openBalance member. Renders fine.
- Cannot reproduce via browser: app requires Manus OAuth login of the user (sandbox browser lands on login wall). Must rely on code analysis + vitest.
- LogCallDialog handleSubmit only validates `confirmationStatus` presence — does NOT validate promisedDate/followUpDate client-side → server throws → toast error. FIX: client-side validation + keep dates required in UI.
- ALSO check: confirmationStatus enum on client may still send old value "Not Confirmed Payment"? (renamed to Broken) — verify enum sync between shared/schema and dialog.

## Current logcall→task behavior (to explain to user)
- Log Call with "Confirmed" (Promise to Pay) → creates promise + check task on promised date + badge Confirmed.
- Log Call with "Pending Follow-up" → creates follow-up-call task on followUpDate + badge.
- Log Call "Not Contacted"/plain reached/no-answer → no task.
- Badge click on group/customers list: if linked open task exists → opens TaskDetailDialog instead of LogCallDialog (already implements "open existing task" idea partially).

## Design proposal to give user (multi log call)
- Keep: badge = single current communication state, one active auto task per group.
- When user presses "Log Call" (green button) while an active communication task exists:
  show a small dialog: "Υπάρχει ενεργή επικοινωνία (task #X — Promise/Follow-up). Άνοιγμα task / Νέο log call".
- New log call always allowed (multiple calls per month are normal), but if its outcome changes status,
  the old auto-task is cancelled/replaced (already existing behavior via cancelStaleArtifacts).
- Third+ call: same rule — the dialog always offers "open active task" or "log another call". No limit.
- So: log calls = history (many), active communication case = one at a time (badge + one open task).
