# Session state 23 Jul (branch/currency + smart forecast)

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
