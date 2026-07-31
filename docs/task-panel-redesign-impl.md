# Unified "what happens next?" task panel redesign (30/7)

User request (with screenshot): both Promise to Pay and Pending Follow-up tasks should
show the same card-style action panel (icon + title + description cards) like the
Follow-up panel: Reschedule / Convert to Promise to Pay (follow-up only) / Escalate /
Done — schedule next step. NO invoice-check list on the Promise to Pay flow.

## File: client/src/components/TaskDetailDialog.tsx (884 lines pre-edit)
- Promise panel: `task.promise && (...)` block ~line 331; action area at
  `task.promise.status === "Pending" && isTaskOpen` (~line 368).
- Follow-up panel: `task.description?.includes("(Follow-up: ")` block ~line 592 —
  this already has the card-style menu (reference design, keep as-is).
- fuMode state union: "none" | "reschedule" | "promise" | "escalate" | "reschedule-promise" | "next-task".
- openInv query (tasks.groupOpenInvoices) enabled when fuMode === "next-task" — after
  removing PTP invoice list, it is still used by the follow-up next-task panel.

## DONE so far
- Replaced the small 3-button row in the promise panel with 3 stacked cards:
  Reschedule (blue), Escalate (red), Done — schedule next step (violet),
  plus header "Promise — what happens next?".
- Removed the open-invoice picker from the PROMISE next-task flow (kept resolveAs step 1
  Kept/Not paid + step 2 next type + amount/date/notes fields).
- Follow-up panel keeps its invoice picker (only PTP loses it per user).

## COMPLETED
- Kept/Not Confirmed quick buttons remain above the cards (unchanged).
- Tasks.tsx: replaced its 220-line inline task dialog with the shared <TaskDetailDialog>
  (the inline one lacked the action panels entirely) — removed unused state/mutations
  (setPromiseStatus, reschedule, editingDue, newDue, nextActionGroup, openTask, promiseStatusColors)
  and unused imports. Deep link /tasks?task=<id> still works.
- Verified via screenshots: PTP task 5310001 shows card panel (Reschedule/Escalate/Done),
  follow-up task 5220002 shows 4-card panel. tsc clean, all 229 tests pass.

## Backend contract (no changes needed)
- createNextTask: amount required only for nextType==="promise"; resolvePromise optional.
- convertFollowUpToPromise / reschedulePromise need positive amount.
- groupOpenInvoices is an optional prefill helper only.
