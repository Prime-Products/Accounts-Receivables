# Rolling Status Flow — implementation notes (working file)

## User requirement (from Greek conversation)
- No full monthly reset of confirmation statuses. Only **Kept** and **Broken** reset to "Not Contacted" at the start of a new month. Active statuses (Confirmed = Promise to Pay, Pending Follow-up) carry over across months with their open tasks.
- From inside any open PTP/Follow-up task, user must always be able to:
  - Close it (mark promise Kept/Broken)
  - Create a NEW next task (new Promise to Pay OR new Pending Follow-up), seeing the group's open invoices with due dates → the OLD task must be cancelled automatically.

## Done (backend)
- `isConfirmationStale` in server/routers/ar.ts (~line 80): now `Kept` OR `Broken` → stale when `isFromPreviousMonth(updatedAt)`. Confirmed/Pending Follow-up never auto-reset.
- `tasks.createNextTask` procedure (in tasks router, before `reschedulePromise`): input { taskId, resolvePromise?: "Kept"|"Broken", promiseId?, nextType: "promise"|"follow-up", amount?, date, notes? }. Resolves promise if asked, cancels old task FIRST (so upsertFollowUpTask doesn't reuse it), then creates next promise (createGroupPromise + upsert conf status Confirmed) or follow-up (upsertFollowUpTask + upsert conf status Pending Follow-up). Returns { success, newPromiseId, newTaskId, group }.
- `tasks.groupOpenInvoices` query: input { taskId } → { group, invoices: [{id, invoiceNumber, customerName, dueDate, amount (outstanding), currency, overdue}] } sorted by dueDate.

## TODO (frontend — TaskDetailDialog.tsx)
- Promise panel (task.promise, ~line 309-446): fuMode options "reschedule-promise" | "escalate" already exist. ADD "Next task" mode: after choosing Kept/Broken (or independent), open panel with:
  - toggle: Promise to Pay / Pending Follow-up
  - open invoices list (trpc.tasks.groupOpenInvoices.useQuery({taskId})) with due dates, clicking an invoice can prefill date/amount
  - date + amount + notes inputs → tasks.createNextTask mutate
- Follow-up panel (~line 448+): existing options Reschedule / Convert to promise / Escalate. ADD "Next task" option too (or reuse createNextTask for the convert action).
- fuMode state union at line 96: add "next-task".
- Replace/augment Kept/Broken direct buttons: after marking Kept/Broken, suggest creating the next task (currently Broken opens NextActionDialog). Keep simple: add a third button "Close & create next task…" that opens the panel where user picks Kept/Broken + next type.

## TODO (tests)
- monthRollover.test.ts may assert old Kept-only reset behavior — update if needed.
- Add tests for tasks.createNextTask (promise→follow-up and follow-up→promise paths; old task cancelled; badge updated).

## Key helpers
- createGroupPromise(ctx, {group, customerId?, amount, promisedDate, notes?}) → promiseId (creates promise + check task w/ "(Promise #id)" marker)
- upsertFollowUpTask(ctx, {group, customerId?, followUpDate, amount?, notes?}) → taskId (marker "(Follow-up: group)")
- Task→promise link: description contains "(Promise #<id>)"; follow-up link: "(Follow-up: <group>)".
- tasks.list returns task.promise {id, promisedDate, amount, status, notes} and (task as any).groupName.
