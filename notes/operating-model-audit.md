# AR Pro — audit of what is built today (basis for the operating model)

## Screens (sidebar order)
| Screen | Route | Purpose as built |
|---|---|---|
| Dashboard | `/` | KPI overview: target, collected, overdue, DSO, aging, forecast chart |
| Collections Desk | `/customers` | The working list. Groups & Companies views, confirmation status, promised amount, Last Contact, filters, forecast |
| Address Book | `/address-book` | Directory: groups, companies, vessels, contacts + data quality + custom fields |
| Invoices | `/invoices` | Invoice level detail, aging |
| Vessels | `/vessels` | Vessel records |
| Contracts | `/contracts` | Contracts + installments |
| Tasks | `/tasks` | Task list (follow-ups, promises, escalations) |
| Wire Transfers | `/wire-transfers` | Incoming payments, manual allocation |
| Reports | `/reports` | Reporting |
| Team | `/team` | Team member records (name/email/title), assignment targets |
| Settings | `/settings` | Config |

Card pages: `/groups/:name` and `/customers/:id`, each with Receivables + Details tabs.

## Collaboration primitives already in the schema
| Table | What it is for | Used? |
|---|---|---|
| `users` | Auth accounts (Manus OAuth) | 7 accounts |
| `userProfiles.appRole` | Administrator / Accounting / Credit Controller / Management | exists |
| `teamMembers` | In-app collaborators, **login optional**, `userId` links to an auth user | 3 active, **0 linked to a login** |
| `tasks.assigneeId` | Task ownership → FK team_members | 17 tasks assigned |
| `taskComments` | Discussion thread on a task | **0 rows** |
| `taskWatchers` | Avatar stack of members following a task | present |
| `taskInvoices` | Invoices attached to a task | present |
| `groupNotes` | Free-text notes per group | present |
| `groupCollectionProfile` | Per-group calling particularities (best hours, quirks) | present |
| `requests` / `requestResponses` / `requestNotifications` | **Ask another department a question about a customer, with read/unread notifications** | present — this is the closest thing to internal messaging already built |
| `activityLog` | Timeline of calls, promises, status changes | 185 calls |
| `auditLogs` | Who changed what | present |

### Key finding
A structured internal-communication mechanism **already exists**: `requests` —
a question about a customer, addressed to a department, with responses and
per-user unread notifications. It is not a chat; it is a request with an owner
and a status. This is the natural home for team communication, and it is
already wired to a customer/group.

The gap is not "no messaging". The gaps are:
1. `teamMembers` are not linked to logins → the app cannot say "this is mine".
2. No single place showing "what needs me" (requests + assigned tasks + mentions).
3. Discussion is attached to tasks, but the team works per *customer*.

## Is "one task per Log Call" correct? — the data says: not as built

| Measure | Value |
|---|---|
| Calls logged | 193 |
| Tasks in total | 324 |
| Tasks carrying a promise marker | 287 |
| Tasks carrying a follow-up marker | 31 |
| **Pending tasks right now** | **1** |
| Completed tasks | 29 |
| **Cancelled tasks** | **294** |
| Promises: Kept / Broken / Pending | 11 / 273 / 0 |
| Task comments | 0 |
| Group notes | 170 |
| Requests (ask-a-department) | 0 |

**91% of tasks ever created were cancelled**, and the cancellation notes show the
cancellations were *automatic*, not decisions:
- "Promise check task cancelled (status → Not Contacted)"
- "Follow-up task cancelled (status → Confirmed)"
- "Promise check task cancelled (status → Broken / Pending Follow-up)"

### Interpretation
The task is being used as a **side effect of the status**, not as a unit of work.
Every time the status changes, the previous task is voided and a new one is
minted. The task list therefore holds no useful information (1 pending item out
of 324), while the status field and the activity log hold everything.

Two distinct concepts are being conflated:
1. **State** — "where do I stand with this customer" → belongs to the status +
   activity log. Cheap, always true, no lifecycle.
2. **Work** — "somebody must do something by a date" → belongs to a task. Has an
   owner and a deadline, and should only exist when a person is on the hook.

Auto-creating (2) every time (1) changes produces churn. It also explains
273 "Broken" promises: a promise gets marked broken when its generated check
task dies, not necessarily because the customer failed to pay.

### What should stay automatic
- The **status change** (already the case).
- The **activity log line** (already the case).

### What should become deliberate
- Creating a task. Only when there is a real next action with a date and an
  owner — which matches the user's own stated preference ("tasks should not be
  created automatically; manually creatable from a group or a customer").

## "If I don't create a task, how will I know when to call again?"

Valid objection — but the recall date is **already stored twice, independently of
any task**:

| Where | Column | Rows today |
|---|---|---|
| `promises_to_pay` | `promisedDate` | **284** promises carry a date, **207 in the future** |
| `group_confirmation_status` | `followUpDate` | set when status is Pending Follow-up |

So the date is never lost when a task is cancelled. What is missing is not the
date — it is a **screen that shows the dates as a calling schedule**.

Today the only surface that reads those dates as "who do I call today" is the
Tasks list, which is why the task feels indispensable. But the Tasks list is a
*derived* view of a date the promise already owns.

### The fix: a "Call Back" schedule driven by the dates themselves
A single list, ordered by date, built from:
- promises whose `promisedDate` is today or earlier and still Pending,
- statuses whose `followUpDate` is due,
- overdue groups never contacted.

Nothing to cancel, nothing to reschedule, nothing to go stale. Changing the date
in the Log Call changes the schedule. This is what the user actually wants from
the auto-task, without the 91% churn.

A task remains available and useful for the other case: *delegating* work to a
colleague ("Nikos, send the SOA and chase legal") — work that has an owner and
is not simply "call this customer again on date X".

## "Where do I see the notes I wrote in the Log Call?"

The notes are saved (never lost), but they are written to up to **four** places
at once and shown in only **one**, truncated.

Where `logCall` writes the note text:
1. `activity_log.description` — joined with " · " alongside the outcome/contact.
2. `promises_to_pay.notes` — when the outcome is Promise to Pay.
3. `group_confirmation_status.notes` — on the status row.
4. The generated task's description — which then gets cancelled.

Where they are actually visible:
- **Only** the group card → Receivables tab → activity timeline
  (`ActivityLog.tsx`, used only by `GroupDetail.tsx`), and there the text is
  clamped to **two lines** (`line-clamp-2`) with no way to expand.

Consequences:
- On the **company** card (`CustomerDetail.tsx`) there is no activity timeline at
  all — a call logged against a company is invisible on its own card.
- A note longer than two lines is silently cut.
- The notes are not searchable anywhere.
- 170 `group_notes` rows exist as a separate, parallel notes system.

### Fix
- Show the full note (expandable), not clamped.
- Put the same activity timeline on the company card.
- Show the last call note inline on the Call Back list, so context is present
  before dialling.
- Make notes searchable.
