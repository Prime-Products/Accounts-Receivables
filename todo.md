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
