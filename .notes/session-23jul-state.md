# Session state 23 Jul (branch/currency + smart forecast)

## Customer Group hierarchy (latest request)
- Excel: 5424 rows, 363 groups, 811 customers; 113 groups have >1 company (SAFETY 40, DYNACOM 37, MERCURIA 28, V.SHIPS 21, DYNAGAS 18)
- DB: customers.customerGroup populated for all 811 (363 distinct) — no schema change needed
- UX (user-specified): entering a group shows GROUP data first; picking a company shows that company's data; picking a Prime Branch shows that branch's data; combinable

## Customer Group hierarchy (latest request)
- Excel: 5424 rows, 363 groups, 811 customers; 113 groups have >1 company (e.g. SAFETY 40, DYNACOM 37, MERCURIA 28)
- DB: customers.customerGroup already populated for all 811 customers (363 distinct groups) — no schema change needed
- Plan: groups tRPC endpoints (list w/ aggregated totals incl. per-currency; detail w/ member companies), Customers page Group view toggle, /groups/:name page with company filter, group link on Customer 360

## Status: Phases 1-3 done, Phase 4 (checkpoint + deliver) in progress
- Smart Forecast fully implemented + Jul 2026 generated (485 customers, 40 AI, 445 heuristic); verified via screenshot
- FX settings card in Settings (admin.fxRates/setFxRates, persisted app_settings.fx_rates, applied at server boot) — verified via screenshot
- Tests 32/32, TS clean
- Remaining: checkpoint, deliver Greek message; heartbeat cron creation AFTER user publishes (handler ready at /api/scheduled/generateForecast; cron: manus-heartbeat create --name monthly-forecast --cron "0 0 5 1 * *" --path /api/scheduled/generateForecast)

## Smart Forecast progress (Phase 2, in progress)
- DONE: schema forecast_entries + app_settings tables migrated (0004, unique idx year/month/customerId)
- DONE: db.ts helpers: listForecastEntries, getForecastEntry, upsertForecastEntry (preserves userAdjusted), updateForecastEntry, listForecastMonths, getSetting, setSetting
- DONE: arLogic.ts: buildBehaviorProfile(), heuristicExpectedAmount()
- DONE: server/lib/smartForecast.ts: generateMonthlyForecast(year,month,{useAi}) — top-40 customers via invokeLLM JSON-schema batch, rest heuristic, cap at due+overdue
- DONE: routers/ar.ts forecastRouter additions: generateSmart, smartEntries (live collected per customer via receipts in month range), smartMonths, adjustEntry, resetEntry
- DONE: server/scheduledForecast.ts handler + mounted app.post("/api/scheduled/generateForecast") in _core/index.ts
- TS clean.
- NEXT: rewrite client/src/pages/Forecast.tsx — add Smart Forecast section (month selector, Generate button, per-customer table:
  Customer | Due | Overdue | AI Suggested (+reasoning tooltip) | Expected (inline editable) | Collected | Remaining | status badge userAdjusted),
  totals row + progress bar vs collected; keep existing Target vs Actual cards + Promises table below.
- NEXT: after checkpoint+deploy, create heartbeat cron: manus-heartbeat create --name monthly-forecast --cron "0 0 5 1 * *" --path /api/scheduled/generateForecast (needs deployed site; ask user to Publish first)
- NEXT: FX settings UI (Settings page) reading/writing app_settings key fx_rates (JSON) + apply via setFxRates on server start/read
- NEXT: vitest for buildBehaviorProfile/heuristicExpectedAmount (+ maybe upsert preserve logic)
- Forecast page current structure: header w/ Set Monthly Target dialog + exports; 6-month table (dash.forecast); Target-vs-Actual cards (plans query); Promises table (forecast.promises + updatePromise Kept/Broken)

## Completed today (not yet checkpointed since dbf1cbe0)
- Prime Branch badges + filter on Invoices page (branchShort/branchColors in client/src/lib/format.ts)
- Original currency as primary amount + EUR equivalent on Invoices & Customer 360
- Per-currency breakdowns: aging buckets (Invoices strip, Dashboard aging card, Overdue KPI),
  filtered totals bar on Invoices, Customer 360 KPI cards (Total Overdue, Current, Aging 90+)
- computeAging() in server/lib/arLogic.ts now returns bucketsByCurrency, totalByCurrency, currentByCurrency
- Aging + SOA exports now include Prime Branch, Currency, Outstanding(orig) columns (server/routers/ar.ts)
- setFxRates()/getFxRates()/DEFAULT_FX_RATES added to arLogic.ts (runtime override, EUR pinned to 1)
- installment invoicing now sets amountEur (EUR contracts)
- Tests 25/25, TS clean as of last run

## DB facts
- 6 branches: Prime Products LTD (EUR 4323 inv), Prime Products Distribution FZC LTD (AED 322),
  P.P.D. Prime Products Distribution Ltd (EUR 284), Prime Products Distribution(s) PTE LTD (SGD 259),
  Prime Products Distribution B.V (EUR 162), Prime Products Distribution USA LLC (USD 74)
- Customer id 393 = MSC SHIPMANAGEMENT LTD (760 invoices) — good test customer

## Remaining todo (see todo.md)
1. Smart Monthly Collection Forecast (user request, HIGH PRIORITY):
   - forecastEntries table: per customer/month: dueAmount, aiSuggestedAmount, expectedAmount (user editable), notes, collectedAmount
   - Payment behavior profile per customer from receipts/history: avg delay, collection rate, promise reliability
   - Auto-generate at month start (Heartbeat cron 1st of month) — MUST read /home/ubuntu/skills/webdev-periodic-updates/SKILL.md first
   - AI suggestion via built-in LLM (server/_core/llm.ts, invokeLLM) w/ statistical fallback
   - Forecast page: per-customer editable table, AI suggested vs expected vs collected vs remaining, live totals
   - Example user gave: Eletson owes 100k but expect 30k based on behavior
2. FX rates settings UI in Settings (backend helpers ready in arLogic)
3. Vitest for forecast/profiling; checkpoint; deliver in Greek
- IMPLEMENTED: customers.groups + customers.groupDetail (server/routers/ar.ts), GroupDetail.tsx (/groups/:name), Customers.tsx Groups/Companies tabs, group badge on CustomerDetail; groups.test.ts; TS clean, 37/37 tests

## Group SOA + doc date + aging filters (DONE, checkpoint 719e4ae3)
- reports.export gained "soa-group" report with group/branch/minDaysOverdue inputs; groupDetail gained minDaysOverdue; GroupDetail.tsx has SOA buttons + aging select; CustomerDetail.tsx invoices tab has aging select + Doc. Date; 38/38 tests
- Production: heartbeat monthly-forecast (task_uid HeeWvn3uGNohbSoCakYup7) enabled, next 2026-08-01T05:00Z; endpoint live (403 auth-gated for unsigned)

## Manual tasks (IN PROGRESS)
- All 3473 auto tasks deleted from DB (tasks table now 0 rows; task engine only runs via tasks.runEngine mutation = "Run SOP Engine" button on Tasks page)
- tasks.create procedure added (customer, type from taskTypes enum, title, description, dueDate, optional invoiceId, assignedTo=creator)
- NEXT: New Task dialog on client/src/pages/Tasks.tsx, vitest for creation validation

## Status update (11:18)
- New Task dialog DONE on Tasks.tsx (customer combobox via customers.list, type select from TYPES incl "Follow-up +15" not "Reminder +15", title, description, due date); tasks.create procedure in ar.ts tasksRouter (needs taskTypes import — DONE)
- Tier: schema customerTiers = ["Platinum","Gold","Silver","Bronze","New"] (NOT Strategic/Regular/High Risk — my earlier message to user misnamed them). Inline tier Select added on CustomerDetail header wired to customers.update, invalidates get360+list. TOLD USER wrong tier names — correct in final message.
- Tasks deletion: user clicked "Run Task Engine Now" at 11:10 on production → long run kept inserting (~1-2/s). Audit shows only ONE run. Plan: wait for it to stop (insert timestamps stale >2min), then final DELETE FROM tasks. Last check 11:15:19 count=133.
- Consider: remove/deprioritize "Run Task Engine Now" button? User wants manual tasks first; keep engine but maybe confirm dialog. NOT done.
- Memory pressure earlier: killed stray esbuild; dev server restarted OK.
- Remaining todos: vitest for task creation validation, tier editor todo item, final delete verification, checkpoint, Greek delivery.
