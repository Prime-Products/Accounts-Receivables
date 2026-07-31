# INCIDENT 30/7 ~10:32 — tasks & promises_to_pay & activity_log wiped

## POST-RECOVERY REGRESSION (11:03): full vitest suite MUTATED restored real rows

### Isolation sweep (done)
### Current state (11:20) — 3 failures being fixed:
1. monthRollover.test.ts:109 escaped-quote syntax error → FIXED via sed.
2. followUpActions.test.ts x2 `customers is not defined` → FIXED (filter by cust.id).
3. confirmationStatus.test.ts:675 "reschedules an existing open promise" —
   getOpenPromise({group}) returns null for fixture group. Likely cause: test earlier
   called updateConfirmationStatus/logCall Confirmed for fixture group; open promise
   lookup might depend on invoices or contacts that fixture lacks, OR the shared __fx
   customer had a previous test in the same file already resolve/cancel its promise
   (shared fixture across tests in file!). Check test at line ~640-680 and consider
   creating a SEPARATE fixture per test (createTestCustomer directly) there.
After green: verify 10 open real tasks + statuses unchanged, screenshot /customers,
/tasks, checkpoint "Badge flow + test isolation + data recovery", push github main,
deliver honest summary (recovery done, what was lost: activity log, promise notes).
User already told: it's samples, "asto den peirazei" — but I restored anyway.
Remaining todo items in todo.md: badge click always opens task; log call only on
kept/not-paid (DONE in earlier session part); status auto-updates on Kept/Not paid
(was already implemented via updatePromise sync — VERIFY).
- Added server/testFixtures.ts (createTestCustomer/cleanupTestCustomer).
- Codemods scripts/fix-test-isolation.py + fix-test-isolation2.py rewrote all
  mutating "pick real customer" patterns in 10 test files to fixture customers.
- Remaining listCustomers() usages are verified read-only or insert-only with
  snapshot cleanup: confirmationStatus:~372 (reads payment contacts),
  followUpActions groupOpenInvoices (creates a task on a real customer, insert-only,
  removed by cleanupSince), taskCollaboration attach-invoices (insert-only),
  watchStatusActivity member-scan (read-only).
- DB rows restored: 6 tasks → Pending, 8 promises → Pending, 8 group statuses
  restored to pre-suite values (MSC Confirmed 7000, PANTHEON Confirmed 9999,
  CAPITAL SHIP Broken, DANAOS/REEDEREI/EVALEND Pending FU, DYNAGAS Kept 2000).
- TODO next: tsc + full suite green, verify 10 open tasks unchanged after suite,
  screenshot badges, checkpoint, push, deliver (incl. honest incident summary).
- After restore (10 open tasks), running `pnpm vitest run` left only 5 open:
  - #2280001 MSC follow-up → Cancelled "Status changed to Not Contacted — follow-up task auto-cancel"
  - #4650003 PANTHEON PTP → Completed "Promise marked Kept"
  - #4860001 REEDEREI follow-up → Completed
  - #5220002 EVALEND follow-up → Completed
  - #5310001 MSC €7,000 PTP → Cancelled (status → Not Contacted)
  - #5640001 DANAOS follow-up → Completed
  Still OK: 5340001, 5400001, 5580001 (+ statuses in group_confirmation_status may now be wrong!)
- Cause: several tests (followUpActions, confirmationStatus, confirmationTaskLink,
  followUpCleanup, groupForecast, watchStatusActivity) operate on LIVE data via
  `customers.find(...)` / `db.listTasks({statuses:['Pending']})` + marker matching,
  and some call procedures that CASCADE to real groups (e.g. cancel-all-follow-ups,
  promise Kept). Snapshot cleanup deletes INSERTED rows but does NOT restore UPDATED rows.
- FIX PLAN:
  1. Re-restore the 6 mutated tasks to Pending + fix group_confirmation_status rows
     (MSC Confirmed €7000 fu 07/08, PANTHEON Confirmed €9999, REEDEREI Pending FU,
     EVALEND Pending FU, DANAOS Pending FU €1332.26, SAFETY Confirmed €6876876 — from
     pre-suite screenshot of /customers and group_confirmation_status query at 10:47).
  2. Make DB-mutating tests SAFE: they must create their OWN customers/groups
     (they mostly do) and NEVER select real rows. The dangerous patterns are tests that
     pick `customers.find(c => c.customerGroup)` (= real customer!) instead of creating
     one. Sweep all *.test.ts for that pattern and replace with created fixtures.
  3. Re-run suite, verify the 10 open tasks + statuses unchanged, then checkpoint.

## What happened
- New file server/confirmationSync.test.ts run #1 FAILED at collection
  (auditLog vs auditLogs import error) → beforeAll threw BEFORE capturing snapshot →
  afterAll STILL ran with snap defaults {task:0,promise:0,activity:0,audit:0} →
  `delete where id > 0` wiped: tasks (0 rows), promises_to_pay (0), activity_log (0).
- audit_logs SURVIVED (20,490 rows — delete failed on wrong import name at that point,
  or ran before the fix). customers=811, invoices=5424, group_confirmation_status=14 intact.
- Test file now fixed: snap is nullable, afterAll returns early if !snap. LESSON:
  cleanup hooks must never delete when snapshot wasn't captured.

## Recovery status
- audit_logs contain 2293 "Create Task" entries with entityId=taskId and details,
  incl. real vs vitest-generated ones (test names contain "Test Co"/"vitest"/random suffixes).
- Real open tasks the user cares about (from earlier queries pre-wipe):
  - 4860001 Pending "Follow-up call — REEDEREI NORD (GERMANY)" desc: "Call REEDEREI NORD (GERMANY) on 29/07/2026 to confirm the expected payment. (Follow-up: REEDEREI NORD (GERMANY))" due 1785283200000-ish (29/07/2026), conf fu=1785283200000
  - 5220002 Pending "Follow-up call — EVALEND (TANKERS)" desc "Call EVALEND (TANKERS) on 31/07/2026 ... (Follow-up: EVALEND (TANKERS))" due 31/07/2026
  - 5220003 Cancelled "Follow-up call — MINERVA (MARTINOS)" (stale case)
  - 4650003 / 5310001 "Promise to Pay — €7,000" MSC SHIPMANAGEMENT LTD (Promise #4950001, promised 31/07/2026, contact Kostas Vanos) Pending
  - 5400001 Promise task (from list of PTP tasks: 4650003, 5310001, 5400001)
  - Others seen in Tasks screenshot (status Pending): "Follow-up call — DANAOS — expecte..." ,
    "Promise to Pay — €9,999" PANTHEON, "Help needed: review 1 invoice(s)" MSC SHIPMANAGEMENT LTD,
    "Help needed: review 1 invoice(s)" CAPITAL SHIP (VANIMAR) assignee Faye Vanou,
    "Promise to Pay — €6,876,876" SAFETY (HATZIOANNOY V), "Follow-up call — REEDEREI NORD (GERMANY)"
- group_confirmation_status (intact) rows can drive rebuild: REEDEREI NORD (GERMANY)
  Pending Follow-up fu=1785283200000; DANAOS/EVALEND were Pending Follow-up too.
- MINERVA already reset to Not Contacted manually (OK).

## Recovery plan
1. Write scripts/rebuild-from-audit.mjs: parse audit_logs Create Task/Create Promise
   entries (details + entityId), skip test artifacts (names like %Test%, %vitest%,
   ms7cu8w1-style random, "FollowUpContact", "PromiseConfSync", "TaskLink"), and
   reconstruct rows with ORIGINAL ids (tasks.id, promises_to_pay.id explicit insert).
2. Then replay status changes: Cancel Task/Task Completed/Task Cancelled/Reschedule/
   Escalate/Assign audit entries to set final status per task.
3. Promises: audit "Create Promise"/"Promise Kept"/"Promise Broken" entries by promiseId.
4. Verify against group_confirmation_status + screenshots; then run full suite; then
   checkpoint + push. BE HONEST with user about the incident.

## audit_logs schema

## Dry-run result (after excluding fixture customer 808)
- 270 promises (11 Pending), 291 tasks (11 Open) — matches pre-wipe reality:
  known ids 90001, 4860001 (REEDEREI), 5220002 (EVALEND), 5310001 (MSC €7,000 / promise
  4950001), 5400001 (SAFETY €6,876,876), 4650003 (PANTHEON €9,999), 5640001 (DANAOS),
  2280001 (MSC follow-up), 5340001/5580001 (Help needed), 180003 (€1,111,000 DYNACOM).
- Notes: promise notes/contact names in descriptions are lost (audit didn't store
  them); "Help needed" tasks reconstructed without description details? (check pattern
  — they matched Manual task "<title>" so desc = title only).
- Old already-Kept/Broken/Cancelled rows are restored too (270/291 incl. history) so
  history pages look reasonable; some cancelled tasks whose Cancel came from hard
  test-cleanup deletes may reappear as open — verified NOT the case here (11 open OK).
- NEXT: run with --apply, verify UI (Tasks page, groups list badges), run stale-badge
  resetter or verify REEDEREI/EVALEND/DANAOS badges now link to restored open tasks.
id, userId, userName, action, entityType, entityId (varchar), details (text), createdAt (timestamp)
- task actions: Create Task x2293, Cancel Task x1083, Update Task x364, Task Completed x291,
  Assign Task x132, Task Cancelled x111, Create Next Task x17, Escalate Task x12,
  Convert Follow-up to Promise x12, Reschedule Task x3
- NOTE: Create Task details do NOT include title/dueDate for all types — check details
  patterns; may need activity_log too (also wiped) → some data unrecoverable; the
  description/dueDate for auto tasks can be derived from details text (dates included).
