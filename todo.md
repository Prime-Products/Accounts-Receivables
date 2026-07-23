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
- [ ] Verify scheduled endpoint on production after the user clicks Publish (redeploy needed so the live build includes the new handler; check via manus-heartbeat logs or Run Now)

## Customer Group hierarchy (user request 23 Jul)
- [x] Inspect Excel to confirm group → member companies structure (363 groups / 811 companies; customerGroup already populated in DB for all customers)
- [x] Backend: customers.groups endpoint — aggregated totals per group (outstanding EUR + per-currency, overdue, company count)
- [x] Backend: customers.groupDetail endpoint — group aggregates + invoices, scoped by optional company and Prime Branch filters (AND-combined)
- [x] Customers page: Groups/Companies toggle — group totals with per-currency breakdown, click-through to group card
- [x] Group card page (/groups/:name): group-wide data by default; company select or row-click re-scopes KPIs/aging/invoices; branch select re-scopes; filters combine
- [x] Customer 360: group badge in header linking to the group card
- [x] Vitest coverage for group aggregation scoping (37/37 tests passing)
- [x] Vitest coverage for behavior profiling and forecast heuristic (32/32 tests passing)
