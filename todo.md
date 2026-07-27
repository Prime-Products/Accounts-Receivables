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

- [ ] Backend: Create `payments.recordPayment` tRPC procedure to create a new receipt (amount, date, method, notes, customerId)
- [ ] Backend: Create `payments.getOpenInvoices` tRPC procedure to fetch open/partially paid invoices for a customer
- [ ] Backend: Create `payments.allocatePayment` tRPC procedure to allocate a receipt to one or more invoices (receiptId, allocations: [{invoiceId, amount}])
- [ ] Backend: Update invoice status logic when allocations are created (Open → Partially Paid → Paid based on paidAmount)
- [ ] Backend: Add vitest tests for payment recording and allocation logic
- [ ] Frontend: Add "Record Payment" button to CustomerDetail or GroupDetail actions
- [ ] Frontend: Create payment recording modal (amount, date, method, notes)
- [ ] Frontend: Create invoice allocation dialog (list of open invoices with checkboxes, amount input for partial payments, total validation)
- [ ] Frontend: Show allocated amounts on invoices (Paid / Partially Paid status with visual indicator)
- [ ] Frontend: Add optimistic updates for payment allocation
- [ ] Test end-to-end: record payment, allocate to invoices, verify status updates and invoice list reflects changes
- [ ] Checkpoint: Payment reconciliation system complete


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
- [ ] Update Open Balance calculation to deduct received wire transfers (deferred — user chose manual invoice matching instead)
- [x] Update Collected calculation to include received wire transfers
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
