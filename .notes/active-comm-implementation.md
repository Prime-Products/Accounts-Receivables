# Active-communication choice step — implementation state (30/7)

## Done
- server/routers/ar.ts: added `getActiveCommunication` in callsRouter (line ~4221) — returns {status, taskId, title, dueDate, amount} | null for Pending Follow-up / Confirmed / Escalated (uses task markers "(Follow-up: group)" / "(Promise #id)" / "Escalated:" title + customer group).
- client/src/components/LogCallLauncher.tsx: new component — controlled open/onOpenChange; queries calls.getActiveCommunication when open; if none → renders LogCallDialog directly; if exists → choice dialog ("Open the task" → TaskDetailDialog, "New log call" → LogCallDialog).

## Remaining
- Wire LogCallLauncher into GroupDetail.tsx: two LogCallDialog usages (line ~156 GroupActions with defaultCustomerId, line ~241 GroupConfirmationBadge - only opens when NOT hasLinkedTask, so badge path may not need launcher — but keep consistent: replace both).
  - Customers.tsx ConfirmationBadgeButton (line ~172): opens LogCallDialog only when badge has NO linked task → active comm unlikely but Escalated status may not set hasLinkedTask there; check taskId prop includes escalated. Decision: replace in GroupDetail green button (main entry). Badge paths already route to task when linked; leave badges as-is to avoid double-step.
- TS check + vitest for getActiveCommunication (server/activeCommunication.test.ts).
- todo.md items under "## Active-communication choice step before Log Call (user request 30/7)".
- Checkpoint + deliver in Greek.

## Key facts
- calls router file: server/routers/ar.ts `export const callsRouter = router({` line 3940; namespaced as trpc.calls.*
- GroupDetail green Log Call button: GroupActions component line ~116 `setCallOpen(true)`, dialog rendered line ~156.
- Statuses: "Confirmed" = Promise to Pay label; labels via confirmationStatusLabels in client/src/lib/format.ts.
