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
