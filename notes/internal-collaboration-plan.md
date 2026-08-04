# Internal user-to-user communication — current state and proposal

## What already exists (no new plumbing needed)

| Piece | Table / file | State |
|---|---|---|
| Auth users | `users` (7 rows), `user_profiles.appRole` | live, Manus OAuth |
| Team members | `team_members` (3 active, **0 linked to a login**) | live, in-app records |
| Task assignment | `tasks.assigneeId` → `team_members.id` (17 assigned) | live |
| Task discussion | `task_comments` + `TaskCommentsThread.tsx` | built, **0 comments written** |
| Task watchers | `task_watchers` | table exists, no UI surface |
| Group notes | `group_notes` + New Note dialog | live, used |
| Activity log | `activity_log` | live, per group/company |
| Owner push notifications | `webdev-owner-notifications` skill | available, unused |

So the missing part is not storage — it is that nothing tells a colleague
"something is waiting for you", and there is no place to talk that is not tied
to a single task.

## Gaps

1. **team_members are not linked to logins** (`linked=0`). A comment or an
   assignment cannot resolve to "the person now signed in", so no inbox is
   possible yet. This must be fixed first.
2. **No notification/inbox.** Comments and assignments are invisible unless you
   happen to open that exact task.
3. **No @mentions.** Cannot pull a specific colleague into a thread.
4. **No discussion on a group/company card** — only on tasks. Most collection
   arguments are about a customer, not a task.
5. **No handover** ("I'm off, take my accounts") and no reassignment trail.

## Proposed flow (mentions + inbox on top of existing tables)

Deliberately not a chat app: collection work is account-centric, so discussion
should hang off the account/task it concerns, with one inbox that guarantees it
is seen.

1. **Identity**: link every `team_members` row to a `users` row (auto-match on
   email at login, manual picker on the Team page). One person = one identity.
2. **Mentions**: `@name` autocomplete in task comments and group notes. Each
   mention writes a `mentions` row.
3. **Inbox**: a bell in the header + `/inbox` page listing, newest first:
   mentions, tasks assigned to me, comments on tasks I own or watch,
   escalations. Unread count on the bell; mark read individually / all.
4. **Discussion on the account card**: reuse `group_notes` as the thread
   (comment box + mentions) on the group/company card, so an argument about
   MINERVA lives on MINERVA.
5. **Assignment is a notification**: assigning/reassigning a task notifies the
   new assignee, and records who reassigned it.
6. **Optional later**: daily digest email, and Manus owner push for escalations.

## Deliberately excluded (for now)

Free-form direct messaging / channels. With 3–7 users it fragments context away
from the account and duplicates what notes and comments already do. If the user
insists, the smallest version is a DM thread reusing the same inbox.
