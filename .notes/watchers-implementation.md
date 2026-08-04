# Task watchers with avatar stack — implementation state (30/7, user approved mockup)

## Requirement (approved)
- Watchers = team members following a task's progress; shown as overlapping initial-avatars (colored circles) with +N counter when >3.
- Shown in: Tasks list column, TaskDetailDialog (with + button to add and ✕ to remove), Escalate form (multi-select chips under "Assign to").
- Mockup file: /home/ubuntu/mockup/watchers-mockup.html (rendered PNG approved by user).

## Progress
- [x] drizzle/schema.ts: added `taskWatchers` table (task_watchers: id, taskId, memberId → team_members.id, createdAt, idx_task_watchers_taskId), after taskInvoices (~line 237).
- [x] Migration 0035 generated and APPLIED to DB (table task_watchers exists).
- [x] server/db.ts: listTaskWatchers, listWatchersForTasks, addTaskWatcher (dedupes), removeTaskWatcher — after deleteTaskComment (~line 423); taskWatchers imported.
- [x] server/routers/ar.ts: tasks.watchers query + tasks.addWatcher + tasks.removeWatcher (after `comments`); tasks.list returns watchers: [{memberId,name,title}]; escalate input watcherIds?: number[] — carries original watchers + picked onto NEW escalated task (excludes assignee); createNextTask carries watchers to new follow-up task.
- [x] client/src/components/WatcherStack.tsx created (watcherColor/watcherInitials exports, Tooltip, props {watchers, max=3, size sm|md}).
- [ ] TaskDetailDialog: watcher stack + add (popover with team member select) / remove (✕).
  → DONE: Watchers section under Assignee (WatcherStack + Popover picker + remove list); state watcherPickerOpen/teamMembers/addWatcher/removeWatcher/escWatcherIds after reschedulePromise mutation.
- [x] TaskDetailDialog escalate panels (BOTH promise ~line 597 and follow-up ~line 854): watcher chips + watcherIds passed to escalateTask.mutate.
- [x] Tasks.tsx: Watchers column with WatcherStack (col 110px between assignee/due).
- [x] Vitest: server/taskWatchers.test.ts — 4 tests, all pass; full suite 247 pass.
- [x] todo.md items under "## Task watchers with avatar stack".

## Key facts
- TaskDetailDialog.tsx: escalate panels at TWO places (~line 511 promise section, ~line 743 follow-up section); escalate buttons setFuMode("escalate") ~410 and ~589; escalateTask.mutate calls ~531 and ~763 (add watcherIds to both); fuMode state line 96, reset effect line 104; TeamMemberSelect exists (@/components/TeamMemberSelect); imports at line 11 (lucide).
- team list: trpc.team.list ({includeInactive}) — teamRouter ar.ts ~3167.
- tasks router: server/routers/ar.ts (tasksRouter exported; escalate at ~line 3052).
- escalate creates new task titled "Escalated: ..." and sets group status "Escalated"; createNextTask (~line 2900) closes escalated tasks as Completed when rolling into a new promise/follow-up.
- Team members list: db.listTeamMembers presumably; team page = client/src/pages/Team.tsx; teamMembers table in schema line 46 (name, email, phone, title, active).
- Tests: 243 passing currently; full suite takes ~3min.
- IMPORTANT fixture rule: tests must never touch real customers (see testFixtures.ts header).
