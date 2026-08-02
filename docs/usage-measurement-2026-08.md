# AR Pro — measured usage snapshot (02 Aug 2026)

Raw numbers taken from the live development database after the test-residue
cleanup. Kept as the factual basis for the operating-model document.

## Data volume per table

| Table | Rows | Reading |
|---|---|---|
| customers | 3,409 | ERP + CRM import |
| invoices | 5,424 | ERP import |
| payment_contacts | 7,762 | CRM import |
| audit_logs | 634 | real user actions only (53,147 test rows removed) |
| forecast_entries | 721 | smart forecast in use |
| payment_behavior | 614 | computed from payment history |
| email_history | 990 | Outlook-drafted chasers logged |
| wire_transfers | 8 | in real use, small volume |
| promises_to_pay | 7 | live promises |
| activity_log | 28 | unified timeline entries |
| group_confirmation_status | 7 | only 7 of 363 invoiced groups have a status |
| tasks | 4 | very low — task list is barely populated |
| contracts / installments | 1 / 3 | pilot data only |
| group_notes / note_mentions | 0 / 0 | notes + @mentions never used |
| task_comments | 0 | task discussion never used |
| task_watchers | 2 | watching barely used |
| receipts, payment_bank_details, collection_plans, on_hold_proposals, email_templates, sync_logs | 0 | empty |

## Group coverage

- 2,961 distinct groups exist in the directory
- 363 groups have invoices (the actual collections universe)
- 257 groups have overdue invoices today
- 2,483 groups have at least one contact
- 7 groups have a confirmation status recorded

## People

Team members (Team screen): Kostas Vanos (Director), Faye Vanou (Credit Manager),
Theofilos Makris (Account Manager) — none linked to a login user (`userId` null).

Auth users: 7 (Kostas admin; Lena Varsami, Tsouflias Konstantinos, Evaggelia
Theologou, Socrates Gekas, Maria Theologou, Faye Vanou as `user`).

Real recorded activity per person:

| Person | Actions | Last action |
|---|---|---|
| Kostas Vanos | 607 | 2026-08-02 |
| Lena Varsami | 10 | 2026-07-28 |
| Maria Theologou | 6 | 2026-07-31 |
| Tsouflias Konstantinos | 6 | 2026-07-31 |
| Spot | 5 | 2026-07-29 |

## What real users actually do (top actions)

Log Call 117 · Create Task 79 · Task Cancelled 74 · Record Promise-to-Pay 48 ·
Task Completed 23 · Allocate Wire Transfer 22 · Export SoA PDF 21 ·
Promise Broken 16 · Generate Group AI Summary 16 · Reset Stale Confirmation 14 ·
Cancel Promise 12 · Escalate Task 11 · Set Watch Status 11 · Create Wire
Transfer 10 · Ask AI Assistant 10 · Update Confirmation Status 9 · Generate
Smart Forecast 8

Barely touched (1–3 uses): Create Contract, Update/Create Team Member, Reschedule
Promise, Clear Dispute, Add/Remove Watcher, On-Hold proposals and transitions,
Run Task Engine, Set Account Status, Set Collector, Set App Role, Escalation
Decision, SoA xlsx export.

## Screens as built (13 pages, 45 components)

Dashboard (`/`), Collections Desk (`/customers`, Groups + Companies tabs),
Group detail (`/groups/:name`), Customer detail (`/customers/:id`),
Address Book (`/address-book`), Invoices, Vessels + Vessel detail, Contracts,
Tasks, Wire Transfers, Reports, Team, Settings. `/call-back` and `/forecast`
redirect into the Desk (folded in earlier).

Code weight: GroupDetail 1,454 lines · Customers 1,145 · AddressBook 1,052 ·
WireTransfers 890 · CustomerDetail 656 · Invoices 638. Server: `routers/ar.ts`
5,428 lines, `routers/addressBook.ts` 1,352.

## Collaboration model as built

| Capability | Where it lives | Rows in use |
|---|---|---|
| Unified timeline (calls, notes, emails, promises) with All/Calls/Notes/Emails filter tabs | `CommunicationTimeline.tsx` on the group page | 28 |
| Collection notes with `@` picker | `CollectionNotesBox.tsx`, `LogCallDialog.tsx` (`MentionTextarea`) | 0 notes, 0 mentions |
| Mentions inbox with unread badge | `MentionsInbox.tsx` in the sidebar | 0 |
| Task comments thread | `TaskCommentsThread.tsx`, `TaskDetailDialog.tsx` | 0 |
| Task watchers | `WatcherStack.tsx`, Tasks page | 2 |
| Escalation panel | `EscalationPanel.tsx` | 3 escalation decisions |
| Team directory | `Team.tsx`, `team_members` | 3 members, none linked to a login |
| App roles | `users.role` (admin/user) | 1 admin, 6 users |

Two identity lists coexist: `team_members` (3, directory/assignment labels) and
`users` (7, real logins). `team_members.userId` is null for all three, so
"Faye Vanou the team member" and "Faye Vanou the login" are not the same record.

## GitHub commit `f781da7` ("Context-Centric Activity Feed with @mentions")

Not present in the working project and not needed: everything it introduced was
re-implemented and extended later.

| That commit | Current equivalent |
|---|---|
| `ActivityFeed` replacing `ActivityLog` on GroupDetail | `CommunicationTimeline.tsx` (calls, notes, emails, promises in one stream) |
| `activityLogRouter.listByGroup` / `addNote` | `ar.addGroupNote` + the timeline query in `routers/ar.ts` |
| Inline note composer with @mentions | `CollectionNotesBox` and `LogCallDialog` via `MentionTextarea`, plus `note_mentions` and the sidebar inbox |
| Filter tabs All / Notes / Calls / Emails | same tabs in `CommunicationTimeline` (lines 52–56) with per-tab counts |
| Relative timestamps, timeline UI | present |

Decision: leave it abandoned on the remote branch; do not merge or cherry-pick.
