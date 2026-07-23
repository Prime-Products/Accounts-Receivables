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

## Customer Group hierarchy (user request 23 Jul)
- [x] Inspect Excel to confirm group → member companies structure (363 groups / 811 companies; customerGroup already populated in DB for all customers)
- [x] Backend: customers.groups endpoint — aggregated totals per group (outstanding EUR + per-currency, overdue, company count)
- [x] Backend: customers.groupDetail endpoint — group aggregates + invoices, scoped by optional company and Prime Branch filters (AND-combined)
- [x] Customers page: Groups/Companies toggle — group totals with per-currency breakdown, click-through to group card
- [x] Group card page (/groups/:name): group-wide data by default; company select or row-click re-scopes KPIs/aging/invoices; branch select re-scopes; filters combine
- [x] Customer 360: group badge in header linking to the group card
- [x] Vitest coverage for group aggregation scoping (37/37 tests passing)
- [x] Vitest coverage for behavior profiling and forecast heuristic (32/32 tests passing)
