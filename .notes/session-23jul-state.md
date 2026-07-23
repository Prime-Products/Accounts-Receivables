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

## Manual tasks + tier: DONE (checkpoint f9204472, 44/44 tests, tasks table emptied 11:34)

## NEW REQUEST: group payment behavior for forecast (Excel: /home/ubuntu/upload/allcustomersreceivables.xlsx)
- Excel sheets: "Print" (25044 rows x 17 cols, PAYMENT allocations) + "Sheet1" (509 rows, purchases/reconciliation — ignore)
- "Print" header row 0: 0=Εταιρεία(branch), 1=Τύπος απαίτησης, 2=Module (e.g. "Customer Wire transfers"), 3=Ημερ/νία παραστ.(payment doc date), 4=Name (customer short), 5=Συναλλασόμενος (customer full), 6=Ενότητα Κάλυψης (Sales), 7=Παραστατικό Κάλυψης (covered invoice number), 8=Ημερ/νία Παρ.Κάλυψης (invoice date), 9=Ημερ.πληρωμής παρ.καλ. (invoice DUE date), 10=Αξία Παρ.Κάλυψης (invoice value), 11=Document (payment doc e.g. ΕΜΒ0000592), 12=Ημερ.πληρωμής (payment date), 13=Αξία(Ξ.Ν.) (allocated amount), 16=Συναλλασόμενος Παρ.Κάλυψης
- days-to-pay = payment date (col 12) − invoice due date (col 9); also days from invoice date (col 8)
- Group mapping: customers table has customerGroup; match Excel customer name (col 5/4) to customers.name
- Plan: compute per-customer avg/median days late (vs due) from these real payments, aggregate per group; store in DB (new table group_behavior or customer columns); integrate into smartForecast; show in Forecast UI + group card

## Behavior import DONE (11:58)
- payment_behavior table created (migration 0005): customerId unique, payments, totalPaid, avgDaysLate, medianDaysLate, avgDaysFromInvoice, medianDaysFromInvoice
- 614 customers imported (dedupe merged fuzzy matches, weighted avg), window 2025-08-31→2026-08-31, 23425 payment allocations
- Overall: avg 15.2 days late, median 2.0. MSC: median -4 (pays early vs due), Pantheon group median 38, Dynacom group 62.5
- Scripts: /home/ubuntu/analyze_payments.py, /home/ubuntu/match_behavior.py, ar_app/scripts/import-behavior.mjs, ar_app/scripts/dump-customers.mjs
- NEXT: (a) db.ts helpers getPaymentBehavior/getGroupBehavior; (b) smartForecast.ts: use behavior medianDaysLate to shift expected collection (invoice due + median days late falls in month?) + include stats in LLM prompt; (c) Forecast UI: show avg/median per customer row tooltip/column; (d) group card: behavior card with avg/median days; (e) regenerate July forecast; tests

## Behavior integration DONE (12:05, TS clean)
- db.ts: listPaymentBehavior, getPaymentBehavior, listPaymentBehaviorWithGroup (join customers for group)
- arLogic.ts: BehaviorRow, GroupBehavior, weightedMedian, aggregateGroupBehavior (weighted avg + weighted median), heuristicWithHistory (blend history 30-70% by payment count; med<=0→0.95 factor etc.)
- smartForecast.ts: loads behavior + group stats; passes lastYearAvgDaysLate/median + groupAvg/Median to LLM prompt; heuristic uses history w/ group fallback
- routers/ar.ts: smartEntries returns avgDaysLate/medianDaysLate/historyPayments/groupAvg/groupMedian/customerGroup per row; groupDetail returns behavior (group-level) + per-company avg/median/historyPayments
- Forecast.tsx: "Behavior (days)" column (med Xd colored, tooltip w/ full stats, grp fallback)
- GroupDetail.tsx: KPI card "Payment Behavior (last year)" (median colored + avg + payments), Behavior column in companies table
- DONE 12:10: behavior.test.ts (10 tests, 55/55 total pass); AI batching fixed (chunked 20/batch + truncated-JSON salvage) — July regen: 485 customers, 40 AI + 445 heuristic; screenshots OK (Forecast behavior column w/ tooltip, ELETSON group card behavior KPI +185d median, per-company med 381d/185d); one-off scripts removed. Checkpoint e320369d delivered.

## NEW REQUEST (23/7 ~12:20): Forecast per GROUP + manual only
- User: forecast ανά group πελάτη (όχι ανά εταιρεία), όλα τα ποσά σε EUR, ΚΑΙ όχι αυτόματα 1η του μήνα — μόνο με Refresh button (υπολογίζει τον επιλεγμένο μήνα)
- Sandbox was RESET; project restored at e320369d; new preview URL. Site IS published: ar-accounts-evjqbcnz.manus.space
- Heartbeat cron exists: task_uid HeeWvn3uGNohbSoCakYup7 (monthly-forecast, cron 0 0 5 1 * *) → DELETE via `manus-heartbeat delete --task-uid HeeWvn3uGNohbSoCakYup7` (check CLI syntax)
- Scheduled handler: server/scheduledForecast.ts + mounted in server/_core/index.ts line 11 + 57 → remove both
- PLAN: (1) smartForecast.ts: group customers by customerGroup (trim || name), aggregate dueThisMonth/overdue via outstandingEur (import from arLogic), one entry per group. Store: forecast_entries needs group key — reuse customerId of the "primary" member? NO — cleaner: add `customerGroup` varchar column to forecast_entries, make customerId nullable or keep primary member id for FK/links. Decision: keep customerId = member with largest exposure (for navigation), add customerGroup column + unique index (year,month,customerGroup)
- (2) smartEntries: one row per group; collected = receipts of ALL member companies in month (EUR); behavior = group stats
- (3) LLM prompt: per-group lines w/ group behavior; heuristicWithHistory w/ group history
- (4) Forecast.tsx: show group name + N companies badge; link to /groups/:group; remove "generated automatically at the start of every month" wording
- (5) app_settings key forecast_cron_task_uid exists in DB — delete row after removing cron
- (6) tests: adapt smartForecast-related tests if any reference per-customer; run pnpm test
- fmtEur exists in client/src/lib/format.ts; outstandingEur in arLogic

### PROGRESS (14:00)
- DONE backend: schema customerGroup col added (migration 0006 applied + fe_group_idx); smartForecast.ts groups by customerGroup||name, EUR via outstanding(), rep member = largest exposure, group behavior preferred; upsertForecastEntry keys on customerGroup w/ legacy fallback; smartEntries returns group rows (collected summed across member ids, companiesCount); generateSmart audit wording
- DONE: heartbeat cron DELETED (HeeWvn3uGNohbSoCakYup7); server/scheduledForecast.ts removed + unmounted from _core/index.ts; old per-customer entries deleted (customerGroup IS NULL); app_settings forecast_cron_task_uid row deleted
- DONE frontend: Forecast.tsx header "per Customer Group (all amounts EUR)", empty-state manual-only wording, group name links to /groups/:key, N companies badge, Link import added
- REMAINING: check "Refresh Forecast" button label (was maybe "Generate"), regen July via UI-equivalent script or trpc, verify screenshot, pnpm test (fix smartForecast-related tests if broken), tick todos, checkpoint, Greek delivery. Note: behavior.test.ts heuristicWithHistory tests unaffected.
- Button label check: line ~70-100 Forecast.tsx has "Refresh Forecast" button + "Generate Forecast" text in empty state (updated to say Refresh)

## Column totals (23/7 latest)
- Customers.tsx: TOTAL rows in Groups + Companies views (respect filters); creditLimit decimal string -> Number()
- Forecast.tsx: sticky TOTAL row for visible rows (due/overdue/ai/expected/collected/remaining)

## 23/7 late: sortable forecast columns
- Forecast.tsx SmartForecastSection: SortKey = due|overdue|ai|expected|collected|remaining, all 6 amount headers sortable via map
- Excel OPENINVOICESCUSTOMERS21.07.26FORAI.xlsx re-uploaded by user = SAME data already in DB (per-currency counts+sums match to cent); no reimport
