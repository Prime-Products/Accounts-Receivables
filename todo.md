# AR Pro - Accounts Receivable Management TODO

## Database & Schema
- [x] Customers table with tiers (Platinum/Gold/Silver/Bronze/New)
- [x] Invoices table with statuses and due dates
- [x] Receipts (payments) table with invoice matching/reconciliation
- [x] Contracts table with expiry notifications support
- [x] Contract installments table with per-installment status
- [x] Tasks table (SOP follow-ups at +2, +15, +20, +30 days)
- [x] On-Hold proposals table (Under Review / Eligible for On Hold / On Hold / Legal)
- [x] Monthly collection plans table (target vs actual)
- [x] Promise-to-pay records table
- [x] Audit trail table
- [x] Softone sync settings/log table

## Backend
- [x] Customer CRUD + Customer 360 aggregation
- [x] Invoice CRUD + aging calculation (0-30, 31-60, 61-90, 90+)
- [x] Receipt recording + invoice matching/reconciliation
- [x] Contract & installment management + expiry check (2 months before)
- [x] Automatic Task Engine (+2, +15, +20, +30 days from due date)
- [x] On-Hold workflow (submit proposal → approve/reject → status transitions)
- [x] Monthly cash collection forecast (invoices + installments)
- [x] Promise-to-pay recording
- [x] Dashboard KPIs endpoint (target, collected, overdue, DSO, 6-month forecast)
- [x] Reports: aging report, collections history, SOA generation
- [x] Excel/PDF export endpoints
- [x] Softone S1 Web Services integration layer (pull customers TRDR & invoices FINDOC, push receipts SALDOC) + demo mode seeders
- [x] Role-based access (Administrator, Accounting, Credit Controller, Management)
- [x] Audit trail on all mutations

## Frontend
- [x] Dashboard page (KPIs, Smart Tasks summary, 6-month Cash Flow Forecast chart)
- [x] Customers page (list, tiers, filters)
- [x] Customer 360 View page (invoices, installments, payment history)
- [x] Invoices page (list, aging buckets, status filters, receipt matching)
- [x] Contracts page (list, installment schedule, expiry alerts)
- [x] Tasks page (SOP follow-ups queue)
- [x] On-Hold workflow page (proposals, approval actions)
- [x] Forecast page (target vs actual, promise-to-pay, export)
- [x] Reports page (aging, collections history, SOA)
- [x] Settings page (Softone connection, sync status)
- [x] Role-based navigation and access control

## Testing & Delivery
- [x] Vitest tests for core business logic (aging, task engine, on-hold transitions, forecast) — 17/17 passing
- [x] Visual verification via screenshots
- [x] Final checkpoint & delivery

## Excel Import (user's real open invoices)
- [x] Analyze uploaded Excel structure and map columns to app fields
- [x] Import customers from Excel into database (811 customers with Customer Group)
- [x] Import open invoices from Excel into database (5,424 invoices, 6 companies, 4 currencies)
- [x] Verify data appears correctly in Dashboard (KPIs €2,015,030 overdue, DSO 83d, aging buckets, forecast chart), Aging Report (/invoices), Customer 360 (/customers/393 — 760 invoices, EUR totals)
- [x] Checkpoint after import (dbf1cbe0)

## EUR Conversion (ευρωποίηση)
- [x] Add amountEur handling: store EUR-converted value per invoice
- [x] Convert all existing imported invoices to EUR values (indicative rates: USD 0.92, AED 0.25, SGD 0.68)
- [x] Dashboard/aging/forecast totals computed in EUR; original currency shown on invoice rows
- [x] Populate amountEur on all invoice write paths (manual create, installment invoicing, Softone pull)
- [x] Vitest coverage for toEur and EUR-aware outstanding (25/25 tests pass)

## Prime Branch & Multi-currency Totals (user request 23 Jul)
- [x] Show Prime Branch (company) on every invoice row in Invoices page + branch filter
- [x] Show Prime Branch in Customer 360 invoice list
- [x] Display each invoice in its issuing currency (original currency as primary amount)
- [x] Aging buckets & totals: EUR total + per-currency breakdown (Invoices page, Dashboard)
- [x] Customer 360 KPI totals (Total Overdue, Current, Aging 90+): EUR + per-currency breakdown; Credit Limit stays EUR-only by definition
- [x] Aging report export (Excel/PDF) includes branch and original currency columns
- [x] FX rates settings (AED, SGD, USD → EUR) editable in Settings (persisted in app_settings, applied at server start and on save)

## Smart Monthly Collection Forecast (user request 23 Jul)
- [x] Schema: forecastEntries table (per customer/month: dueAmount, overdueAmount, aiSuggestedAmount + reasoning, expectedAmount, userAdjusted + adjustmentNote); collected computed live from receipts in query
- [x] Payment behavior profiling per customer (avg delay days, collection rate, promise reliability from history)
- [x] Auto-generate forecast on demand: scan invoices due in month + overdue, apply customer behavior (Generate/Refresh button; Jul 2026 generated for 485 customers)
- [x] AI-assisted suggestion (LLM, top-40 exposure) with fallback to statistical heuristic when history is thin
- [x] Forecast page: per-customer table with AI suggestion (reasoning tooltip), editable expected amount + note, reset to AI
- [x] Live tracking: Forecast vs Collected vs Remaining per customer and total, any moment in the month
- [x] Monthly auto-generation Heartbeat cron created (1st of month, 05:00 UTC, task_uid HeeWvn3uGNohbSoCakYup7 in app_settings) + handler /api/scheduled/generateForecast implemented and mounted
- [x] Verify scheduled endpoint on production after Publish — handler live (403 "permission error for cron cookie" for unsigned calls = correctly auth-gated); heartbeat job monthly-forecast enabled, next run 2026-08-01T05:00Z

## Group SOA, document date, aging filters (user request 23 Jul)
- [x] Backend: SOA export (PDF/Excel) at group level ("soa-group"), honoring company/branch/aging filters, with Company + Document Date columns and TOTAL row
- [x] Backend: groupDetail supports minDaysOverdue filter (Overdue any/60+/120+) scoping totals, aging, companies and invoices
- [x] Group card: SOA (PDF/Excel) buttons exporting the current filter scope
- [x] Group card: Document Date column in invoices table
- [x] Group card: aging grouping filter — All / Overdue any / 60+ / 120+ days
- [x] Customer 360: aging grouping filter on invoices tab with filtered count + outstanding summary; Issue column renamed Doc. Date
- [x] Verify production deployment includes the scheduled forecast endpoint (deploy succeeded; endpoint auth-gated 403 as expected)

## Manual tasks (user request 23 Jul)
- [x] Delete all existing tasks from the database
- [x] Backend: tasks.create procedure (customer, type, description, due date; assigned to creator — single-operator app)
- [x] Tasks page: New Task dialog with customer picker, type, description, due date
- [x] Vitest coverage for task creation validation
- [x] Customer 360: editable Tier (dropdown on the tier badge) wired to customers.update
- [x] Confirmation dialog on "Run Task Engine Now" to prevent accidental bulk generation

## Group payment behavior in forecast (new Excel: allcustomersreceivables.xlsx)
- [x] Analyze uploaded Excel: payment history (last year) per customer/group
- [x] Compute avg & median days-to-pay per customer group from last-year payments (614 customers imported to payment_behavior, 82.8% value coverage)
- [x] Backend: group behavior stats endpoint + integrate into smart forecast suggestions
- [x] Frontend: show avg/median days per group in Forecast page (and group card)
- [x] Regenerate current-month forecast with group behavior; tests + checkpoint

## Smart Forecast per Group + manual only (user request 23/7)
- [x] Backend: generate forecast per customer group (aggregate group companies' due/overdue in EUR; customerGroup column added, upsert keyed on group)
- [x] Backend: smartEntries returns one row per group (EUR amounts, group behavior, collected across member companies, companiesCount)
- [x] Backend: remove monthly auto-generation (Heartbeat cron deleted, scheduled handler removed); generation only via Refresh button
- [x] Frontend: Forecast table shows Group rows (name links to group card + companies count badge); adjust/reset per group entry; manual-only wording
- [x] Regenerate current-month forecast per group (Jul 2026: 248 groups, 40 AI + 208 heuristic); 55/55 tests passing

## Forecast search & sorting (user request 23/7)
- [x] Search field filtering forecast rows by group name
- [x] Sortable Due (month) and Overdue columns (click header toggles asc/desc)

## Column totals (user request 23/7)
- [x] Customers page (Groups view): TOTAL row summing each amount column, respecting search/filters
- [x] Customers page (Companies view): TOTAL row summing each amount column, respecting search/filters
- [x] Smart Forecast table: TOTAL row for Due, Overdue, AI Suggested, Expected, Collected, Remaining (visible/filtered rows, sticky bottom)

## Unify monthly target with Smart Forecast (user request 23/7)
- [x] Remove "Set Monthly Target" button/dialog from Forecast page (and Dashboard dialog → link to Forecast)
- [x] Monthly Targets card replaced: Target = Smart Forecast Expected (with user adjustments) per month, Actual = collected
- [x] Backend: forecast.dashboard / plans derive target from forecast_entries expected sums (setTarget procedure removed)
- [x] Dashboard page: monthly-target KPI reads the forecast-derived target

## Reimport open invoices as of 21/07/26 (user Excel, 23/7)
- [x] Analyze OPENINVOICESCUSTOMERS21.07.26FORAI.xlsx structure (sheets, columns, totals)
- [x] Compare against DB open invoices — reconciled per-currency counts AND sums match to the cent (DB vs Excel): EUR 4769/4,916,462.32, AED 322/1,623,352.48, SGD 259/316,565.12, USD 74/51,961.71; total 5,424=5,424; same file as original import, no reimport needed (user confirmed skip)

## Forecast sorting (user request 23/7)
- [x] Smart Forecast: sortable AI Suggested column (click header, asc/desc with arrow)
- [x] Smart Forecast: sortable Expected, Collected, Remaining columns

## Customers page: overdue end-of-month + sorting (user request 23/7)
- [x] Backend: customers.groups & customers list return "overdue end of month" (outstanding of invoices due on or before last day of current month) in EUR
- [x] Customers page Groups view: new "Overdue EOM" column + TOTAL cell
- [x] Customers page Companies view: new "Overdue EOM" column + TOTAL cell
- [x] Customers page: sortable amount columns (both views) with asc/desc arrows

## Customers page: AI Forecast column + totals (user request 23/7)
- [x] Backend: customers.groups returns current-month forecast Expected per group (from forecast_entries)
- [x] Groups view: "AI Forecast" column (sortable) + TOTAL cell
- [x] Companies view: forecast is group-level only — column shown in Groups view (verified with user data; AI genuinely suggests €0 for groups with poor collection history)

## Forecast refresh confirmation (user request 23/7)
- [x] Refresh Forecast button: if entries already exist for the selected month, show confirmation dialog ("forecast already ran — re-run?") before regenerating

## TOTAL rows at top (user request 23/7)
- [x] Customers Groups view: TOTAL row moved to top of table (below header)
- [x] Customers Companies view: TOTAL row moved to top of table
- [x] Smart Forecast table: TOTAL row moved to top of table

## Aging buckets: add 120+ (user request 23/7)
- [x] Split "90+ days" aging bucket into "91-120 days" and "120+ days" everywhere buckets appear (group card Aging, Dashboard, Invoices, Customer 360, aging export)

## Customer-level task creation (user request 23/7)
- [x] Reusable "New Task" dialog component (customer-level, no invoice binding)
- [x] "New Task" button on GroupDetail (group card) — pick member company, defaults to group's main customer
- [x] "New Task" button on CustomerDetail (Customer 360) — customer preselected
- [x] Verify Customer 360 aging bucket UI shows 91-120/120+ consistently (screenshot check)

## CustomersFinancialList Excel integration (user request 23/7)
- [x] CANCELLED by user — revert partial schema changes (drop turnoverYtd, turnoverLastYear, sector, uncovered columns)

## Group card actions (user request 23/7)
- [x] Promise-to-Pay dialog on GroupDetail — company picker limited to group members, defaults to filtered/largest-balance company
- [x] Propose On-Hold dialog on GroupDetail — same company selection, auto-aggregated supporting data

## Group card: promises view, notes, AI summary (user request 23/7)
- [x] Promises-to-pay section on GroupDetail — list all group companies' promises with amount, date, status (+ Kept/Broken actions)
- [x] Group notes: schema table + CRUD endpoints + notes section with author/date on GroupDetail
- [x] AI Summary button on GroupDetail — LLM-generated group snapshot (balances, overdue, behavior, promises, tasks, notes)

## Group notes UX (user request 23/7)
- [x] Replace the Group Notes card with a "New Note" toolbar button (next to New Task) opening a dialog with add/edit/delete of notes

## Turnover fields (user request 23/7)
- [x] Schema: add turnoverYtd and turnoverLastYear to customers table
- [x] Import turnover values from CustomersFinancialList Excel (matched by name/group; ERP codes differ from app codes)
- [x] Show Turnover (up to day) and Turnover Last Year on Customer 360
- [x] Show group turnover (sum of member companies) on the group card with YoY % indicator

## Promises as notes (user request 23/7)
- [x] When a Promise-to-Pay is recorded, auto-create a group note describing it (company, amount, date, notes); status changes (Kept/Broken) also noted

## Credit rating (user request 23/7)
- [x] Rating engine (A-E) computed from payment behavior, overdue ratio, aging, broken promises, on-hold status
- [x] Rating badge on Customers list (groups & companies views), group card, and Customer 360 with breakdown tooltip

## Problematic rule (user request 23/7)
- [x] After forecast: mark group as Problematic when Expected < 80% of Overdue EOM (computed live from forecast entries)
- [x] Problematic badge visible on Customers list (Groups view) and group card header

## Manual status + unified card (user request 23/7)
- [x] Backend: watch-status override (Problematic ↔ On Watch ↔ Auto) stored per group, with audit log; effective status = override ?? automatic forecast rule
- [x] Compare Customer 360 vs group card and list all field/section differences
- [x] Unified card: Customer 360 gets all group-card sections (promises, notes, AI summary, aging cards, SOA scope filters where applicable)
- [x] Unified card: group card gets all Customer 360 sections (payment history, contracts, tasks tabs)
- [x] Watch-status dropdown editable on both cards and visible on Customers list
- [x] Promise-to-pay auto-creates a follow-up task due on the promised date ("check if company paid")
- [x] Group card: show Overdue EOM inside the Overdue KPI card

## Customers list filters (user request 23/7)
- [x] Customers list: filter by watch status (Problematic / On Watch / Normal)
- [x] Customers list: filter by credit rating (A-E)

## Task detail dialog + promise actions (user request 23/7)
- [x] Backend: link promise-to-pay follow-up tasks to their promise (promiseId on task or lookup) and expose promise info on task fetch
- [x] Tasks page: click a task row to open a detail dialog (title, customer, type, due date, description, status)
- [x] Detail dialog: for promise follow-up tasks show promise details and Kept/Broken buttons updating the promise status (and auto note)
- [x] Marking promise Kept/Broken from the dialog also completes the follow-up task

## Cards: replace Promises section with AI Forecast (user request 23/7)
- [x] Remove Promises-to-Pay section from GroupDetail and CustomerDetail cards
- [x] Replace the "Open Invoices" KPI card with an "AI Forecast (this month)" KPI card (expected amount + collected/remaining subline) on GroupDetail and CustomerDetail

## Rating: turnover criteria (user request 23/7)
- [x] Rating engine: add turnover trend penalty (YTD vs last year decline >20%) ~10% weight
- [x] Rating engine: add overdue/turnover exposure ratio penalty ~10% weight
- [x] Update rating explanation/tooltip UI to show the new criteria breakdown (tooltips render all factors dynamically)
- [x] Vitest coverage for the new rating factors
## Call List: collection call prioritization (user request 23/7)
- [x] Backend: callList endpoint — per-group priority score from overdue amount × aging factor × rating factor + broken-promise boost + low forecast-coverage boost
- [x] Frontend: Call List page — ranked table with score, reasons badges (Broken promise / Aging 61-90 / Rating D-E / Low coverage), contact info, link to group card
- [x] Quick actions from Call List rows: new note, promise-to-pay, task
- [x] Sidebar navigation entry for Call List
- [x] Vitest coverage for the priority score logic
## Status badge & tier removal (user request 23/7)
- [x] Hide "Active" on-hold badge when status is default Active; show badge only when status differs
- [x] Show on-hold status consistently on both Customer 360 and Group card (group shows worst member status)
- [x] Remove Tier (Platinum/Gold/Silver/Bronze/New) from all UI: Customers list, Customer 360, GroupDetail companies table, dialogs/forms
- [x] Customer 360 mirrors group card exactly: same KPI cards, sections, and layout (user request 23/7)
## Call List tweaks (user request 23/7)
- [x] Remove the "Why" (reasons) column from the Call List table
## Call List: Contacted status (user request 23/7)
- [x] Backend: callList returns contacted flag + follow-up date when group has open task or pending promise
- [x] Frontend: "Contacted" badge with follow-up date on Call List rows
- [x] Frontend: "Hide contacted" toggle to filter contacted groups
- [x] Badge clears automatically when task completes / promise resolves (derived, no extra state)
- [x] Vitest coverage for the contacted flag logic
## Call List quick actions to group (user request 24/7)
- [x] Remove company selection from Call List quick-action dialogs; task and promise are recorded against the group directly (default to primary member internally)

## Global search (user request 24/7)
- [x] Backend: search endpoint across groups, companies, invoices (number), group notes, tasks
- [x] Frontend: search bar on dashboard header with grouped results (command palette style)
- [x] Navigation: clicking a result opens the right page (group card, customer 360, invoices filtered, tasks)
- [x] Vitest coverage for the search endpoint
- [x] Remove 61-90d, Coverage, and Rating columns from the Call List table

## Group card quick actions to group (user request 24/7)
- [x] GroupDetail: remove company selection from Add Task and Promise-to-Pay dialogs; record against the group (primary member internally)

## Call List cleanup (user request 24/7)
- [x] Remove the Contacted badge and Hide-contacted toggle from the Call List

## Tasks list cleanup (user request 24/7)
- [x] Tasks list: don't show the full description under the task title — only the "Promise to Pay" indicator where applicable
- [x] Promise task title: show only "Promise to Pay — <amount>" without the "Check promise-to-pay:" prefix and company name

## Call List columns (user request 24/7)
- [x] Call List: add "Overdue EOM" column (overdue by end of month)
- [x] Call List: add "AI Forecast" column (expected collection this month)

## Invoices: per-group summary (user request 24/7)
- [x] Invoices page: when filtering (e.g., aging 120+), show a "By group" summary view with each group and its total amount
- [x] "By group" view: clicking a group's invoice count drills down to the underlying invoices of that group (keeping active filters)

## Customer Group hierarchy (user request 23 Jul)
- [x] Inspect Excel to confirm group → member companies structure (363 groups / 811 companies; customerGroup already populated in DB for all customers)
- [x] Backend: customers.groups endpoint — aggregated totals per group (outstanding EUR + per-currency, overdue, company count)
- [x] Backend: customers.groupDetail endpoint — group aggregates + invoices, scoped by optional company and Prime Branch filters (AND-combined)
- [x] Customers page: Groups/Companies toggle — group totals with per-currency breakdown, click-through to group card
- [x] Group card page (/groups/:name): group-wide data by default; company select or row-click re-scopes KPIs/aging/invoices; branch select re-scopes; filters combine
- [x] Customer 360: group badge in header linking to the group card
- [x] Vitest coverage for group aggregation scoping (37/37 tests passing)
- [x] Vitest coverage for behavior profiling and forecast heuristic (32/32 tests passing)

## Watch status fixes (user request 24/7)
- [x] Fix mismatch: group card status dropdown must show the same effective status as the customers list (e.g., DYNACOM Problematic) — dropdown now shows the EFFECTIVE status (auto rule or manual override)
- [x] Simplify watch statuses to two: Problematic and Normal (remove "On Watch"/"Auto" from the UI) — "Normal" clears the flag even when the rule would set it; legacy "On Watch" rows migrated to "Problematic"

## Unified status workflow (user request 24/7)
- [x] Status model: Normal → Problematic → Critical → Legal / Resolved (single dropdown per group)
- [x] Track "Problematic since" date; auto-escalate to Critical after 30 consecutive Problematic days (resolveGroupStatus)
- [x] Status dropdown with all five statuses on group card, Customer 360, Customers list filter
- [x] Remove On-Hold page entirely (menu, route, dashboard KPI card replaced with Critical groups, Propose On-Hold buttons removed, OnHold.tsx deleted)
- [x] Update rating/priority logic that referenced onHoldStatus to use the new status (kept legacy customer-level onHoldStatus in rating for now — no behavior change)
- [x] Tests for auto-escalation and status transitions (statusWorkflow.test.ts, 11 cases)

## Call List: status-first prioritization (user request 24/7)
- [x] Call List ordering: status tiers first (Legal/Critical → Problematic → Normal), financial priority score orders within each tier
- [x] Status badge/column visible on every Call List row
- [x] Status filter in Call List header (All / Problematic & Critical / per-status)
- [x] Vitest coverage for tiered ordering (5 new specs, 102 total passing)

## Group card: collapsible companies section (user request 24/7)
- [x] Companies section on GroupDetail folded by default with expand/collapse toggle (click header, chevron + count)
- [x] Move Companies section below the Invoices table on GroupDetail
- [x] AI Summary: card removed from page flow; "AI Summary" toolbar button (top) opens a dialog with auto-generation — on both GroupDetail and Customer 360

## Group card: invoices grouped by branch (user request 24/7)
- [x] GroupDetail Invoices: "By branch" toggle — summary rows per Prime branch (outstanding total, invoice count, % of total) like the Invoices "By group" view
- [x] Clicking a branch row drills into that branch's invoices (sets the branch filter, switches back to list)

## Call List: remove Actions column (user request 24/7)
- [x] Remove the Actions column (note/promise/task quick actions) from the Call List table

## Forecast: change auto-problematic rule (user request 24/7)
- [x] Change auto-problematic rule: if NO forecast exists for a group, treat forecast as 0 → auto-flag as Problematic

## Forecast: track initial forecast and remaining amounts (user request 24/7)
- [x] Add initialForecast column to database schema
- [x] Update upsertForecastEntry to preserve initialForecast on first entry
- [x] Update backend API (trpc.forecast.smartEntries) to return initialForecast and totals.initial
- [x] Complete UI update on Forecast page to display Initial column
- [x] Add Initial forecast display to group card

## Forecast: remove confirmation popup (user request 24/7)
- [x] Remove the "Are you sure?" confirmation dialog from Refresh Forecast button (no longer needed since initialForecast is locked)

## Email sending functionality (user request 24/7)
- [x] Add email_history table to database schema (customerId, recipientEmail, recipientName, templateType, subject, body, status, sentAt, errorMessage, createdBy, createdAt)
- [x] Create database migration and apply to database
- [x] Add database functions (addEmailHistory, listEmailHistory, getEmailHistory)
- [x] Create callsRouter with sendGroupEmail and getEmailHistory procedures
- [x] Create SendEmailDialog component with 4 email templates (Friendly Reminder, Final Notice, Statement, Custom)
- [x] Integrate SendEmailDialog into GroupDetail page with "Send Email" button
- [x] Update groupActivity query to include email history
- [x] Add "Emails" tab to GroupActivityTabs showing email history with status badges
- [x] Create vitest tests for email sending (4 tests, all passing)
- [x] All 106 tests passing

## Unified Activity Log (user request 24/7)
- [x] Create activity_log table to track all interactions (type: note/task/promise/email/call, customerId, groupName, description, metadata, createdBy, createdAt)
- [x] Create database functions (addActivityLog, listActivityLog)
- [x] Create backend procedure to retrieve unified activity log for a group (added to groupDetail query)
- [x] Build ActivityLog UI component showing all activities in chronological order with icons/colors per type
- [x] Integrate ActivityLog into GroupDetail page (prominent section showing all interactions)
- [x] Update group notes creation to log to activity_log
- [x] Update promise-to-pay creation to log to activity_log
- [x] Update email sending to log to activity_log
- [x] Update promise status changes (Kept/Broken) to log to activity_log
- [x] Test and verify all activities are logged (all 106 tests passing)

## Turnover Display (user request 24/7)
- [x] Display turnoverLastYear and turnoverYtd in GroupDetail page
- [x] Show turnover values in summary section with formatting (EUR, thousands)
- [x] Add year-over-year comparison or growth indicator

## UI/UX Improvements (user request 24/7)
- [x] Consolidate action buttons (New Task, Promise, Email, Note) into single "Actions" dropdown menu
- [x] Display turnover fields prominently (already visible in KPI cards - YTD and Last Year with comparison)

## Payment Contacts Management (user request 24/7)
- [x] Create paymentContacts table (customerId, name, email, phone, title)
- [x] Add database functions for CRUD operations on payment contacts
- [x] Create backend procedures for managing payment contacts
- [x] Update SendEmailDialog to display payment contacts for selected customer
- [x] Add "Add Contact" button in SendEmailDialog to create new payment contacts
- [x] Update email sending to use selected payment contact
- [x] Test payment contacts workflow (all 106 tests passing)

## Promises should not create notes (user request 25/7)
- [x] Remove auto-created group note when a Promise-to-Pay is recorded
- [x] Remove auto-created group note when promise status changes (Kept/Broken)
- [x] Keep promise records in activity log and promises section only
- [x] Tests still passing after removal (all 106 tests passing)

## Customers list: EUR totals only (user request 25/7)
- [x] Remove per-currency breakdown lines under amount cells in Customers list (Groups & Companies views); show only EUR total

## Customers page: replace New Customer with Refresh Forecast (user request 25/7)
- [x] Remove "New Customer" button from Customers page header
- [x] Add "Refresh Forecast" button (triggers Smart Forecast regeneration for current month, refreshes AI Forecast column)

## Customers list: compact watch-status indicator (user request 25/7)
- [x] Replace large "Problematic" badge in Customers groups list with a small red "P" circle (C for Critical, L for Legal), tooltip preserved
## GroupDetail KPI cards restructure (user request 25/7)
- [x] Merge "Turnover (up to day)" and "Turnover Last Year" into a single Turnover card (YTD + last year + % comparison)
- [x] Remove "Payment Behavior (last year)" card
- [x] Add "Paid" card (collected this month)
- [x] Add "Remain to Collect" card (remaining to collect this month)
## Log Call + Actions in Customers list (user request 25/7)
- [x] Backend: logCall procedure recording a call (contact, outcome, notes) into activity_log
- [x] LogCallDialog component (company select, contact name, outcome, notes)
- [x] Add "Log Call" item to Actions menu in GroupDetail
- [x] Customers list (Groups view): per-row Actions dropdown (Log Call, New Task, Add Note)
- [x] Tests for logCall procedure (108 tests passing)
## Customers list: Collected & Remaining columns (user request 25/7)
- [x] Backend: customers.groups returns collected (current-month receipts) and remaining (forecast − collected) per group
- [x] Frontend: Collected and Remaining columns after AI Forecast (sortable) + TOTAL cells
## Customers list: inline forecast editing (user request 25/7)
- [x] Backend: procedure to update a group's current-month forecast (expectedAmount + initialForecast)
- [x] Frontend: click-to-edit AI Forecast cell in Customers groups list
- [x] Test for the update procedure (110 tests passing)
## Performance Optimizations (user request 25/7)

## Aging Filters in Group Detail (user request 25/7)
- [x] Add aging bucket filters (0-30, 31-60, 61-90, 91-120, 120+ days) to GroupDetail invoices section
- [x] Apply same filter logic as Invoices page (bucket-based instead of threshold-based)
- [x] Test and verify filtering works correctly (110 tests passing)
## Clickable Aging Cards (user request 25/7)
- [x] Make aging bucket cards clickable to filter invoices
- [x] Wire card clicks to agingFilter state (setAgingFilter on click)
- [x] Test and verify filtering works (110 tests passing, visual feedback with active state)

## Dynamic Aging Report (user request 25/7)
- [x] Fix aging report to update when bucket is selected
- [x] Show only invoices in selected bucket in the aging summary (frontend-based calculation like Invoices page)
- [x] Match Invoices page behavior exactly (computedAging memoization updates with agingFilter)

## Aging Report Bug Fix (user report 25/7)
- [x] Fix aging report showing 0 values on initial page load
- [x] Aging now calculates correctly before any bucket click (removed backend minDaysOverdue filter)
- [x] Verify computedAging dependency chain is correct (added agingFilter to dependencies)

## AI Summary Improvement (user request 25/7)
- [x] Very short customer/group description in AI summary (Profile section, 2-3 sentences max)
- [x] COMPLETE list of actions for current month to achieve forecast (every invoice to chase, promises, tasks, escalations)
- [x] Include forecast/collected/remaining data in the AI prompt (monthlyForecastEur, collectedThisMonthEur, remainingToCollectEur, invoicesDueOrOverdueThisMonth)

## Data Import 21.07.26 (user request 25/7)
- [x] Parse Excel open invoices file (5,424 rows)
- [x] Compare with existing DB customers/groups/invoices
- [x] Verified: DB already contains this exact snapshot (5,424 invoices, per-currency counts and sums match 1:1)
- [x] No import needed — data already in sync
- [x] Verify totals in the app after check (EUR 4,916,462.32 / AED 1,623,352.48 / SGD 316,565.12 / USD 51,961.71)

## Invoices-style Aging Report in Group Card (user request 25/7)
- [x] Same aging card design as Invoices page (amount, count, per-currency breakdown)
- [x] Click card toggles filter on/off (click again to deselect)
- [x] Filtered summary row (invoice count, outstanding total, per-currency, clear-filter ×)
- [x] Only overdue buckets like Invoices page (0-30, 31-60, 61-90, 91-120, 120+); cards always show full-scope totals; backend 500-invoice cap removed

## AI Summary Refinement (user request 25/7)
- [x] Profile section: financials and debts to us ONLY (balances, overdue, payment behavior, forecast) — no generic company info
- [x] Actions section: no "call the customer" suggestions for invoices — list amounts to collect, promises, pending tasks only (110/110 tests pass, LLM quota restored)

## Overdue Bug: August due dates shown overdue (user report 25/7)
- [x] Investigate invoice ΤΔΜΕΤ00672 data (due date) and overdue calculation — due date is 05 Aug **2023**, correctly overdue (~2 years)
- [x] No root-cause bug: SQL check confirms ZERO invoices with dueDate > today are marked Overdue; bucketOf() returns null for future dates
- [x] Verified: dates display with full year (fmtDate uses "dd MMM yyyy"); explained to user

## MSC: not-due invoices show Overdue status (user report 25/7)
- [x] Investigate MSC invoice statuses vs due dates — data is correct: all 412 future-due MSC invoices have status "Open" (verified via vitest against live DB)
- [x] Root cause: sort order (dueDate ASC) put the oldest overdue invoices first, so the visible top of the list looked all-Overdue; changed groupDetail sort to dueDate DESC (not-due/newest first, same as Invoices page)
- [x] Verify in group card — screenshot confirms MSC list now starts with Sept 2026 due dates, all "Open" status; 110/110 tests passing

## Confirmation Status Tracking (user request 25/7)
- [x] Create group_confirmation_status table (groupName, status, amount, followUpDate, notes, updatedBy, updatedAt)
- [x] Add database helpers (getGroupConfirmationStatus, upsertGroupConfirmationStatus, listGroupConfirmationStatuses)
- [x] Create tRPC procedures (calls.getConfirmationStatus, calls.updateConfirmationStatus)
- [x] Extend calls.logCall to capture confirmation response (status, amount, followUpDate, notes)
- [x] Update LogCallDialog with "Customer Response" dropdown (Confirmed, Pending Follow-up, Broken)
- [x] Add conditional fields in LogCallDialog (amount for Confirmed/Pending, follow-up date for Pending, reason for Broken)
- [x] Add confirmation status data to customers.groups query (confirmationStatus, confirmationAmount, confirmationFollowUpDate)
- [x] Add confirmation filter to Customers page (All / Not Contacted / Confirmed / Pending Follow-up / Broken)
- [x] Add "Confirmation" and "Confirmed" columns to Customers groups table with color badges
- [x] Add confirmation status data to customers.groupDetail query
- [x] Add "Confirmation Status" KPI card to GroupDetail page (badge + amount + follow-up date)
- [x] Add confirmationStatusColors to format.ts (green for Confirmed, orange for Pending, red for Broken, gray for Not Contacted)
- [x] Comprehensive vitest tests for confirmation status workflow (16 DB tests + 5 workflow tests + 2 tRPC tests = 23 tests, all passing)
- [x] All 126 tests passing

## Confirmation status: stale follow-up date bug (user report 26/7)
- [x] When status changes away from "Pending Follow-up" (e.g., to Confirmed/Broken), clear the previous followUpDate automatically (logCall + updateConfirmationStatus)
- [x] Cleaned existing stale data: PANTHEON followUpDate cleared in DB; 2 regression tests added (128/128 passing)

## Confirmed status creates Promise to Pay (user request 26/7)
- [x] When confirmation status is set to "Confirmed" with an amount, auto-create a Promise-to-Pay record for the group (with promised date; also creates follow-up task + activity log entry, same as manual Promise-to-Pay)
- [x] LogCallDialog: when Confirmed selected, amount and promised payment date are required fields
- [x] Promise attaches to selected company or the group's primary member; defaults promised date to end of month if omitted (API level)
- [x] Test for the Confirmed → promise flow (129/129 tests passing)

## Pending Follow-up creates a Task (user request 26/7)
- [x] When status "Pending Follow-up" is set with a follow-up date, auto-create a task due on that date ("Follow-up call — <group> — expected €X") via logCall and updateConfirmationStatus
- [x] Avoid duplicate open follow-up tasks for the same group — existing open task is rescheduled/updated instead
- [x] Test for the Pending → task flow incl. reschedule (130/130 tests passing)

## GroupDetail actions reorganization (user request 26/7)
- [x] Log Call becomes a standalone prominent green button next to Actions
- [x] Removed Promise to Pay from Actions menu (covered by Log Call → Confirmed)
- [x] Actions menu keeps only: New Task, Add Note, Send Email

## Stale confirmed amount bug (user report 26/7)
- [x] When status changes to "Not Contacted" or "Broken", amount resets to 0 (logCall + updateConfirmationStatus)
- [x] When status changes between Confirmed/Pending, amount reflects the newly entered value (or 0 if not provided)
- [x] Cleaned existing stale amounts in DB for Not Contacted/Broken groups; regression test added (131/131 passing)

## Promise reschedule on re-confirm (user request 26/7)
- [x] Backend: calls.getOpenPromise query — detect existing open (Pending) promise for a group
- [x] Backend: logCall Confirmed with reschedule flag → updates existing promise's date/amount instead of creating a new one; moves linked task's due date; logs "Payment rescheduled" in activity log
- [x] LogCallDialog: when Confirmed selected and an open promise exists, shows amber notice + "Reschedule existing promise" (default) vs "Create a separate new promise"
- [x] Test for reschedule flow (132/132 passing)

## Rename "Confirmed" label to "Promise to Pay" in UI (user request 26/7)
- [x] LogCallDialog: "Confirmed" option displays as "Promise to Pay" (DB value stays "Confirmed"); amount label now "Promised amount"
- [x] Customers page: badge + filter label shows "Promise to Pay"; amount column header renamed to "Promised"
- [x] GroupDetail: shares the same confirmationStatusLabels map (no separate hardcoded label found)

## Log Call: payment contacts dropdown (user request 26/7)
- [x] Backend: paymentContacts.listByGroup — contacts across all companies of a group, with company name
- [x] LogCallDialog: "Contact person" becomes a dropdown with the group's payment contacts + "Other (type a name)" free-text option
- [x] When a contact is selected, details card shows name, title, email (mailto), phone (tel) and company

## Contacts management page in menu (user request 26/7)
- [x] Backend: paymentContacts.listAll (all contacts with company + group); reused existing update/delete
- [x] Contacts page: searchable table (name, title, email, phone, company, group)
- [x] Add / Edit / Delete contact dialogs (company picker for new contacts)
- [x] Register "Contacts" in sidebar navigation and App.tsx route
- [x] Vitest coverage for listAll procedure

## Bug: stale tasks remain after status change (user report 26/7)
- [x] When status changes away from Pending Follow-up → cancel the open "Follow-up call" task for the group
- [x] When status changes away from Confirmed/Promise to Pay → cancel the open promise check task and the open promise
- [x] Apply in both logCall and updateConfirmationStatus flows
- [x] Vitest regression tests for task cleanup (2 new tests)

## Customers page: summary totals cards (user request 26/7)
- [x] Backend: aggregate totals across all groups (open balance, overdue + EOM, forecast, paid this month, remain to collect, turnover + last year)
- [x] Aging totals row: Current (not due), 0-30, 31-60, 61-90, 91-120, 120+ with amounts and invoice counts
- [x] UI: cards row above the group list on Customers page, same style as group view
- [x] Totals respect active filters (status/confirmation filters)
- [x] Vitest coverage for the aggregates (full suite 138/138 passing)

## Compact AI Forecast summary card (user request 26/7)
- [x] Customers page AI Forecast card: remove collected/remaining text, show only Initial and Current forecast values compactly

## Forecast vs Expected to Collect model (user request 26/7)
- [x] Backend: expected-to-collect per group = confirmation amount when contacted (Promise/Pending), 0 when Broken, forecast when Not Contacted
- [x] Backend: expose expected + variance in customers.groups and groupDetail payloads
- [x] Customers page: forecast card shows Forecast, Expected to Collect, and Variance with color (green ≥ 0, red < 0) + %
- [x] Customers list: sortable "Expected" column per group + TOTAL cell, colored by variance vs forecast
- [x] Group card: forecast KPI shows Forecast vs Expected vs Variance (colored)
- [x] Vitest coverage for expected/variance computation (3 new tests; 141/141 passing)

## Customers list: remove Turnover card (user request 26/7)
- [x] Remove the "Turnover (up to day)" summary card from the Customers list (kept only on the group card)

## Single unified forecast (user request 26/7)
- [x] Audit all UI spots showing Initial vs Current forecast (Customers page, GroupDetail, Forecast page)
- [x] Unify to ONE forecast value per month: generated once, manual corrections update the single value
- [x] Re-run guard: if the month's forecast exists, show a strong warning dialog with explicit checkbox ("has already run — re-running will alter the forecast"); backend rejects re-run without confirmRerun
- [x] Remove Initial/Current split from UI labels (Expected to Collect stays as the live estimate); "AI Forecast" renamed to "Forecast" everywhere
- [x] Tests updated/added for unified forecast behavior (re-run guard + smartStatus; 144/144 passing)

## Clickable confirmation badge (user request 26/7)
- [x] Customers list: clicking the Confirmation badge opens the Log Call dialog for that group (inline status change)

## Bug: stale follow-up task not cancelled (reported 26/7 — MSC case)
- [x] Status change to Broken/Not Contacted/Confirmed must cancel ANY open follow-up call task for the group, even if the recorded previous status was not "Pending Follow-up" (e.g. Pending → Confirmed → Broken left the old follow-up task open)
- [x] Clean up the existing stale MSC follow-up task in the database
- [x] Add regression test for the Pending → Confirmed → Broken sequence (145/145 passing)

## Month rollover audit (user request 26/7)
- [x] Audit: forecast is month-scoped (year+month) — new month starts fresh, re-run guard is per month. OK
- [x] Audit: confirmation statuses had NO month scoping — statuses/amounts leaked into the new month. FIXED: statuses updated in a previous month are treated as Not Contacted (€0) at read time (groups list, group detail, badge/dialog)
- [x] Audit: Collected/Paid/Remain computed from receipts within the current month window. OK
- [x] Audit: promises and follow-up tasks keep absolute dates and appear as overdue after rollover (intentional — they need manual resolution)
- [x] Regression test: Promise to Pay recorded last month → presented as Not Contacted this month, Expected falls back to forecast (146/146 passing)

## Stale open promise after Not Contacted (user bug 26/7 — DYNACOM)
- [x] Fix: setting status to Not Contacted or Broken now cancels ALL open (Pending) promises of the group + linked follow-up tasks, regardless of previous status (covers promises created directly from the Promises page)
- [x] Backfill: DYNACOM's stale Pending promises (€1,111,000 / €700 / €20,000) marked Broken; open check task cancelled; 0 open promises remain
- [x] Regression test: open promise + status → Not Contacted ⇒ getOpenPromise returns null (147/147 passing)

## Promise date under badge (user request 26/7)
- [x] Customers list: show the promised payment date ("Pay by: dd/mm/yyyy") under the "Promise to Pay" badge (same pattern as the follow-up date under "Pending Follow-up")


## Payment Reconciliation System (Manual Allocation) — User Request

- [x] Backend: payment recording — SUPERSEDED by wire transfer + allocation flow (wireTransfers.create with Received status)
- [x] Backend: open invoices fetch — SUPERSEDED by customers.listGroupOpenInvoices (group-wide)
- [x] Backend: payment allocation — SUPERSEDED by customers.allocateWireTransfer (group-level, multi-invoice)
- [x] Backend: invoice status logic on allocation (Open → Partially Paid → Paid via paidAmount) — implemented in allocateWireTransfer
- [x] Backend: vitest tests for allocation logic (wireTransfers.test.ts, 174 tests passing)
- [x] Frontend: payment entry — SUPERSEDED by New Wire Transfer button on Wire Transfers page
- [x] Frontend: payment recording modal — SUPERSEDED by wire transfer create dialog (amount, date, branch, currency, ref, notes)
- [x] Frontend: invoice allocation dialog — implemented as AllocateWireTransferDialog (group invoices, per-invoice amounts, Max, validation, search)
- [x] Frontend: allocated amounts visible on invoices (Paid / Partially Paid status + paidAmount) and on transfers (Allocated column)
- [x] Frontend: cache invalidation on allocation mutations (invalidate pattern used for correctness on financial ops)
- [x] End-to-end tested: record transfer, allocate to invoices, statuses update, cancel allocation reverts (174/174 tests)
- [x] Checkpoint: payment reconciliation via wire transfer allocations complete (c3295cc1)


## Full Quality Audit (user request 26/7)

- [x] Static checks: TypeScript compile, full test suite, dev-server/browser logs for errors
- [x] Data consistency: invoice paidAmount vs allocations, statuses vs open promises/tasks, forecast entries vs current month, orphan rows
- [x] Visual verification of all main pages (Dashboard, Customers, Group card, Customer 360, Forecast, Tasks, Invoices, Contacts, Reports, Settings)
- [x] Fix issues found during audit (1 stale test updated; 5 stale promises cancelled; all vitest fixture data purged from DB)
- [x] Deliver audit report to user

## DB indexes (user request 26/7)

- [x] CANCELLED by user before applying — schema.ts changes reverted, no migration was run, database untouched

## Bank Details Feature (Phase 1 of Wire Transfers/Credit Notes/Netting)

- [x] Schema: Add payment_bank_details table to drizzle/schema.ts
- [x] Migration: Generate and apply SQL for payment_bank_details
- [x] Backend: Add procedures (add, update, get, delete bank details)
- [x] UI: Create BankDetails component for Customer 360 card
- [x] Tests: Write vitest for bank details procedures (6/6 passing)
- [x] Verify: Run full test suite and checkpoint (154/154 passing)

## Wire Transfers Feature (Phase 2 of Wire Transfers/Credit Notes/Netting)

- [x] Schema: Add wire_transfers table to drizzle/schema.ts
- [x] Migration: Generate and apply SQL for wire_transfers
- [x] Backend: Add procedures (add, update, get, list, delete wire transfers)
- [x] UI: Create WireTransfers component for Customer 360 card
- [x] Tests: Write vitest for wire transfers procedures (4/4 passing)
- [x] Verify: Run full test suite and checkpoint (158/158 passing)


## Wire Transfers Menu & Balance Integration (Phase 3)

- [x] Add Wire Transfers menu item to sidebar navigation
- [x] Create WireTransfersPage with list of all wire transfers (all customers)
- [x] Add filters to WireTransfersPage (Status, Customer, Date range)
- [x] Update Open Balance calculation — resolved by design: balances decrease through manual invoice allocation (paidAmount), not automatic deduction; user confirmed manual matching workflow

## Cancel visibility for auto (internal) transfers (user request 27/7)
- [x] Investigate why the cancel (X) action is not visible to the user in the transfer allocation breakdown — user located it; works as designed
- [x] Cancel action for internal (auto) transfers — done via X in the source transfer's allocation breakdown (user confirmed found)

## Global search: include wire transfers & payments (user request 27/7)
- [x] Backend: globalSearch matches wire transfers by reference number and allocations by invoice number (returns transfer + allocation info: amount, customer, invoice)
- [x] Frontend: search dropdown shows "Wire transfer / Payment" result group linking to /wire-transfers

## Vessels on all invoices (user request 27/7)
- [x] Schema: vessels table (name, optional customerId/imo/notes) + vesselId on invoices (available on ALL invoices, optional); migration applied
- [x] Backend: vessels list/create procedures; invoice create/update accepts vesselId; invoice queries return vessel name
- [x] Frontend: vessel select (with inline "add new vessel") on invoice create/edit forms
- [x] Frontend: Vessel column/badge on invoice lists (Invoices page, group/customer cards)
- [x] Search: vessel name matches return invoices of that vessel
- [x] Tests for vessel CRUD and invoice-vessel linking
- [x] Update Collected calculation to include received wire transfers

## Team members: account managers & task assignment (user request 27/7)
- [x] Schema: team_members table (name, email, phone, role/title, active) + accountManagerId on customers (group inherits from members) + assigneeId on tasks
- [x] Backend: teamMembers router (list/create/update/deactivate); customers.setAccountManager (single company or whole group); tasks.assign / re-assign procedure with audit
- [x] Frontend: Team page in menu — manage members (add/edit/deactivate)
- [x] Frontend: account manager shown & editable on customer card and group card (assign to whole group at once)
- [x] Frontend: Customers list shows account manager column + filter by manager
- [x] Frontend: Tasks — assignee picker on create, assignee shown on rows, re-assign action, filter tasks by assignee
- [x] Tests: team member CRUD, owner assignment (company & group), task assignment/re-assignment (5/5 passing)

## Vessels read-only (user request 27/7)
- [x] Invoices page: vessel column becomes display-only (remove inline VesselSelect editing)
- [x] New Invoice form: remove vessel picker (vessel comes only from bulk upload)
- [x] Keep vessel display in CustomerDetail/GroupDetail tables and search (already read-only)
- [x] Keep backend intact for the upcoming bulk invoice+vessel upload (vessel tests 5/5 passing)

## Performance investigation & optimization (user request 27/7)
- [x] Profile: measure response time + payload size of all main endpoints (invoices.list, customers.groups, dashboard, forecast, tasks, groupDetail, get360)
- [x] Identify N+1 queries and oversized payloads (no gzip; invoices.list 3.2MB; 5459 DOM rows; no staleTime; tasks.list 5 sequential queries; tasks table unindexed; eager route imports)
- [x] Optimize: gzip compression middleware (invoices.list wire 3169KB→188KB); trim invoices.list payload to UI fields; tasks.list Promise.all (469→197ms); 10s micro-cache for listCustomers/listInvoices with write invalidation; route-level lazy loading; Invoices table 200-row window with Load more; staleTime 30s + no refetchOnWindowFocus; Customers page loads companies list only when needed
- [x] Optimize: DB indexes on tasks (customerId, status, assigneeId, dueDate) — migration 0023 applied
- [x] Verify: before/after timings + full test suite (183/184; 1 known-flaky confirmationStatus test passes in isolation)

## Invoice dispute (user request 27/7)
- [x] Backend: invoices.markDisputed extended — mark invoice Disputed with optional reason (appended to notes as "[Dispute YYYY-MM-DD] ..."), revert re-derives correct status (Paid/Partially Paid/Overdue/Open), audit logged with reason
- [x] Frontend: status badge on Invoices table rows is now a dropdown — "Mark as Disputed" (opens reason dialog) / "Clear dispute"
- [x] Frontend: Disputed status visible via badge + existing "All statuses → Disputed" filter; reason saved in invoice notes and audit trail
- [x] Tests for dispute/revert logic (server/dispute.test.ts — 2/2 passing)

## Unified invoice info across views (user request 27/7)
- [x] Audit: compare invoice table columns in Invoices page vs GroupDetail vs CustomerDetail
- [x] Backend: ensure groupDetail and get360 invoice rows carry the same fields as invoices.list (vesselName, company/branch, issueDate, dueDate, status, amount, amountEur, paidAmount, outstanding, daysOverdue, currency)
- [x] Shared InvoiceTable component with identical columns + dispute action, used in all three views
- [x] Verify visually in all three views, tsc + tests, checkpoint

## Sortable columns in shared invoice table (user request 27/7)
- [x] InvoicesTable: clickable column headers (Invoice, Customer, Vessel, Branch, Doc. Date, Due Date, Status, Amount, Paid, Outstanding, Days Overdue) toggling asc/desc with arrow indicator (third click clears sort; amount columns default to desc first; multi-currency sorts on EUR value)
- [x] Sorting works in all three views (Invoices page, group card, customer card)
- [x] Verify visually + tsc, checkpoint
- [x] Update Dashboard KPIs to reflect wire transfers in collected amounts
- [x] Write tests for wire transfer impact on balances
- [x] Verify: Run full test suite (158/158 passing)

## Wire Transfers Page Bug Fixes (user-reported)

- [x] Fix slow loading: getAllWireTransfers does N+1 queries (811 queries, one per customer) — replace with single query
- [x] Fix empty customer dropdown: search procedure requires min 2 chars, returns nothing for empty query — added listCompanies procedure
- [x] Replace plain Select with searchable customer combobox (811 companies)
- [x] Verify create wire transfer flow end-to-end (screenshot verified, 158/158 tests pass)
- [x] Clean vitest residue (Test Bank/Email/Wire Transfer Test customers and their rows)

## Wire Transfers: Branch & Currency + Collected Integration

- [x] Schema: Add branch column to wire_transfers, generate + apply migration
- [x] Backend: Accept branch in create/update procedures; expose branches list for dropdown (customers.listBranches)
- [x] Backend: Include received wire transfers in group Collected (groups list, groupForecast, groupAiSummary, dashboard, smartEntries)
- [x] UI: Branch dropdown in Create/Edit Wire Transfer form (same branches as invoices)
- [x] UI: Branch column + branch filter in wire transfers list
- [x] UI: Currency dropdown (EUR, USD, AED, SGD, GBP, NOK, JPY) instead of free text
- [x] Tests: Wire transfer with branch + collected integration tests (7 wire transfer tests; 161/161 total)
- [x] Verify: full test suite, clean test residue, checkpoint

## Wire Transfer → Invoice Allocation (Συμψηφισμός, group-level) — user request 27/7

- [x] Schema: wire_transfer_allocations table (wireTransferId, invoiceId, amount, createdBy) + migration
- [x] Backend: listGroupOpenInvoices — open/partially-paid invoices of ALL companies in the sender's group
- [x] Backend: allocateWireTransfer — allocate amounts to invoices (validate total ≤ transfer amount), update invoice paidAmount/status (Open → Partially Paid → Paid)
- [x] Backend: unallocate/removeAllocation — revert invoice paidAmount/status
- [x] Backend: listAllocationsByWireTransfer — show existing allocations with invoice + company info
- [x] Frontend: "Allocate" (Συμψηφισμός) action on Wire Transfers page — dialog listing group open invoices with per-invoice amount inputs, remaining-to-allocate counter, validation
- [x] Frontend: show allocated/unallocated amount per wire transfer in the table
- [x] Frontend: allocations visible with company name (credit goes to the invoice's company, e.g. CREST)
- [x] Tests: allocation across group companies, status transitions, over-allocation rejected, unallocate reverts (7 new tests; 168/168 total)
- [x] Verify: full test suite, clean test residue, checkpoint

## Allocation dialog too small (user bug 27/7)

- [x] Widen the Allocate dialog so all columns are visible without horizontal scroll (96vw, up to 1200px; invoice list up to 45vh)

## Allocation dialog invoice search (user request 27/7)

- [x] Search input in the Allocate dialog to filter group open invoices by invoice number, company, or branch (rows with entered amounts stay visible/kept in total)

## Visible allocation breakdown per wire transfer (user request 27/7)

- [x] Wire Transfers table: expandable allocation breakdown per transfer showing invoice number, credited company, and amount (e.g. DYNACOM €10,000 → 760 SGD to MAGE SHIPPING invoice)
- [x] Backend: getAllWireTransfers (or a batch allocations endpoint) returns allocation details (invoice, company, amount) for expansion
- [x] Receiving company side: customer Wire Transfers tab shows incoming allocations (e.g. MAGE sees "760 received via DYNACOM wire transfer" with invoice + source transfer reference)
- [x] Breakdown shows the invoice's branch/office prominently (e.g. Singapore) so it's clear where the settled amount went

## Inter-office flow in allocation breakdown (user correction 27/7)

- [x] Breakdown entry reads as inter-office flow: receiving branch (transfer.branch, e.g. Prime Ltd) → wire transfer of amount → invoice branch (e.g. Prime BV Rotterdam) → settled invoice of company (e.g. SUMMER SHIPPING €450); also reflect in incoming allocations table

## Internal inter-office wire transfers (user request 27/7)

- [x] Schema: wire_transfers gains isInternal flag + sourceWireTransferId + fromBranch/toBranch (or equivalent) to represent internal transfers between our own companies
- [x] Backend: when an allocation settles an invoice of a different branch than the receiving branch, auto-create a separate internal wire transfer record with reference to the original customer transfer (e.g. INT-{sourceId} · via DYNACOM WT#3)
- [x] Backend: removing the allocation also removes/adjusts the corresponding internal transfer
- [x] Frontend: Wire Transfers list shows internal transfers distinctly (badge "Internal", from→to branches, reference to source transfer), filterable
- [x] Tests for internal transfer auto-creation and removal
- [x] Deleting a wire transfer cascades: revert its allocations on invoices, delete allocations, and delete derived internal transfers; clean up current orphaned internal rows
- [x] Shorten internal transfer subtitle to "for invoice {invoiceNumber}" only
- [x] Wire Transfers table: actions (Update/Allocate) visible without horizontal scrolling — compact columns / responsive layout
- [x] Find companies/transfers with unallocated sums: Allocation filter (Not/Partially/Fully allocated), Unallocated KPI card, unallocated amount visible per row
- [x] Backend: cancelInvoicePayment procedure — revert all allocations of an invoice (restore status/paidAmount, free wire transfer amount, delete derived internal transfers, audit)
- [x] Frontend: "Cancel payment" action on invoice rows (Invoices page + customer tab) with confirmation dialog
- [x] Tests for cancelInvoicePayment (revert to Open, transfer freed, internal transfer removed)
- [x] Global search available on all pages (in DashboardLayout header), not only Dashboard
- [x] Remove duplicate search bar from Dashboard page
- [x] Inline search: click and type directly, results in dropdown below the input — no modal
- [x] Remove "Cancel payment" buttons from invoice rows (Invoices page, GroupDetail, CustomerDetail)
- [x] Add cancel (X) action on each allocation row in the transfer's allocation breakdown (WireTransfersPage) with confirmation — reverts invoice, frees transfer amount, deletes internal transfer

## Vessel (Πλοίο) field on all invoices (user request 27/7)
- [x] Schema: vessels registry table (name, optional customer, IMO, notes) + invoices.vesselId (optional on ALL invoices)
- [x] Backend: vessels router (list/create/update/remove), invoices.setVessel mutation, invoices.list & get360 & groupDetail return vesselName
- [x] Frontend: VesselSelect component (pick existing or create inline)
- [x] Invoices page: Vessel column with inline edit (click to set/change vessel on any invoice), vessel picker in New Invoice dialog
- [x] Customer detail & Group detail invoice tables show Vessel column
- [x] Invoices page search also matches vessel name
- [x] Global search (header) matches invoices by vessel name and shows vessel in results
- [x] Vitest suite: vessel CRUD, assignment to invoices, list enrichment, vessel-aware search, delete detachment (5/5 passing)

## Vessel tracking: Vessels page + vessel detail card (user request 28/7)
- [x] Schema: extend vessels table with vesselType, flag (IMO/customerId/notes already exist) + migration
- [x] Backend: vessels.listWithStats — financial aggregates (open balance, overdue amount/count, total invoiced/paid, invoice count, max days overdue, owner company/group)
- [x] Backend: vessels.detail procedure — vessel info + financial summary + full invoice rows (same fields as invoices.list) + related companies
- [x] Backend: vessels.create/update accept new fields (vesselType, flag)
- [x] Frontend: Vessels page in sidebar — list with search, sortable columns (name, type, flag, owner, open balance, overdue, invoice count)
- [x] Frontend: VesselDetail page — vessel info card (editable IMO/type/flag/notes), financial KPIs, unified InvoicesTable of its invoices
- [x] Frontend: vessel filter dropdown on Invoices page
- [x] Frontend: vessel names clickable in InvoicesTable (badge links to vessel detail page)
- [x] Tests: vessel aggregates, detail procedure, create/update with new fields (9/9 vessels tests)
- [x] Verify: tsc clean, full suite 190 tests (1 unrelated flake passes in isolation), screenshots, checkpoint

## Groups list: badge click-through + Broken rename (user request 28/7)
- [x] Backend: customers.groups exposes confirmationTaskId (Pending Follow-up → follow-up-call task, Promise to Pay → promise-check task)
- [x] Groups list: clicking the "Promise to Pay" badge opens the linked task (deep link /tasks?task=id)
- [x] Groups list: clicking the "Pending Follow-up" badge opens the linked task
- [x] Tasks page: ?task=<id> deep link auto-opens the task detail dialog
- [x] Rename "Broken" display label to "Not Confirmed Payment" (badges, Log Call dialog, filters; promise buttons show "Not Confirmed"; DB values unchanged)
- [x] Tests: 3 new confirmationTaskLink tests; full suite green (1 known parallel-run flake passes in isolation)
- [x] Verify visually, checkpoint

## Performance: limited initial rendering (user request 28/7)
- [x] Customers groups list: render first 100 rows with "Show all" footer (companies view too)
- [x] Invoices list: initial render reduced to 100 rows with "Load 500 more" / "Show all" footer
- [x] Verify visually, checkpoint

## Badge task dialog inline (user request 28/7)
- [x] Clicking Promise to Pay / Pending Follow-up badge opens the task in a dialog on the Customers page (no navigation to /tasks) — new reusable TaskDetailDialog component
- [x] Verify visually, checkpoint

## GroupDetail badge inline dialog (user request 28/7)
- [x] Backend: customers.groupDetail exposes confirmationTaskId (follow-up task or open promise-check task)
- [x] GroupDetail header: clickable confirmation badge — linked task opens inline TaskDetailDialog; otherwise opens Log Call dialog
- [x] TaskDetailDialog invalidates customers.groupDetail so the group card refreshes after task/promise actions
- [x] Verify visually, checkpoint

## Days Overdue column cut off (user bug report 28/7)
- [x] Invoices table: Days Overdue column clipped at the right edge — make it fully visible (check horizontal overflow/padding in InvoicesTable and page containers)
- [x] Verify visually, checkpoint

## Unified Account Status workflow (user request 28/7)
- [x] Backend: single Account Status per group — Normal / Problematic / Under Review / On Hold / Legal (Problematic auto from 80% forecast rule or manual; others manual)
- [x] Migrate existing watch-status overrides and on-hold statuses to the unified status
- [x] UI: one status dropdown/badge on Customers list, group card, Customer 360; filter includes all 5 statuses
- [x] Remove the separate On-Hold workflow (proposals page, Propose On-Hold dialogs/buttons, approval flow, nav entry)
- [x] Companies inherit the group's status everywhere (no per-company on-hold status; rating factor uses unified group status)
- [x] Remove ON_HOLD_TRANSITIONS/canTransitionOnHold, on-hold proposal db helpers, and stale on-hold tests
- [x] Tests updated/added for unified status; visual verification; checkpoint

## Remove Forecast tab (user request 28/7)
- [x] Remove Forecast nav entry from DashboardLayout and the /forecast route from App.tsx
- [x] Check for links pointing to /forecast elsewhere and redirect/remove them (/forecast now redirects to /customers; Home button points to /customers)
- [x] Verify, checkpoint

## Contract installment flag on invoices (user request 28/7)
- [x] Backend: isContractInstallment boolean on invoices + toggle procedure + bulk mark via Excel upload (invoice numbers list)
- [x] Badge "Contract" on invoice rows everywhere (InvoicesTable shared component)
- [x] Invoices page: filter for contract installments; bulk upload dialog to mark from Excel
- [x] Dashboard: overdue contract installments surfaced distinctly (4th card, links to /invoices?contract=overdue)
- [x] Tests (3 new contract installment tests, 194 total), verify, checkpoint
## Vessel inline dialog (user request 28/7)
- [x] Reusable VesselDetailDialog: vessel info, KPIs (open balance, overdue, invoiced, paid), invoices list — same content as vessel detail page
- [x] Vessels page: clicking a vessel opens the dialog instead of navigating to /vessels/:id (supports ?vessel=id param)
- [x] Vessel badges elsewhere (InvoicesTable) open the dialog inline instead of navigating
- [x] Verify visually (screenshot of /vessels?vessel=150001 shows modal with info, KPIs, invoices)
- [x] Resolve/confirm the 1 failing vitest before checkpoint (confirmationStatus parallel-run flake; passes in isolation 31/31)
## Contract installment demo samples (user request 28/7)
- [x] Mark a few sample invoices as contract installments in the DB (6 demo invoices: mix Open/Overdue, 3 vessels)
- [x] Verify visuals: contract icon on rows, Invoices filter (6 shown), Dashboard card (5 overdue · €2,878)
- [x] Checkpoint & deliver (51bc1c9d)
## Group/Customer card invoice filters (user request 28/7)
- [x] Group card: add Status filter (All statuses / Open / Overdue / ...) on the invoices table
- [x] Customer card: add the same Status filter on the invoices table
- [x] Remove the aging-grouping filter (All invoices / Overdue any / 60+ / 120+) from both cards (aging bucket cards remain, still clickable on group card)
- [x] Verify visually (both cards show "All statuses" dropdown), tests pass (193; 2 known confirmationStatus parallel flakes pass in isolation), checkpoint & deliver
## Remove per-row contract toggle (user request 28/7)
- [x] Remove the "Mark/Unmark contract installment" option from the row Status dropdown in InvoicesTable (flag will come only from DB sync / bulk Excel upload; backend procedure kept for bulk upload)
- [x] Verify, checkpoint & deliver
## Resizable columns & modals (user request 28/7)
- [x] Reusable column-resize infrastructure (drag handles on table headers, widths persisted per table in localStorage, double-click reset)
- [x] Apply resizable columns to InvoicesTable (used in Invoices page, group/customer cards, vessel modal)
- [x] Apply resizable columns to Vessels list table
- [x] Apply resizable columns to Customers/Groups list table (groups + companies views)
- [x] Apply resizable columns to Contacts, Tasks, Wire Transfers page and customer wire-transfer tables
- [x] Make dialogs/modals resizable by dragging edges/corner (vessel modal, group notes, log call, new task, task detail, send email, AI summary, allocate wire transfer), size persisted per dialog, double-click to reset
- [x] Verify visually, run tests (192/193; 1 known confirmationStatus parallel flake passes in isolation), checkpoint & deliver
## Collector + Account Manager assignments (user request 28/7)
- [x] Schema: existing accountManagerId stays Account Manager; new collectorId column added on customers (migration 0028 applied)
- [x] Backend: groups list + group/customer detail return both collector and accountManager; setCollector procedure added
- [x] Customers list: collector name shown under manager (emerald + HandCoins) + separate Collector filter dropdown
- [x] Group/customer card: assignment controls for both roles in header
- [x] Team page: new "Collecting" column shows groups assigned for collection per member
- [x] Tests (191/193; 2 known confirmationStatus parallel flakes pass in isolation), checkpoint & deliver

## Workflow review & best-practice analysis (user request 28/7)
- [x] Inventory all implemented workflows (forecast, tasks, log call/confirmations, promises, on-hold, assignments, ratings, wire transfers, contract installments, SOA/emails)
- [x] Benchmark against credit-control / AR best practices (Upflow, CreditPulse, Gaviti, HighRadius)
- [x] Write analysis report with gaps and recommendations (docs/workflow-review.md)
- [x] Deliver report to user

## Confirmation status month-reset fix (user request 28/7)
- [x] Fix isConfirmationStale logic: preserve Promise/Pending until their targetDate passes, not just until month changes
- [x] Update effectiveConfirmation to check targetDate instead of updatedAt month
- [x] Verify tests still pass (confirmationStatus tests may need adjustment)
- [x] Checkpoint after fix (85a5e3d4)
- [x] Make promisedDate mandatory for Promise to Pay (Confirmed) in logCall backend + LogCallDialog UI
- [x] Promise/Pending carryover: statuses stay active until their target date passes (no month-boundary reset); Broken persists until manually changed; monthRollover tests rewritten

## Carried-over indicator (user request 28/7)
- [x] Expose carriedOver flag (status recorded in a previous month & still active) in groups payload + getConfirmationStatus
- [x] Show "carried over" hint on confirmation badges in Customers list and GroupDetail
- [x] Explain auto-Broken option to user

## Overdue badge (task-driven) — no auto-reset (user request 29/7)
- [x] Backend: remove auto-reset of expired Promise/Pending statuses (isConfirmationStale no longer treats past followUpDate as stale)
- [x] Backend: expose taskOverdue flag (linked auto-task open + past due) in effectiveConfirmation, groups list, groupDetail, getConfirmationStatus
- [x] Frontend: red badge on Customers list when confirmationTaskOverdue=true (+ "Overdue task" hint)
- [x] Frontend: red badge on GroupDetail header when taskOverdue=true (+ hint)
- [x] Frontend: CustomerDetail has no confirmation badge (group-level only) — n/a
- [x] Update tests (no auto-reset, taskOverdue flag), run tsc + vitest (193 pass; 2 known confirmationStatus parallel flakes pass in isolation), verify visually, checkpoint & deliver

## Internal collaboration via tasks (user request 29/7)
- [x] Backend: tasks.create accepts assigneeId (team member) + invoiceIds[]; tasks list returns assigneeName, creatorName, createdByMe, attachedInvoices
- [x] Backend: invoice attachments on tasks (task_invoices table) exposed on task list/detail
- [x] Backend: task comments table (task_comments) + tasks.comments / tasks.addComment procedures
- [x] Backend: createdByMe flag for inbox scoping (All / Created by me / Assigned from others)
- [x] Frontend: New Task dialog has "Assignee" picker (team members) — already existed, kept
- [x] Frontend: invoice tables — checkboxes → "Send to colleague" floating bar → prefilled New Task with linked invoices
- [x] Frontend: group/customer card — New Task with assignee picker covers "assign card to colleague"
- [x] Frontend: Tasks page — scope tabs All / Created by me / Assigned (from others) + creator under title + attachment count chip
- [x] Frontend: Task detail dialog (Tasks page + standalone) — attached invoices box + comments thread with composer
- [x] Tests (taskCollaboration.test.ts 2/2; suite 194/195, 1 known parallel flake passes isolated) + tsc clean + screenshots

## Remove Run Task Engine button (user request 29/7)
- [x] Remove "Run Task Engine Now" button + confirmation dialog from Tasks page (manual tasks only)

## Installment filter toggle everywhere (user request 29/7)
- [x] Shared InstallmentToggle component (All invoices / Installments only)
- [x] Invoices page: replaced 3-option Select with the toggle (dashboard "overdue installments" deep-link still works)
- [x] Group card: toggle in the Invoices card header, filters the list and totals
- [x] Customer card: toggle next to the status filter in the Invoices tab
- [x] tsc clean + screenshots (Invoices, group card, customer card) + checkpoint & deliver

## Bug: checkboxes not visible on invoices (user report 29/7)
- [x] Investigate why selection checkboxes don't show on invoice tables for the user — verified they render in preview (Invoices page, group card, customer card); user was likely on the pre-deploy production build; deploy has since updated. Awaiting user confirmation after hard refresh.
- [x] Fix + verify on all invoice lists (Invoices page, group card, customer card) — verified via screenshots

## UI polish (user request 29/7)
- [x] Remove the "Overdue task" text label next to red confirmation badges — the red color alone signals overdue
- [x] Remove the "All types" task-type filter dropdown from the Tasks page
- [x] Tasks page: highlight overdue open tasks in red (due date passed, status not Completed)
- [x] Log Call: keep only "Reached" and "No Answer" in the Outcome options (remove the rest)
- [x] Invoices page: remove the "Contract Installments" and "New Invoice" header buttons
- [x] Task detail: attached invoices should be clickable links that open the invoice (filtered Invoices view)
- [x] Tasks page: hide Cancelled tasks by default; show only when explicitly selected in status filter
- [x] Tasks page: add search box to filter tasks by group/customer name
- [x] Tasks are group-scoped: NewTaskDialog selects a group (not an individual customer; group's primary member used as anchor)
- [x] Tasks list shows Group column instead of Customer; task detail links to group card
- [x] Backend: tasks.list exposes groupName; invoice-based creation (send invoices to colleague) still works
- [x] Cleanup: also deleted remaining "TaskLink Promise" junk customers/tasks/promises (48 customers, 24 tasks, 24 promises)
- [x] Call list: Problematic status no longer affects score/tier — sorting is purely by risk score; status stays as an informational badge
- [x] Log Call from a group: contact dropdown lists only that group's contacts, with an inline "Add new contact" option (name/title/email/phone + company when multi-company group; saved contact is auto-selected)
- [x] Pending Follow-up reschedule: Log Call with existing open follow-up task moves it to the new date instead of creating a duplicate
- [x] Task detail: editable due date for open tasks (reschedule)
- [x] Reschedule counter: each date change increments rescheduleCount; shown as "×N" on the task and on the group's communication badge
- [x] Fix test-data leak: confirmationTaskLink.test.ts now purges its "TaskLink" customers/tasks/promises/statuses after each run (was recreating junk on every test run)
- [x] Cleanup: delete junk "TaskLink Pending" tasks and their placeholder customers (after verifying no invoices attached)

## Reset default sort on groups list (user request 29/7)
- [x] Customers page (Groups view): "Reset sort" button appears when user changes column sorting; click returns to the default order (open balance desc)
- [x] Companies view: same "Reset sort" control when a manual column sort is active
- [x] Optional ?sort= URL param presets group sorting (used for verification)

## Follow-up task should show the call contact (user report 29/7)
- [x] Backend: store the selected contact on the follow-up task created/rescheduled by Log Call (Pending Follow-up / Promise to Pay)
- [x] Task detail dialog: show the contact of the linked call (Contact row in both task detail dialogs)
- [x] Tests + checkpoint + GitHub push

## Visible Risk Score column on groups list (user request 29/7)
- [x] CANCELLED by user 29/7 — no risk score anywhere

## Risk score ranking investigation: Starbulk vs Minerva (user question 29/7)
- [x] CANCELLED by user 29/7 — risk score removed entirely instead

## Remove risk score + Reset sort; default sort by overdue (user request 29/7)
- [x] Remove the "Reset sort" button and ?sort= URL preset from Customers page
- [x] Groups list default order = overdue balance desc (backend customers.groups)
- [x] Companies list default order unchanged (user asked only for groups; column sorting still available)
- [x] Tests + checkpoint + GitHub push

## Remove "Pay by" line under Promise to Pay badge (user request 29/7)
- [x] Removed the "Pay by: <date>" line in the Confirmation column of the groups list; only "Follow-up" remains

## Promise to Pay badge not updating after Kept/Not Confirmed (user bug 29/7)
- [x] Trace how confirmationStatus is computed in customers.groups and why marking the promise Kept / Not Confirmed leaves the badge as Promise to Pay
- [x] Fix propagation: forecast.updatePromise now updates the group confirmation row (Kept → Not Contacted, Broken → Not Confirmed); frontend already invalidates customers.groups
- [x] Tests + checkpoint + GitHub push

## Promise resolution flow rework (user request 29/7)
- [x] Kept: badge shows green "Kept" until end of month, auto-resets to Not Contacted next month (stale logic)
- [x] Add "Kept" to confirmation statuses (schema enum + effectiveConfirmation stale rules)
- [x] Not Confirmed: badge shows red "Not Confirmed" until user picks a next action
- [x] Next Action dialog after pressing Not Confirmed: (1) Follow-up call w/ date → Pending Follow-up + task, (2) New promise w/ amount+date → Promise to Pay, (3) Escalate → change group status
- [x] Badge click for Broken status also opens the Next Action dialog
- [x] Tests + checkpoint + GitHub push

## Remove 3-dot actions column from groups list (user request 29/7)
- [x] Remove the 3-dot (⋯) actions menu column from the Customers groups table (GroupRowActions component deleted, header/total/row cells removed, imports cleaned)

## Replace Under Review with Critical (user request 29/7)
- [x] Backend: rename "Under Review" watch status to "Critical" (workflow Normal → Problematic → Critical → On Hold → Legal; legacy "Under Review" rows map to Critical)
- [x] Database: migrate existing "Under Review" rows to "Critical" (0 rows existed; enum already contains Critical)
- [x] Frontend: status dropdowns, badges, filters, Next Action dialog show "Critical" (dark red styling)
- [x] Tests + checkpoint + GitHub push (202 tests pass)

## Remove names under group name in groups list (user request 29/7)
- [x] Remove account manager / collector names shown under the group name in the groups list
- [x] Column drag-and-drop reordering — requested then CANCELLED by user (not implemented)

## Bug: "Task not found" dialog after promise Kept (user report 29/7)
- [x] Clicking the confirmation badge after a promise is marked Kept (or its task completed/cancelled) opens "Task not found" — stale confirmationTaskId
- [x] Fix: clear/refresh the stale task link so completed tasks don't open the error dialog (latched taskId, dialog auto-closes after Kept/Not Confirmed, graceful close+toast if task truly gone)

## Editable forecast on group card (user request 29/7)
- [x] Backend: mutation to set/override the current-month forecast amount for a group (reused existing forecast.setGroupForecast with audit)
- [x] UI: inline edit (pencil → input → save) of the forecast amount on the group detail card; also works when no forecast exists yet ("click to set one")

## Better group AI Summary (user request 29/7)
- [x] Review current AI summary implementation, inputs and prompt
- [x] Enrich inputs: month stats (forecast vs collected, promises kept/broken), recent calls/notes, payment-behavior metrics (avg days late, payment pattern, trend)
- [x] Rewrite prompt for a structured, concise output: Month summary + Payment behavior + Suggested actions
- [x] Verify output quality on real groups (spot-tested with MSC group, iterated prompt 3x)

## AI Summary — Greek shorter format (user request 30/7)
- [x] Rewrite prompt: output in Greek, ~100 words max, header line with Open Balance + Overdue + invoice count, short paragraph (month status, payment behavior, key invoices), one "Προτεινόμενη ενέργεια" sentence
- [x] Test with real group data and verify format matches user example (MSC: 68 words, exact format)

## Dashboard: pending contact card (user request 30/7)
- [x] Backend: count groups with forecast > 0 and confirmationStatus = Not Contacted this month
- [x] Frontend: render a card on Dashboard showing "Εκκρεμεί επικοινωνία: X groups"

## Groups list: remove Expected column (user request 30/7)
- [x] Remove the "Expected" column from the groups list (forecast IS the conservative expected amount)

## Dashboard: Problematic groups card not clickable (user bug 30/7)
- [x] Clicking "Problematic groups" card should navigate to /customers filtered by Problematic status
- [x] Verify other dashboard status cards (On Hold / Legal) also navigate with the right filter
- [x] Fix: dashboard count used raw DB rows, not resolved status (auto-problematic rule). Now uses same resolveGroupStatus logic as the groups list.
- [x] Fix: Customers page URL-param filter (useState initializer) didn't re-run on navigation from Dashboard. Added useEffect syncing from useSearch().

## Test data pollution cleanup (user report 30/7)
- [x] Delete all test-generated tasks/promises/activity/confirmations for ΥΠΟΥΡΓΕΙΟ ΚΛΙΜΑΤΙΚΗΣ (customerId 808)
- [x] Delete test data for DYNACOM, MERCURIA, MSC, Test Email Customer groups
- [x] Delete orphan activity_log and group_confirmation_status rows (groups not in customers)
- [x] Make vitest tests clean up after themselves (track and delete created rows in afterAll)

## Suggested Next Action (after Log Call)
- [x] Backend: calls.suggestNextAction — rule engine using group data (overdue, aging, broken promises, call history, status) returning a suggested action (Friendly reminder / Escalate to Account Manager / Send SOA / Request payment plan / Legal review)
- [x] Frontend: show Suggested Next Action panel in the Log Call dialog after saving
- [x] Vitest coverage for the suggestion rules

## Pending Follow-up Task Actions
- [x] When opening a Pending Follow-up task, show 3 action options: Reschedule (change date), Convert to Promise to Pay (new PTP task + status change + cancel old task), Escalate (to Account Manager)
- [x] Backend: procedure for reschedule (update task due date) — existing tasks.reschedule reused
- [x] Backend: procedure for convert to Promise to Pay (create promise record, create PTP check task, update confirmation status to Confirmed, cancel old follow-up task)
- [x] Backend: procedure for escalate (reassign task to account manager, add activity log)
- [x] Frontend: action buttons/dialog when viewing a Pending Follow-up task

## Promise to Pay Task Actions
- [x] When opening a Promise to Pay task (promise not kept), show actions: Reschedule promise (new date/amount) and Escalate (to Account Manager)
- [x] Backend: reuse/extend promise reschedule to work from the task dialog
- [x] Frontend: action panel in TaskDetailDialog for promise tasks

## Rolling Status Flow Redesign (no full monthly reset)
- [x] Month rollover: only reset groups whose status is Kept or Broken back to Not Contacted; keep Promise to Pay / Pending Follow-up statuses and their open tasks across months
- [x] Backend: createNextTask procedure — from an open PTP/Follow-up task, create a new Promise to Pay (promise record + check task) or Pending Follow-up (follow-up task), update the group's confirmation status, and cancel the old task
- [x] Backend: expose the group's open invoices (with due dates) for the next-task picker
- [x] Frontend: TaskDetailDialog "Create next task" panel — choose PTP or Follow-up, see open invoices with due dates, set date/amount; old task is cancelled automatically
- [x] Update month-rollover tests to the new partial-reset behavior; add tests for createNextTask

## Open Balance card: due next month (user request 30/7)
- [x] Backend: groupDetail returns dueNextMonth (open invoices due within next calendar month, EUR)
- [x] Group card: Open Balance KPI shows "Due next month: €X" subtitle

## Log Call: optional promise amount (user request 30/7)
- [x] Backend: logCall accepts Promise to Pay without amount (date stays mandatory)
- [x] Frontend: LogCallDialog no longer requires amount for Promise to Pay

## Collection Notes per group (user request 30/7)
- [x] Backend: collectionNotes field per group (schema + get/set procedures)
- [x] Group card: always-visible editable Collection Notes box (call preferences, particularities)
- [x] Log Call dialog: show the group's collection notes as a reminder
- [x] AI Summary: include collection notes as context
- [x] Vitest coverage for collection profile set/get roundtrip (with cleanup)
- [x] Fixed remaining test-data pollution: cleanup hooks added to groupAiSummary + addPromise side-effects tests; purged leftover vitest rows from activity log

## Unified "what happens next?" task action panel (user request 30/7)
- [x] Promise to Pay tasks: same card-style panel as Follow-up (Reschedule, Escalate, Done — schedule next step); remove the invoice-check step from the PTP flow
- [x] Pending Follow-up tasks: keep the card-style panel (Reschedule, Convert to Promise to Pay, Escalate, Done — schedule next step)
- [x] Consistent visual style: icon cards with title + description, matching the reference screenshot
- [x] Tasks page now uses the shared TaskDetailDialog (removed the old inline dialog that had no action panels)

## Badge click / status sync flow (user request 30/7)
- [x] Groups list badge (Promise to Pay / Pending Follow-up) must ALWAYS open the linked task — never the Log Call dialog directly
- [x] Handle stale statuses: if the linked task is cancelled/closed but the status still says Pending Follow-up (e.g. MINERVA), fix the linkage or reset the status so the badge behaves consistently (resetStaleConfirmation mutation + auto-reset when a linked task is cancelled)
- [x] Log Call should only be triggered from resolving a task as Kept or Not paid (the "Done — schedule next step" flow), not from the badge
- [x] When a task is resolved Kept → group confirmation status becomes Kept; Not paid → Broken (automatic sync via updatePromise)

## Test-isolation incident & recovery (30/7)
- [x] Data recovery: rebuilt tasks + promises_to_pay from the audit trail after a faulty test cleanup wiped them (open tasks, statuses, amounts restored; activity log history not recoverable)
- [x] Root-cause fix 1: guarded snapshot cleanup (no deletes when snapshot is unset)
- [x] Root-cause fix 2: server/testFixtures.ts — all DB-mutating tests now create their own isolated fixture customers instead of touching real customers/groups (10 test files migrated)
- [x] Fixture visibility: invalidate the customers micro-cache when fixtures are created/removed
- [x] Full suite green (232 tests) with real data verified unchanged after the run

## Transactions list on group/customer card (user request 30/7)
- [x] Investigate wire transfers + allocation model (how allocations link transfers to invoices)
- [x] Backend: groupDetail + get360 return openTransfers — wire transfers with unallocated remainder (fully allocated & internal hidden)
- [x] Frontend: group card "Transactions" section — payments-on-account table above the invoice list (credit notes prepared for later)
- [x] Same list on the customer card (shared UnallocatedTransfersTable, tab renamed Transactions)
- [x] Vitest coverage for the transactions query (isolated fixtures) — 233 tests green
- [x] Bugfix: stale "Open promise exists €7,777" in Log Call — closed 6 orphan Pending promises left from the audit recovery; user's own task cancellations respected
## Net Open Balance (user request 30/7 — "προχωρά το 2")
- [x] Backend: groupDetail returns unallocated payments total (EUR) and net open balance (invoices − unallocated transfers)
- [x] Backend: get360 returns the same for the single customer
- [x] Group card: Open Balance KPI shows net balance with breakdown line (invoices total − unallocated payments)
- [x] Customer card: Open Balance KPI shows net balance with the same breakdown
- [x] Vitest coverage for the net balance computation (isolated fixtures) — 235 tests green
- [x] Cleanup: removed 41 orphaned test wire transfers; testFixtures cleanup now also deletes fixture transfers/allocations/invoices

## Escalate task creates new task for assignee (user request 30/7)
- [x] Fix escalate procedure: create new task for assignee instead of reassigning original
- [x] Original task marked Completed with escalation note in description
- [x] New task has title "Escalated: {original title}", description includes original task + escalation note
- [x] Vitest coverage for escalate flow (creates new task, closes original)

- [x] Fix escalate task: creates new task for assignee, closes original (238 tests pass)

## Remove Suggested Next Action feature (user request 30/7)
- [x] Remove suggestNextAction backend procedure from ar.ts router
- [x] Remove SuggestedNextActionCard component from client
- [x] Remove the suggested next action display from LogCallDialog
- [x] Remove LLM call for next action suggestion
- [x] Update tests to remove coverage for suggested next action

## Broken status with action options (user request 30/7)
- [x] Rename "Not Confirmed Payment" to "Broken" in LogCallDialog and STATUS_LABELS
- [x] When Broken status selected, show action options: Reschedule, Pending Follow-up, Escalate
- [x] Add reschedule attempt counter to promises table (rescheduleCount field)
- [x] Track reschedule attempts in activity log ("Promise rescheduled — 2nd attempt", "3rd attempt", etc.)
- [x] Display reschedule attempt count in the action panel when Broken is selected
- [x] Update tests for Broken status and reschedule counter

## Remove Escalate and make Broken actions mandatory (user request 30/7)
- [x] Remove Escalate button from Broken section
- [x] Make the three action buttons mandatory (cannot log call without selecting one)
- [x] Update UI to show clear selection requirement
- [x] Test that Broken status requires action selection

## Remove placeholder columns from Team page (user request 30/7)
- [x] Identify and remove placeholder/empty columns from Team members table
- [x] Keep only relevant columns: Name, Role, Status (Active/Inactive), Actions
- [x] Test Team page displays clean table without dashes

## Rework task action dialog Kept/Broken flow (user request 30/7)
- [x] Find the task action dialog with Reschedule/Escalate/Done options
- [x] Remove the initial Reschedule/Escalate/Done card entirely (Done removed completely)
- [x] Show only two buttons initially: Kept and Broken (rename Not Confirmed/Not paid to Broken)
- [x] When Broken pressed, show three options: Reschedule, Promise to Pay, Pending Follow-up
- [x] Test the new flow and run vitest

## Broken options: Reschedule Promise / Pending Follow-up / Escalate (user request 30/7)
- [x] Replace "Promise to Pay" option with "Escalate" in the Broken options panel
- [x] Escalate opens the escalate form (assignee + note) and hands the task over
- [x] Test the new flow and run vitest

## Hide Mark Done for Promise to Pay tasks (user request 30/7)
- [x] Hide "Mark Done" button when the task has a linked promise (closure happens via Kept/Broken flow)
- [x] Keep "Mark Done" for plain manual tasks
- [x] Test and run vitest

## Escalated communication status (user request 30/7)
- [x] Add "Escalated" to confirmation status enum/labels/colors and filters
- [x] On escalate: set group communication status to "Escalated", badge links to the new escalated task
- [x] When a new Promise/Follow-up task is created from the escalated task: close it as Completed, keep only the new task, status switches to Promise to Pay / Pending Follow-up
- [x] Vitest coverage for the escalated status lifecycle

## Task watchers with avatar stack (user request 30/7)
- [x] Create visual mockup of avatar stack for user approval
- [x] Add taskWatchers table (taskId, memberId)
- [x] Escalate form: multi-select watchers
- [x] Avatar stack on task cards and task dialog (initials, colored circles, +N counter)
- [x] Manage watchers from task dialog (add/remove)
- [x] Vitest coverage for watchers
- [x] Watchers carried over when escalated task rolls into a new task

## Escalated badge opens task directly (user request 31/7)
- [x] Clicking the Escalated badge in the Customers list opens the escalated task dialog directly (not the Log Call flow)
- [x] Same fix applied to the group detail page badge
- [x] Stale Escalated badge (no open escalated task) resets to Not Contacted on click

## Log Call fixes & multi-call flow (user request 30/7)
- [x] Fix error when opening Log Call from the customer card (empty SelectItem value in company picker)
- [x] Clarify/propose flow for a second Log Call when an active communication task already exists (proposal approved by user)
- [x] Decide behavior for third+ concurrent log calls (same choice step every time; one active case per group)
- [x] Document when a Log Call creates a task (group vs customer)

## Active-communication choice step before Log Call (user request 30/7)
- [x] When Log Call is clicked and an open promise/follow-up/escalated task exists, show a choice dialog first
- [x] Choice dialog shows active communication summary (type, amount, due date)
- [x] Option "Open the task" opens TaskDetailDialog for the active task
- [x] Option "New log call" proceeds to the normal LogCallDialog
- [x] If no active communication exists, Log Call opens directly (no extra step)
- [x] Vitest coverage for the active-communication lookup endpoint

## Escalation workflow rework (user request 31/7)
- [x] Escalation summary: auto-generated snapshot (open balance, overdue, promise history kept/broken, reschedule counts, recent log calls, escalation reason) shown on escalated tasks
- [x] Management decision actions on escalated tasks: On Hold / Stop Services, Legal Review, Return to Collector
- [x] On Hold and Legal group statuses: badges on Customers list + GroupDetail, filter options
- [x] Return to Collector: reassigns task back to the escalating collector with management instructions
- [x] Auto-watcher: escalating collector automatically becomes watcher on the escalated task
- [x] Auto-watcher: creator of a task assigned to someone else automatically becomes watcher
## Email templates + Outlook flow (user request 31/7)
- [x] Email templates: SOA, Payment Reminder, Overdue Notice — body prefilled with group data
- [x] SOA export file (open invoices of the group) auto-downloaded on Send
- [x] Send opens Outlook (mailto) with recipient, subject and body prefilled
## Bug: test team members leaked into production data (user report 31/7)
- [x] Delete leftover TM Mgr/Task test team members from database
- [x] Fix test cleanup so test team members never persist

## SOA statement redesign to match Prime Products sample (31/7)
- [x] Statement data builder: per group-company statements, TOTAL AMOUNTS across 6 branches, ANALYSIS per branch, upcoming buckets
- [x] PDF generation matching sample layout (logo, red headings, EU number format, bank details per branch)
- [x] Wire new SOA PDF into Send Email download and GroupDetail SOA buttons
- [x] Vitest coverage for statement builder
- [x] TOTAL AMOUNTS: hide branch rows with all-zero balances
- [x] ANALYSIS totals row, zebra striping, red overdue, per-company page numbers
## Bug: SOA PDF blank pages (user report 31/7)
- [x] Fix pagination in statement PDF — remove blank pages and bad table breaks
- [x] Fix text overlapping table lines: branch display name wrapping onto header line, two-line column headers touching rule line

## SOA cover page (user request 31/7)
- [x] Consolidated group summary cover page: currency total boxes (balance + overdue per currency)
- [x] Master company index on cover: company rows with per-currency balances, overdue column, dash for zeros
- [x] Each company statement starts on a new page after the cover
- [x] Unify SOA PDF style: company pages get same header/brand block and section styling as the cover page
- [x] SOA PDF continuous flow: company statements follow each other with separators, page break only when content doesn't fit
- [x] SOA PDF kickers: company pages "COMPANY" (not "COMPANY STATEMENT"), cover page "GROUP" (not "GROUP CONSOLIDATED SUMMARY")
- [x] SOA: single-company groups get the same summary cover section as multi-company groups
- [x] Email templates table in DB (subject/body per template type, editable)
- [x] tRPC procedures: list/update/reset/preview email templates (admin)
- [x] emailPrefill renders stored templates with placeholder substitution
- [x] Settings → Email Templates editor UI with placeholder reference, live preview and reset
- [x] SendEmailDialog uses the stored templates for all 6 template types (Custom left free-form)
- [x] Group card invoice list: hide fully paid invoices by default (exclude from list, count, totals and by-branch view) with a toggle to include them
- [x] Same settled-invoice rule applied to the individual customer card invoice list
- [x] By-branch view sums outstanding instead of invoice face value
- [x] Import contacts from Contactsall.xlsx: name, position, email, phone, linked to the right customer/group
- [x] Contacts page: group filter and department/position filter for the imported data
- [x] Re-import contacts: keep every distinct person, not one row per shared company mailbox
- [x] Prefer person-specific email over generic mailbox when a row has several addresses
- [x] Contacts: drop the Company column, organise every contact by group instead
- [x] New/Edit Contact dialog: pick a group rather than a company
- [x] Check how many of the 5,970 unmatched CRM rows are AR customers under a different name spelling
- [x] Import contacts of companies that have no current AR balance (customers exist only when they owe money)
- [x] Keep directory-only companies (no invoices) out of the Collections groups and companies views
- [x] Update test fixtures so suites asserting on customers.groups create a ledger invoice
- [x] Separate derived Overdue from stored invoice status (Open/Partially Paid can also be overdue)
- [x] Migrate stored "Overdue" invoices back to Open / Partially Paid based on paidAmount
- [x] Stop the taskEngine sweep from writing status = Overdue
- [x] Show Overdue as a derived badge next to the settlement status in all invoice tables
- [x] Keep status filters working with a separate Overdue filter
- [x] Primary invoice badge: Open when not yet due, Overdue once past due (single badge, no Open+Overdue pair)
- [x] Disputed is the ONLY secondary badge, shown next to the primary Open/Overdue badge
- [x] Status dropdown edits the settlement status only; Overdue stays derived and non-selectable
- [x] Rename "Customers" nav item + page title to "Collections" (route /customers unchanged, Groups stays the default sub-view)

## Bug: two status badges stacked in the group/customer card (user report 31/7)
- [x] Verify the group and customer cards render a single primary badge (they do — the report came from a cached build; a hard refresh clears it)
- [x] Keep the primary + Disputed badges on one line (status cell no longer wraps)
- [x] Enforce a minimum width for the Status column so a stale saved column width from localStorage can never squeeze the badges

## Escalation summary as an AI story (user request 31/7)
- [x] Server: collect the full case history for an escalated task (call logs with outcomes, promises with dates/amounts/reschedules, group notes, activity log, task chain)
- [x] Server: AI narrative procedure that reads that history and writes the story — what happened, what was tried, why it reached management
- [x] Escalation panel: replace the KPI cards + raw activity list with the narrative
- [x] Keep the decision actions (On Hold / Legal Review / Return to Collector) unchanged below the story
- [x] Vitest coverage for the history collection and the narrative fallback when the LLM is unavailable
- [x] Fix: panel no longer blanks out to an empty skeleton while the summary query loads

## Group card cleanup (user request 31/7)
- [x] Remove the "Companies of the group" collapsible card — the "All companies (group)" selector at the top already scopes the data
- [x] Remove the "Days Ovd" column from the transactions table — the days already appear on the Overdue badge
- [x] Rename "Collections" to "Group List" in the sidebar, page title and back links
- [x] Remove the "Doc. Date" column from the invoices table — Due Date is the date that drives collection
- [x] Group invoices by vessel — "By vessel" view on the Invoices page and in the group card transactions, with drill-down and "No vessel" bucket
- [x] Escalation no longer requires an account manager on the company — falls back to a senior team member so the collector can always escalate
- [x] Escalation story is too long — scoped to the escalated task's own history window (one paragraph, 45-70 words, no group-wide balances or recommendations)
- [x] Invoices page: when "Installments only" is active, the aging cards show the aging of the installments (scoped buckets, per-currency, "installment(s)" wording and a scope label)
- [x] Removed the AI summary ("What happened") from the escalated task panel — only the escalation reason and the three decisions remain
- [x] Escalated task dialog: removed the Promise-to-Pay block (amount / promised date / Kept / Broken), removed the duplicated "Escalated to … on …" line from the description, and moved the comments thread to the top
- [~] Import live data from hub.primeproducts.gr into the local database — CANCELLED by the user; no import performed, sandbox DB untouched
- [x] Simplify the escalated-task dialog layout: title + Escalated badge, then plain label/value rows (Group, Assigned, Due Date, Watchers), then Comments, then Decision buttons, keeping the existing colours and style
- [x] Escalation panel rewritten as a plain "Decision" section with three inline outline buttons (On Hold / Legal Review / Return); no orange card, no summary card
- [x] TaskCommentsThread accepts hideHeading so the dialog can own the "Comments" section heading

## Open credit notes (PRIMELTD_OPENCNs.xlsx, user request 31/7)
- [x] Schema: credit_notes table (branch, customer, doc number, doc date, currency, original amount, open amount, amountEur, vessel, contract no, days)
- [x] Import the open credit notes (incl. the 7 UAE rows the Excel grand total skips), matched to existing customers by company name — 238 of 306 rows imported; the 68 rows of 37 companies missing from the customer list were left out by user decision (`--create-missing` flag exists but is off)
- [x] Schema: `credit_notes` + `credit_note_allocations` tables (drizzle migration 0038, applied)
- [x] Backend: `listOpenCreditNotes` in the AR router; `customers.get360` returns `openCreditNotes` / `openCreditNotesTotal`, `customers.groupDetail` returns `openCreditNotes` and `totals.openCreditNotes` / `openCreditNotesCount`, and `netOpenBalance` subtracts them
- [x] Transactions view (group card + Customer 360): `OpenCreditNotesTable` above the invoice list — date, credit note number, company, branch, vessel, contract, negative amounts
- [x] Open Balance card shows "inv − on acct − credit" breakdown on both the customer and group card
- [x] No automatic matching to invoices — open amount comes from the ERP, manual allocations are subtracted, fully matched credit notes disappear from the list
- [x] Vitest: `server/creditNotes.test.ts` (visibility, EUR conversion, group netting, partial/full matching)
- [x] Vitest coverage for the credit-note visibility, FX conversion, balance netting and manual matching (server/creditNotes.test.ts)

## Tasks list navigation (user request 31/7)

- [x] Tasks page: the Group cell is a link that opens the company card (`/customers/<id>`); the row click still opens the task dialog (`server/tasksGroupLink.test.ts`)
- [x] Invoice lists: replace the two-option scope tabs with one "Installments" toggle button (click filters, click again clears) — Invoices, Customer 360 and group card (`server/installmentToggle.test.ts`)

## Credit notes inside the transactions list (user request 31/7)

- [x] Merge open credit notes into the single transactions table (no separate block), ordered together with invoices by issue date (`InvoicesTable` `creditNotes` prop + `CreditNoteRow`)
- [x] "Credit notes (n)" toggle button in the transactions toolbar — click shows only credit notes, click again clears (customer + group card)
- [x] Credit-note rows: negative amounts, sky-tinted row, doc number with icon, issue date in the date column, Match action
- [x] Backend: `allocateCreditNote` / `removeCreditNoteAllocation` / `listCreditNoteAllocations` with group, currency, invoice-outstanding and over-allocation guards
- [x] Allocation dialog `AllocateCreditNoteDialog`: group open invoices, search, Max fill, remaining credit, existing matches with undo
- [x] Vitest `server/creditNoteAllocation.test.ts` (partial match → Partially Paid, undo reverts to Open, full match hides the credit note, over-allocation rejected)

## Internal transfers: cleanup + toggle (user request 31/7)

- [x] Delete the vitest leftover wire transfers (45 orphan rows whose customer no longer exists, incl. the repeated "Our office → Prime Products LTD €3,000" internal rows) and the 2 orphan test invoices — 8 real transfers left (5 client + 3 internal)
- [x] Wire Transfers page: by default show only client transfers; a toggle reveals the intercompany (internal) ones
- [x] Same toggle on the Wire Transfers tab of the customer and group card
- [x] Vitest coverage: internal transfers excluded unless requested, and cleanup left no orphan rows
- [x] Fix the allocation vitest teardown so derived inter-office transfers are deleted with their source transfer (no new orphan rows)
- [x] Merge wire transfers (payments) as rows inside the unified transactions table, not a separate block
- [x] Restore the issue-date column and sort invoices, credit notes and transfers together by issue date
- [x] Toggle "Payments" to show only wire transfers in the transactions list
- [x] Remove the Allocate action from the customer/group transactions list — allocation happens only on the Wire Transfers page
- [x] Vitest coverage: merged transaction rows carry an issue date and sort correctly; transfers-only filter works
- [x] Wire Transfers page: move the Date column to the first position (before Customer)
- [x] Vitest coverage: Date column leads the wire transfers table (header, row cells, stored widths)

## Log Call: assignee for the auto-created follow-up task (user request 1/8)
- [x] Log Call dialog: "Assigned to" picker for Promise to Pay (Confirmed) and Pending Follow-up, defaulting to the current user
- [x] `calls.logCall` accepts an `assigneeId` team-member id and passes it to the promise / follow-up task helpers
- [x] Rescheduling an existing promise or follow-up also updates the assignee, keeping the previous owner as watcher
- [x] New `team.myMember` procedure so pickers can default to the logged-in colleague
- [x] Vitest coverage: task created for the chosen assignee, hand-over adds previous owner as watcher, unknown member rejected

## Transactions list: unified sorting, Issue Date first, inline matching (user request 1/8)
- [x] Sorting by any column moves invoices, credit notes and payments together (sorting by vessel no longer reorders only the amounts)
- [x] Credit notes and payments sort as negative amounts, so a payment never ranks beside the biggest invoices
- [x] Issue Date is the first column of the transactions table (header, all three row kinds, stored column widths)
- [x] Match action restored on open credit-note rows
- [x] Allocate action available inline on received payment rows (no more link to the Wire Transfers page)
- [x] Allocating or removing an allocation refreshes the customer card and the group card as well
- [x] Vitest coverage: unified sort helper, column order, inline Match / Allocate actions

## Transactions list: sticky column header (user request 1/8)
- [x] Column header stays visible while scrolling the transactions list on the group card and the customer card
- [x] Scrolling moved into the table's own container (shadcn Table now accepts containerClassName / containerStyle) so the sticky header actually pins
- [x] Header cells painted with an opaque background so rows do not show through
- [x] Vitest coverage: sticky classes, container forwarding, bounded height on both cards

## Naming: Groups List (user request 1/8)
- [x] Sidebar menu entry renamed from "Group List" to "Groups List" (page title and back links on both cards follow the same wording)
- [x] Fixed a test that broke on the 1st of a new month: the forecast test now samples the latest month with entries and cleans up any row it creates

## Address Book (replaces Contacts) — user request 1/8
- [x] Design proposal written (docs/address-book-proposal.md) and sent for approval
- [x] Approved: the collections screen stays separate from the Address Book
- [x] Rename the "Groups List" menu entry to "Collections Desk" (page title and back links follow)
- [x] Final name chosen by user: "Collections Desk"
- [x] Schema: custom_field_defs, custom_field_values, saved_views, list_layouts (migration 0039 applied)
- [x] addressBook tRPC router: entity lists, cross-entity search, fields, values, views, layouts, export
- [x] Address Book page with 4 entity tabs (Groups, Customers, Vessels, Contacts) replacing the Contacts menu entry
- [x] Cross-entity search returning grouped results across all four types
- [x] Sticky header + resizable columns on all four lists (same behaviour as the transactions list)
- [x] Column visibility and order per user, per tab (persisted in list_layouts)
- [x] Record cards with relationship blocks (group -> companies -> vessels -> contacts), each row clickable
- [x] Editing of user-owned fields (contacts); ERP-owned fields marked read-only in the field picker
- [x] Custom field definitions per entity type (text, number, date, select, checkbox, email, phone, url)
- [x] Custom field values shown on cards, available as columns and included in exports
- [x] Filters (group + tab-specific) and saved views, personal or shared with the team
- [x] Export the current view to Excel / PDF / CSV via the existing buildExcel / buildPdf helpers
- [x] Vitest coverage for the Address Book router and the UI contract (15 tests)
- [x] Column filters usable on any column including custom fields (contains/is/greater/less/empty), saved with views
- [x] Field visibility settings for record cards (show/hide per custom field, per user)
- [x] Data quality panel: duplicate emails, duplicate name-in-company, invalid emails, missing phone, contacts without group, companies without contact, vessels without IMO/owner
- [x] Merge duplicates with per-field value choice; losers archived with a pointer to the survivor, custom values carried over
- [x] Archive instead of delete for contacts, with an archive view and restore
- [x] Multi-select contact rows to merge manually
- [x] Excel import wizard: file upload, column mapping (incl. custom fields), create/update/skip preview, per-row exclusion
- [x] Active Address Book tab persisted in the URL (?tab=group|customer|vessel|contact)
- [x] Vitest coverage for quality checks, archive, merge and the import contract (19 tests)
- [x] Address Book record card enlarged: resizable dialog (persisted size, drag edges, double-click to reset), sticky header, scrollable body, full related lists instead of first 12
- [x] Address Book: deep link a record via ?record=<key>
- [x] Decide whether the standalone Vessels page stays now the Address Book has a Vessels tab (decision: keep it — it is the AR view with balances/overdue; the old separate Contacts page is the one that was removed)
- [x] Restyle the Address Book to match AR Pro: page header with icon, summary strip with reset, toolbar grouped in a card panel, entity tabs as a segmented control with count pills, table inside a Card with muted sticky header and hover rows
- [x] Address Book: primary name cells rendered as sky-700 icon links like the other AR Pro lists
- [x] Address Book record card restyled: sky accent title icons, each block in its own panel, loading state, sky-700 relationship links
- [x] Address Book vessels tab: "Open AR card" action opens the financial vessel dialog so the two vessel views are connected instead of duplicated
- [x] Vitest guard for the Address Book visual contract and the vessel AR link (server/addressBookStyling.test.ts, 12 tests)

## Floating AI assistant (user request 1/8)
- [x] "Ask AR Pro" launcher bottom-right on every screen (mounted once in DashboardLayout), Ctrl/Cmd+J toggle
- [x] Resizable chat panel with thread and size persisted in localStorage, markdown answers, suggested question chips, clear-thread action
- [x] Assistant knowledge base (server/lib/assistantKnowledge.ts): navigation map of every screen plus business rules (group key, aging buckets, statuses, forecast, DSO, promises) and answering style
- [x] Assistant live-data layer (server/lib/assistantFacts.ts): portfolio snapshot (AR balance, overdue, aging, DSO, month target vs collected, workload, status counts, top 10 overdue groups) plus per-group/vessel/contact facts resolved from the question text
- [x] Assistant backend (server/routers/assistant.ts): protected intro + ask procedures, history trimmed to 8 turns, gemini-2.5-flash, questions audit-logged, read-only by design
- [x] Accent-insensitive Greek/Latin name matching with legal-form suffix stripping so "ναυτιλιακη αφοι κατσαρη" resolves "ΝΑΥΤΙΛΙΑΚΗ ΑΦΟΙ ΚΑΤΣΑΡΗ Α.Ε."
- [x] Vitest coverage for the assistant (server/assistant.test.ts, 25 tests): snapshot totals reconcile, top-debtor ordering, group facts consistency, unknown-entity handling, router surface, widget wiring

## Compact Log Call dialog (user request 1/8)
- [x] Log Call dialog fits on screen without scrolling: two-column layout, fixed header/footer so Save/Cancel are always visible
- [x] Bug: selecting Pending Follow-up / Promise to Pay grows the form and pushes the Log Call button out of view — fixed with flex column + pinned footer, verified in all response states
- [x] Deep links for the call flow: `?logCall=1` opens the dialog, `?response=` preselects the customer response and skips the active-communication pre-step

## Dashboard — overdue end of month (user request 2/8)
- [x] Show "Overdue end of month" inside the Outstanding Overdue KPI card, computed as all open invoices due on or before the last day of the current month

## Assistant panel robustness (user report: cannot continue after a reply)
- [x] Focus returns to the composer automatically after each answer (and after an error), so the next question can be typed without clicking
- [x] Composer footer raised above the message area (`relative z-10`, `shrink-0`) so long markdown output can never overlay the input or send button
- [x] Long markdown output contained: tables/pre scroll horizontally inside the bubble instead of stretching the panel
- [x] Resize listeners mounted for the panel lifetime and `userSelect` always cleared on unmount, so a missed mouseup can no longer leave the panel unclickable
- [x] REMOVED at user request: the floating AI assistant is gone — widget, tRPC router, knowledge/facts libs and its test suite deleted; no launcher on any screen
## Address Book — Person vs Department contacts (user request)
- [x] `payment_contacts.contactType` column (`Person` | `Department`, default `Person`) in schema, migration generated and applied
- [x] Address Book Contacts list: Type column with badge (person vs department icon), sortable and filterable
- [x] Quick filter on the Contacts tab: People & departments / People only / Departments only (persisted in saved views)
- [x] Contact record card shows the type and can change it via dropdown (persists immediately)
- [x] Import wizard can map a Type column, defaulting to Person when the column is absent
- [x] Export (Excel/CSV/PDF) includes the Type column (exports the visible columns)
- [x] Log Call contact dropdown marks departments so the user knows it is not a person
- [x] Bulk email flow lists departments first with a Dept badge; new inline contacts can be created as a department
- [x] Bulk "Mark as department / Mark as person" actions on the contacts selection bar
- [x] Data Quality panel: suggest Department for generic email prefixes (accounts@, ar@, finance@, ops@, info@, admin@, purchasing@ ...) with per-row and bulk apply — never applied silently
- [x] Vitest coverage for type persistence, filtering, suggestion rules and import mapping (20 specs in server/contactType.test.ts)

## Search everywhere (user request)
- [x] Global search box also returns contacts (people) and vessels, not just groups/companies/invoices/notes/tasks
- [x] Accent- and case-insensitive Greek/Latin matching so "Αντρέας Μπουκόλο" / "andreas boukolos" both hit the stored spelling
- [x] Multi-token search: each word may match a different field (e.g. surname + company)
- [x] Address Book "Search this list" searches across related entities — contact name, company, group and vessel — on every tab
- [x] Per-list search boxes on Collections Desk and Invoices use the same accent-insensitive multi-token matcher (Address Book + Vessels already did); Invoices search also covers vessel and group

## Promises without a stated amount (user clarification)

Customers often promise to pay without naming a figure. Such a promise IS valid and
must be recorded and tracked as a task; only the amount is unknown.

- [x] Root cause: closing/escalating a promise-check task leaves the promise row Pending forever, so the stale promise keeps firing the "Open promise exists" banner (DYNACOM 6270001, MINERVA 7260001)
- [x] Settle the linked promise when its check task is Completed (Kept) or Cancelled/superseded (Broken)
- [x] Treat a promise whose every linked task is closed as no longer open in findOpenGroupPromise
- [x] Never render an amount-less promise as "€0" — show "amount not stated" everywhere (Log Call banner, Collections Desk, task titles, group card)
- [x] Keep the promised date mandatory even when the amount is unknown
- [x] Backfill the missing follow-up tasks for the two existing amount-less promises
- [x] Add regression tests: amount-less promise creates a task, and is never displayed as €0

## Unified customer/group card (user approved)

The Collections Desk drill-in is the receivables view; the Address Book holds the
master record. Same company, two screens. Unify them.

(tracked in the "Unified customer/group card (user request 1/8)" section at the bottom of this file)
- [x] Vitest coverage for accent-insensitive matching, multi-token queries and cross-entity list search

## Group-shared contacts must not be double counted (user note)
- [x] Contacts that exist on several companies of the same group are counted once per group in group/company contact counts
- [x] Group card and Collections Desk contact counts show distinct people, not per-company duplicates
- [x] Vitest coverage that a contact shared by N companies of a group counts once

## Gift list 2025 (user request, file: ΤΕΛΙΚΗ ΛΙΣΤΑ ΔΩΡΩΝ 2025 - ΑΝΤΖΕΛΑ.xlsx)
- [x] Read the workbook and normalise its rows (recipient, company/group, gift, any notes) — 468 rows parsed
- [x] Match each gift recipient against existing contacts (accent-insensitive, rarity-weighted, company-aware); match report with exact / probable / unmatched
- [x] Gift-recipient data model on contacts (year-aware `contact_gifts` table: tier, region, sourceName, sourceGroup)
- [x] Import the matched rows; never silently create or overwrite contacts — 152 exact matches loaded for 2025
- [x] Gift badge in the Address Book contacts list and on the contact record card
- [x] Filter for gift recipients (e.g. All / Gift recipients / Not on gift list)
- [x] Vitest coverage for the matching rules, gift flag persistence, badge and filter
- [x] Gift tier editable from the contact record card (dropdown), plus add/remove a contact from the gift list
- [x] Gift review screen: approve the 57 probable matches per row; list the 113 unmatched names and 22 quantity-only rows
- [x] Export the gift match report (CSV) for offline review
## Search across all entities (user request)
- [x] Global search is accent-insensitive: "Αντρέας Μπουκόλο" and "Andreas Boukolos" both match
- [x] Global search matches multiple tokens in any order (surname first or given name first)
- [x] Global search covers contact names, vessels, companies, groups, emails and phones
- [x] Each list's own "Search this list" box searches the row's related entities (contact, vessel, company, group)
- [x] Vitest coverage for accent folding, token-order independence and cross-entity coverage

## Group-shared contacts (user request)
- [x] Group contact counts count unique people, not one row per member company
- [x] Record card related-contacts list shows each person once per group
- [x] Contacts list collapses the same person into one row, carrying every company and group they sit on (7,491 people vs 7,762 raw rows); Contacts tab badge counts people

## Promise lifecycle & amount-less promises (user request 1/8)
- [x] A Pending promise counts as open only while a linked check task is still live; completed/cancelled/escalated tasks settle it, so the false "Open promise exists" banner is gone (DYNACOM, MINERVA, MSC, TMS, CAPITAL GAS repaired)
- [x] Vitest coverage for the open/settled rule, incl. escalated copies and promise ids sharing a prefix
- [x] Promise without a stated amount shows "amount not stated" instead of €0 (Log Call banner, Collections Desk, task detail, forecast promises list)
- [x] Amount field is optional in every promise form (Log Call, task detail next-step/convert, customer card, group card) and on the matching server procedures
- [x] Vitest coverage for amount-less promises (server/promiseNoAmount.test.ts)
- [x] Backfill historical promise activity-log lines that printed "— €0" (3 rows repaired; no task titles affected)

## Unified customer/group card (user request 1/8)
- [x] One card per company/group with two tabs: "Receivables" (balances, aging, transactions, promises, tasks, activity) and "Details" (identity, related companies/vessels/contacts, custom fields)
- [x] Collections Desk row click and Address Book row click open the same card (group/company rows and `?record=` deep links land on `/groups/:name?tab=details` / `/customers/:id?tab=details`)
- [x] Shared `RecordDetailsPanel` renders the Details body in both the Address Book modal (vessels/contacts) and the card pages, so the two cannot drift apart
- [x] Contacts on the Details tab deduped per person, departments marked "· dept", gift tier/history editable from the card
- [x] Active tab addressable via `?tab=details`, synced with history.replaceState (no page re-mount)
- [x] Tests covering the unified card routing and tab content (addressBook, styling, dedup, card-size and contactType assertions repointed at the shared panel)

## Address Book visual alignment with the rest of AR Pro (user request 1/8)
- [x] Entity switcher uses the stock segmented control (`TabsList h-10`) with plain muted mono counts, dropping the bespoke muted panel and the sky count pills
- [x] Filters moved onto an open row (switcher + search + selects) instead of the boxed `rounded-lg border bg-card p-3` toolbar — that box was the main reason the page looked foreign
- [x] Secondary tools collapsed into one row (Filters, Import, Data quality, Gift review, Fields, Save current view; Columns + Export right-aligned), so the page reads header → filters → tools → summary → table like Invoices
- [x] Page header matched to the other list pages: neutral title icon (was sky-600), one-line subtitle, contacts actions kept on the title row
- [x] Table header/rows verified as already shared via `AddressBookTable` (card wrapper, sticky muted header, hover rows, footer inside the card) — same treatment as Vessels/Invoices
- [x] Route-level `PageFallback` renders a title + filters + table skeleton instead of the bare "Loading…" line (applies to every lazy page, not just the Address Book)
- [x] Vitest coverage for the aligned styling contract (`addressBookStyling.test.ts` asserts the stock switcher, no boxed toolbar, row order and the skeleton shell) — 555 tests pass

## Log Call → task → status tracking is unreliable (user request 1/8)
- [x] BUG: `(Follow-up: <group>)` marker parsed with non-greedy `(.+?)\)` truncates group names containing a `)` — fixed in `server/taskMarkers.ts` (greedy `(.*)`)
- [x] Fix every marker parse to capture the full group name (greedy/anchored) and add a shared parse helper instead of 12 duplicated regexes — all 13 call sites in `ar.ts` use `parseFollowUpGroup`, no raw regex remains
- [x] Repair the orphaned status rows already in the database — verified 0 orphan rows in `group_confirmation_status` (audit 2/8)
- [x] Store the group on the task (real `tasks.customerGroup` + `tasks.promiseId` columns, migration 0046, backfilled); all 30 read sites now use `taskGroup`/`taskPromiseId`/`isTaskOfGroup` with the text marker only as a legacy fallback (`server/taskGroupColumn.test.ts`, 5 tests)
- [x] Every logged call leaves a trace: a no-answer call is written as an explicit "Contact attempt — no one answered; status unchanged" timeline line
- [x] Log Call forces an explicit next step (status + date), and every called group now carries a status row (7 called groups / 7 status rows)
- [x] Per-user call tracking: every timeline entry stores `createdBy`, and the Desk shows call counts / no-answer counts per group
- [x] Vitest coverage for group names with parentheses across the call→task→status flow (`server/taskMarkers.test.ts`)

## Review statuses without creating tasks (user request 1/8)
- [x] Inline status editing on the Collections Desk: change a group's communication status straight from the row, no dialog, no task
- [x] Quick "no next step needed" statuses so a review can be recorded without a follow-up task (calls.reviewStatus — Kept / Broken / Not Contacted only)
- [x] Show when the status was last reviewed and by whom, so stale statuses are visible at a glance
- [~] Bulk status review — cancelled: superseded by the later decision that a confirmation status may only come out of a real conversation, so it is written only by Log Call (`server/statusOnlyViaLogCall.test.ts` pins that no bulk/inline setter comes back)
- [x] Review freshness is visible instead: the Desk badge shows "Last reviewed"/"Never reviewed" (who + when), and the "Action due" filter (Any / Due today or earlier / Past due only) with due-first ordering is the daily review list

## Operating model — how the team should work in the hub (user request)
- [x] Link team members to their login accounts so the @mentions inbox works (Kostas → user 1, Faye → user 40680029; Theofilos has no login yet)
- [x] Make the link visible/manageable in the Team screen instead of only in the database (Sign-in account column, one-to-one guard)
- [x] Group Notes now support @mentions too (was the only note field without them)

## Bug: "Not Confirmed" outcome is lost from the Activity Log
- [x] Root cause: the "Choose next action" buttons in LogCallDialog OVERWROTE `confirmationStatus`, so the server never learned the call started as "Did not confirm"
- [x] `logCall` accepts a `customerResponse` field carrying what the customer actually answered
- [x] Timeline title now reads "Call — Reached · Did not confirm → Pending Follow-up" (or → Promise to Pay), and the body records "Customer response: Did not confirm"
- [x] No duplication when the call ends on the same status it started on
- [x] Dialog shows an amber notice "Recorded as Did not confirm → …" with a link back, so the collector sees what will be logged
- [x] Tests: server/notConfirmedInTimeline.test.ts covers all three cases

## Sidebar restructure into sections
- [x] Grouped the navigation: Dashboard (ungrouped), COLLECTIONS (Collections Desk, Invoices, Wire Transfers), CRM (Address Book, Vessels, Contracts), MANAGEMENT (Reports, Tasks, Team, Settings)
- [x] CRM section added, holding the who/what data: Address Book, Vessels, Contracts
- [x] Vessels and Contracts kept reachable under CRM instead of being orphaned
- [x] Section headers are non-clickable uppercase muted labels, hidden when the sidebar collapses to icons (tooltips carry the meaning there)
- [x] Active-route highlight verified on every item
- [x] Test server/sidebarSections.test.ts pins the section order, the item-to-section mapping, and fails if any routed page becomes unreachable from the sidebar
- [x] Section headers are CLICKABLE buttons: clicking COLLECTIONS / CRM / MANAGEMENT expands or collapses that section's items
- [x] Chevron rotates to indicate open/closed state (200ms)
- [x] The section containing the current page is always kept open, so the user can never hide where they are
- [x] Open/closed state persisted per section in localStorage (sidebar-open-sections), unknown labels dropped on read
- [x] Keyboard accessible (native button = Enter/Space) with aria-expanded and aria-controls
- [x] When the sidebar is collapsed to icons, all items stay visible since there is no header to click
- [x] Test coverage extended in server/sidebarSections.test.ts (5 tests)

## Bug: "Open promise exists" reschedule choice does nothing
- [x] The radio ("Reschedule this promise" / "Create a separate new promise") sent `promiseMode`, but logCall's input schema accepts `reschedulePromiseId` and ignored `promiseMode` entirely — so BOTH options created a duplicate promise row and the reschedule counter never incremented
- [x] Decision: keep the radio (both cases are real business events) and wire it properly — the dialog now sends `reschedulePromiseId` when "reschedule" is chosen
- [x] Kept the warning line itself (open promise + reschedule count is real, useful information)
- [x] Test added in server/promiseRescheduleWiring.test.ts (2 tests): reschedule updates in place and increments the counter; "separate promise" adds a row
- [x] Evidence found in live data: EVALEND (TANKERS) has 2 identical open promises (ids 8520001 / 8550001, same date, reschedule count 0), created 65 seconds apart — exactly the duplicate the radio was meant to prevent
- [x] Audit trail cleaned: 53,147 of 53,781 rows were written by vitest users; only 634 real rows remained. Snapshot cleanup now sweeps audit rows, a global vitest teardown sweeps the rest, and `dataIntegrity.test.ts` fails if rows from earlier runs survive
- [x] Audit every screen as built today: 13 pages / 45 components inventoried in `docs/usage-measurement-2026-08.md` (Dashboard, Desk with Groups+Companies, Group detail, Customer detail, Address Book, Invoices, Vessels, Contracts, Tasks, Wire Transfers, Reports, Team, Settings)
- [x] Audit the data model behind collaboration: two identity lists coexist — `team_members` (3, none linked to a login) and `users` (7 real logins, 1 admin); notes/mentions/comments UI is fully built but carries 0 rows
- [x] Measure real usage: 634 real audit actions (Log Call 117, Create Task 79, Promise 48, Wire allocation 22, SoA export 21, AI summary 16); empty tables: notes, mentions, task comments, receipts, bank details, collection plans, email templates
- [x] Document the intended daily and weekly workflow per role — written in `docs/operating-model.md` (Credit Manager works the Desk by action date; Account Manager intervenes only commercially on own groups; Director reads the Dashboard)
- [x] Identify the gaps between the built app and that workflow — no "my list" (1 of 3,409 customers has a collector), team members not linked to logins, tasks used as a second queue, unused collaboration surface, unscheduled taskEngine, Outlook-only email wording
- [x] Decide where internal team communication belongs: customer-specific talk becomes a group note with @mention; everything else stays in Teams/email. Do NOT build chat, messaging or email notifications; re-evaluate the mentions inbox and task comments in a month and remove if still unused
- [x] Decide the fate of the GitHub-side ActivityFeed/@mentions commit (f781da7): leave abandoned — `CommunicationTimeline` + `MentionTextarea` + mentions inbox already supersede everything in it
- [x] Deliver a written operating model document to Kostas for agreement before building — `docs/operating-model.md` plus the measured basis in `docs/usage-measurement-2026-08.md`

## Call Back schedule + visible call notes (agreed 2 Aug 2026)
- [x] Server: `customers.callBackList` builds a date-ordered schedule from promise dates, follow-up dates and never-contacted overdue groups
- [x] Each row carries the last call note, who called, the amount and the reason it is due
- [x] New "Call Back" page in the sidebar, grouped into Overdue / Today / Scheduled / Never contacted (collapsed)
- [x] Log Call opens straight from a Call Back row, and the row disappears once the date moves
- [x] Show the full call note (expandable) instead of the 2-line clamp — done in the unified timeline
- [x] Add the activity timeline to the company card (CustomerDetail) — done with the unified timeline
- [x] Make call notes searchable — search box inside the timeline card
- [x] Vitest coverage for the note visibility (`client/src/lib/timeline.test.ts`, `server/groupLastContact.test.ts`); the Call Back page itself was replaced by the due-date filter on the Desk
- [x] Vitest: server/statusReviewNoTask.test.ts pins that the review path never creates a task or promise

## Wipe the test promise/task data (user request 2/8: "ολα ηταν τεστ")
- [x] Confirm the exact delete scope with Kostas before touching the database
- [x] Delete all 284 rows from `promises_to_pay`
- [x] Delete all 324 tasks (318 auto-generated + 6 manual — user asked for a clean slate)
- [x] Delete the full activity log (1908 rows incl. 193 calls, 375 promise entries)
- [x] Delete the 170 group notes
- [x] Clear the 14 `group_confirmation_status` rows
- [x] Clear dependent rows: group_watch_status 85, task_watchers 51, task_invoices 10, on_hold_proposals 2, group_collection_profile 1
- [x] Verify master data untouched: customers 3620, invoices 5635, vessels 184, contacts 7762, behavior 614, forecast 721
- [x] Verify Call Back, Collections Desk, Tasks and Forecast render on the empty data
- [x] Re-run the full vitest suite after the cleanup (87 files, 588 tests passing)

## Make the communication flow visible on the card (user: "η ροή στην καρτέλα να φαίνεται εύκολα")
- [x] Show last contact in the card header: when, by whom, outcome, note preview
- [x] Move the communication history above the Transactions table on the group card
- [x] Merge the two split history blocks (Activity Log + Group activity tabs) into one timeline
- [x] Add type filters to the unified timeline (calls, notes, promises, emails, tasks, status)
- [x] Expand long notes instead of clamping at 2 lines
- [x] Add the same timeline to the company card (currently has none)
- [x] Frame the card around the current month cycle (Aug 2026) with previous months collapsed
- [x] Surface the existing `carriedOver` flag so a status set last month is visibly distinct (group header + Collections Desk badge)
- [x] Never let a promise write into forecast_entries (forecast is run separately by the user)
- [x] Make call notes searchable (search box inside the timeline card)
- [x] Vitest coverage: client/src/lib/timeline.test.ts (9 tests) + server/groupLastContact.test.ts (2 tests)
- [x] Decided: the "Group activity" tabs card stays. It is not a duplicate of the timeline — it is the tabular ledger view (payment history, contracts, tasks, emails) that the chronological timeline cannot replace.

## Log Call must be fully independent of tasks (user request 2/8)
- [x] Log Call never creates a task (no follow-up task, no promise-check task)
- [x] Log Call never cancels or edits an existing task
- [x] Status badges always open Log Call — never redirect to a linked task
- [x] Remove the "active case → open its task instead" gate (LogCallLauncher deleted)
- [x] Keep the call itself recorded (activity log + status + amount + promise) with no task side effects
- [x] Remove "Assigned to" from the Log Call dialog (a call assigns no work)
- [x] Vitest: server/logCallNoTasks.test.ts (7 tests) — task list byte-identical before/after a call
- [x] Update/remove obsolete tests that asserted calls create tasks (logCallAssignee, followUpContact removed; confirmationStatus, confirmationTaskLink, followUpCleanup, followUpActions, activeCommunication updated)

## Track who spoke to which customer (user request 1/8)
- [x] "No Answer" is a real outcome: records a contact attempt, leaves the status alone, creates no task
- [x] Groups payload exposes lastCallAt / lastCallBy / callCount / noAnswerCount
- [x] "Last Contact" column on the Collections Desk: who called, when, and unanswered attempts
- [x] Filter the desk by "not called in X days" / never called / unanswered / called today
- [x] Vitest: server/contactTracking.test.ts (17 tests) covers the no-answer path, aggregation and desk column

## Everything from the Collections Desk — delete Call Back (user request 2/8)
- [x] Delete the Call Back page, its route and the sidebar entry (`/call-back` now redirects to the Desk)
- [x] Collections Desk shows when a promise / follow-up date has arrived: `actionDate` / `actionDue` on the groups payload, rendered as a red/amber date line under the status badge
- [x] "Needs action" banner removed at the user's request (2/8) — the row marker and the "Action due" filter cover it
- [x] "Last Contact" column removed from the Collections Desk at the user's request (2/8); contact history stays on the group card timeline

## Status changes only through Log Call (user request 2/8)
- [x] Remove the review caret / dropdown from the confirmation badge in the group list
- [x] Badge becomes a plain "log a call" button; no inline status setting anywhere in the list
- [x] Remove the quick-review status setters from the backend (`calls.reviewStatus` / `reviewStatusBulk`) and any bulk review UI
- [x] Remove the "Next action" dialog (broken promise → follow-up / new promise / escalate) so no status is set outside Log Call
- [x] Vitest: `statusOnlyViaLogCall.test.ts` (7 tests) pins Log Call as the only status path
- [x] Remove the "no task created" wording from every toast / hint after logging a call

## Timeline duplication bug (reported 2/8)
- [x] One logged call with a promise shows two timeline rows ("Call logged" + "Promise-to-Pay") — merged into a single entry that names the call and its outcome
- [x] Vitest: `logCallSingleEntry.test.ts` (4 tests) — a call that records a promise produces exactly one timeline entry

## Collection Status column (user request 2/8)
- [x] Renamed the Desk "Confirmation" column header to "Collection Status" (filter now reads "All collection statuses")
- [x] Column is sortable by collection urgency (Broken → Escalated → Pending Follow-up → Promise → Not Contacted → Kept)
- [x] Vitest: `collectionStatusSort.test.ts` (5 tests) covers the urgency ranking

## Timeline entry must carry the full Log Call information (reported 2/8)
- [x] Root cause: the dialog sent `contactId` but `calls.logCall` had no such input, so the contact was dropped; follow-up amount was never written either
- [x] Timeline entry now includes company, contact (resolved from the saved contact list), collection status, amount, promised/follow-up date and the note
- [x] Removed the duplicated outcome sentence from the entry body (it already leads the title)
- [x] Vitest: `logCallTimelineDetail.test.ts` (5 tests) asserts every field entered in Log Call appears in the single entry

## @mention of internal team members in notes (requested 2/8)
- [x] Typing `@` in a note field opens a picker listing our own Team members (not customer contacts)
- [x] Mention is stored in a structured way (member id) so it survives renames and can be queried
- [x] Mentioned names render highlighted in the communication timeline entry
- [x] Mentioned member gets a visible notification/badge (no email spam), with a list of their mentions
- [x] Available in Log Call notes and in Collection Notes
- [x] Mentioning must NOT create a task (keeps the Log-Call-creates-no-work rule)
- [x] Vitest: parsing, storage and retrieval of mentions (`shared/mentions.test.ts` 9, `server/noteMentions.test.ts` 5)

## Collections Desk: load all groups + date-driven sort (requested 2/8)
- [x] Groups list loads every group by default (no 100-row cap / "Show all" step); companies list too
- [x] Collection Status sort orders by action date: overdue (oldest first) → today → future (soonest first) → no date → Not Contacted last
- [x] Vitest for the date-driven ordering (`collectionStatusSort.test.ts`, 8 tests)
- [~] Virtual scrolling for the Desk tables — cancelled by user (no measured slowdown)

## Rename "Broken" to "Did not confirm" (requested 2/8)
- [x] Log Call status option and every UI label read "Did not confirm" instead of "Broken" (badge, Desk filter, timeline lines); the task promise button reads "Did not pay"
- [x] Stored value stays `Broken` (no migration), only the display label changes
- [x] Vitest pinning the label mapping (`confirmationStatusLabels.test.ts`, 4 tests)
- [x] "Action due" filter in the filter row (Any due date / Due today or earlier / Past due only)
- [x] Default Desk ordering puts due rows first (past due, then due today, oldest date first), and due rows are tinted red/amber
- [x] Removed the `customers.callBackList` procedure
- [x] Vitest coverage for the due flags (`server/deskActionDue.test.ts`, 5 tests)

## Full application audit (requested 2/8)
- [x] TypeScript typecheck clean (`tsc --noEmit`)
- [x] Full vitest suite green (96 files / 643 tests) — fixed 2 stale suites (contactTracking, contactsImport)
- [x] Test residue purged from the live DB (69 fake calls on a real group, 12 fake promises, 293 orphan timeline rows, 244 fixture invoices, ~250 fixture customers/contacts)
- [x] Test isolation hardened: fixtures now delete contacts/timeline/notes/mentions/status; `logCallNoTasks` no longer writes on a real customer
- [x] New guard `server/dataIntegrity.test.ts` fails if orphan rows or test residue reappear
- [x] Dead code sweep: orphan pages/components removed (Forecast, ComponentShowcase, AIChatBox, Map, unused shadcn primitives)
- [x] Unused tRPC procedures removed (escalationStory 167 lines, callList, myMember, updateField, giftYears, syncPushReceipt, runEngine) and unused `server/db.ts` helpers
- [x] Junk files removed (`vite.config.ts.bak`, `server/routers/ar.ts.new_calls`, one-off scripts) and unused deps (streamdown, framer-motion)
- [x] `.manus-logs` reviewed — no runtime errors; stale email TODO comment corrected
- [x] Performance: 5 missing indexes added (migration 0045); payloads trimmed (customers.list 4.0→2.6 MB, contacts 4.3→3.0 MB); new light `customers.options` (420 KB) + `customers.groupMembers` for the 5 pickers and the Log Call dialog
- [x] Recharts moved to a lazy chunk (initial JS ~1.2 MB → 808 KB); Desk Companies tab now pages 200 rows instead of 3,409
- [x] Vitest raised to a 30s timeout (remote DB latency was causing flaky failures); suite 97 files / 656 tests green
- [x] Key pages verified rendering (Dashboard, Collections Desk, Address Book, Invoices, Reports, Contracts, Vessels, Tasks, Team, Settings, Group/Customer detail)
- [x] Written audit report delivered (`docs/audit-2026-08.md`)

## Log Call: drop the open-promise question (requested 2/8)
- [x] Remove the "Open promise exists" banner and the reschedule/new radio from the Log Call dialog (replaced by a one-line "Moving the open promise of … due …" notice)
- [x] Server: a Promise to Pay logged for a group with an open promise always moves that promise (no duplicate row), without needing a client flag; legacy `reschedulePromiseId` still accepted
- [x] Tests rewritten (`server/promiseRescheduleWiring.test.ts`, 3 tests): auto-move without a flag, legacy flag honoured, first promise still created. Suite 103 files / 678 tests green

## Remove escalation, use Critical instead (requested 2/8)
- [x] Remove the Escalate action + form from TaskDetailDialog (both the promise "Did not pay" and the follow-up branches) — replaced by a hint pointing at the Critical status
- [x] Delete EscalationPanel and the escalated-task slim layout in TaskDetailDialog
- [x] Remove the `tasks.escalate`, `tasks.escalationSummary` and `tasks.escalationDecision` procedures and the escalationHistory/story helpers
- [x] Drop the `Escalated` collection status from the Desk filter, badges and labels (no rows used it)
- [x] Remove `escalate_account_manager` from nextAction suggestions; it now suggests `mark_critical`
- [x] Critical is the documented hand-over path (docs/escalation-guide.md); the Account Status dropdown on the group card is the single control
- [x] Management queue already available: Desk `All statuses` filter + Dashboard Critical/On Hold counters
- [x] Deleted the 5 escalation test files and updated the tests that asserted escalation behaviour — suite 98 files / 640 tests green
