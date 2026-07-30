# Escalation workflow rework (31/7)

## Design
1. **Escalation summary** — new protectedProcedure `tasks.escalationSummary({taskId})`:
   computed live from group data (no schema change): open balance EUR, overdue EUR + count,
   promise history (total/kept/broken + total reschedules), recent activity log (last 8),
   escalation reason (parsed from task description ⬆ line). Shown only for tasks whose
   title starts with "Escalated: ".
2. **Decision actions** — new procedure `tasks.escalationDecision({taskId, decision, note})`
   decision ∈ {"On Hold","Legal Review","Return to Collector"}.
   - On Hold → setGroupWatchStatus(group,"On Hold"), task stays open, note+activity log.
   - Legal Review → setGroupWatchStatus(group,"Legal"), task stays open, note+activity log.
   - Return to Collector → reassign task back to originating collector (parsed "by <user>" or
     explicit returnToMemberId param; fallback: original task creator's linked team member),
     due today, note appended, activity log. Management stays as watcher.
   Store decision marker in task description: "⚖ Decision: <decision> by <name> on <date> — note".
3. **On Hold / Legal statuses** — REUSE existing groupWatchStatus enum (already has
   "On Hold" and "Legal") + existing Customers list badges/filters (already implemented!).
   Only need: escalationDecision writes these statuses + GroupDetail WatchStatusSelect already handles.
4. **Auto-watcher**:
   - escalate: add ctx.user's linked team member (teamMembers.userId === ctx.user.id) as watcher on new task.
   - tasks.create: if assigneeId set and != creator's member id → creator member becomes watcher.

## Findings
- watchStatuses enum already includes "On Hold" & "Legal"; Customers.tsx already has on-hold/legal filters & badges.
- Escalate proc at ar.ts:3089; tasksRouter at 2584.
- Team member link to user: teamMembers.userId.
- Original collector: escalation note format "⬆ Escalated to X by <userName> on date". Better: pass originMemberId explicitly — store in new task description as "(Escalated-by: <memberId>)" marker for reliable Return to Collector.

## Progress (backend DONE, tsc clean)
- db.ts: added getTeamMemberByUserId(userId)
- ar.ts escalate: added (Escalated-by: <memberId>) marker in new task description + escalator auto-watcher
- ar.ts tasksRouter: added escalationSummary (query, {taskId}) and escalationDecision (mutation {taskId, decision: "On Hold"|"Legal Review"|"Return to Collector", note?, returnToMemberId?})
- ar.ts tasks.create: creator auto-watcher when assigneeId != creator member
- setGroupWatchStatus signature: (groupName, status, updatedBy) — "On Hold"/"Legal" valid
- Customers.tsx already has on-hold/legal filters & badges (line ~370, 603)

## Frontend TODO (next)
- TaskDetailDialog.tsx: for tasks whose title starts with "Escalated: " and open status:
  - show Escalation Summary panel (trpc.tasks.escalationSummary.useQuery)
  - show 3 decision buttons: On Hold/Stop Services (Pause icon), Legal Review (Scale icon), Return to Collector (ArrowLeft icon)
  - each opens small confirm w/ optional note textarea; Return to Collector shows TeamMemberSelect fallback only if server errors w/o marker (simpler: always allow optional member select prefilled null)
  - use trpc.tasks.escalationDecision.useMutation; invalidate tasks.list + customers.groups + groupDetail
- After decision On Hold/Legal show recorded decision line (summary.decision)
- Tests: server/*.test.ts add vitest for escalationSummary + escalationDecision (see existing followUpActions tests pattern)
- Design: follow ar-pro-design-system "What happens next?" card-style action buttons
