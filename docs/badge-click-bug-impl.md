# Bug: status badge click inconsistency (user report 30/7)

User: in groups list, clicking "Pending" badge on MINERVA opens Log Call dialog,
but on REEDEREI it opens the task detail. Same status should behave the same.

## Root-cause area
client/src/pages/Customers.tsx — `ConfirmationBadgeButton` (lines ~87-156):
- `hasLinkedTask = taskId != null && (status === "Confirmed" || status === "Pending Follow-up")`
- If hasLinkedTask → opens TaskDetailDialog; else → LogCallDialog.
- So MINERVA's "Pending Follow-up" badge has NO linked taskId in the groups payload,
  while REEDEREI's does. Need to check server: how groups list resolves taskId
  for each group's confirmation status (server/routers/ar.ts, taskOverdue comment
  near line 77; group confirmation join logic).
- MINERVA has an open follow-up task 5220003 ("Follow-up call — MINERVA (MARTINOS)")
  and EVALEND 5220002, REEDEREI 4860001 per earlier SQL. So the task EXISTS for
  MINERVA — the linkage (group_confirmation_status.taskId? or matching by title?)
  is what's missing/stale.

## DB facts (from earlier queries)
- tasks Pending with '(Follow-up: ' marker: 4860001 REEDEREI NORD (GERMANY),
  5220002 EVALEND (TANKERS), 5220003 MINERVA (MARTINOS).

## ROOT CAUSE (confirmed via SQL)
- MINERVA (MARTINOS): group_confirmation_status = "Pending Follow-up" (fu 31/7) but its
  follow-up task 5220003 is CANCELLED (also old PTP task 90001 cancelled). The groups
  query links tasks via openAutoTasks description markers "(Follow-up: <group>)" /
  "(Promise #<id>)" — only OPEN tasks. No open task → confirmationTaskId=null → badge
  falls back to LogCallDialog (ConfirmationBadgeButton in Customers.tsx ~line 131).
- REEDEREI NORD (GERMANY): task 4860001 Pending → badge opens the task. Correct.

## USER REQUIREMENTS (30/7 messages)
1. Badge click: NEVER open Log Call directly; always open the linked task.
2. Log Call opens only when a task is resolved Kept or Not paid (the next-step flow).
3. Resolving Kept/Not paid must auto-update group confirmation status:
   Kept → "Kept"; Not paid → "Broken".

## FIX PLAN
A. Backend: when a follow-up task is cancelled (updateStatus→Cancelled or convert flow),
   OR when the groups query finds status Pending Follow-up/Confirmed with NO open linked
   task → treat status as stale: either reset to "Not Contacted" (with activity log) or
   auto-create is wrong; choose RESET on groups query read? Prefer: sync at write time
   (task cancelled → reset group status if it was Pending Follow-up and no other open
   follow-up task). Also keep a read-time fallback: badge with no open task renders as
   plain (non-link) or opens the most recent task incl. cancelled.
B. VERIFIED: forecast.updatePromise (ar.ts ~3219) already syncs Kept→Kept / Broken→Broken
   when conf.status === "Confirmed", and auto-completes the linked PTP task. Also
   createNextTask resolves promise + sets next status. So requirement 3 mostly done —
   ONLY GAP: tasks.updateStatus (plain Cancel/Done buttons, ~2629) does NOT sync the
   group status when a follow-up/PTP task is cancelled → stale "Pending Follow-up"
   (that's exactly MINERVA: task 5220003 Cancelled, conf still Pending Follow-up).
C. Frontend ConfirmationBadgeButton: remove LogCallDialog fallback for
   Pending Follow-up/Confirmed statuses; open task detail (even resolved last task)
   or show toast if none. Other statuses (Not Contacted/Broken) keep Log Call.
D. Vitest: cancel follow-up task → status resets; resolve Kept/Broken → status synced.
