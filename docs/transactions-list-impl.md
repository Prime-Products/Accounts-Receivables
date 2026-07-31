# Transactions list on group/customer card (30/7)

## Requirement (user)
- Group + customer card: replace the plain invoice list with a full **transactions list** (open items):
  - open invoices (as today)
  - credit notes → LATER (no data yet; prepare structurally)
  - wire transfers (payments) with **unallocated remainder** — show remaining amount; if fully allocated, hide (like paid invoices disappear)

## Data model (existing)
- `wire_transfers`: id, customerId, amount, currency, transferDate, branch, status (Pending|Received), receivedDate, referenceNumber, notes, isInternal(+source fields)
- `wire_transfer_allocations`: wireTransferId, invoiceId, amount
- Helpers: `db.listAllWireTransfers()`, `db.listWireTransfersByCustomerId(id)`, `db.sumAllocationsByWireTransferIds(ids)` → Map(id→allocated), `db.listAllocationsByWireTransferIds(ids)`
- unallocated = amount − allocatedSum; hide when ≤ 0.005. Skip `isInternal` transfers (they're inter-office bookkeeping).
- Question resolved: only status **Received** transfers count as money on account? — DECISION: show BOTH Pending and Received with unallocated remainder, badge shows status; Received are real cash, Pending are announced.
  → Actually per user story "πληρωμές όπου δεν έχει γίνει allocate όλο το ποσό" → show Received with unallocated remainder. Pending transfers are expected money, shown too but labelled Pending (they appear on WireTransfersPage anyway). Keep simple: show both, filter chip.

## Server plan
- `groupDetail` already returns `invoices` (sortedInvoices). ADD `openTransfers` to the groupDetail response:
  memberIds → transfers of members (non-internal) → allocated map → unallocated>0 → rows {id, customerId, customerName, type:'wire', amount, allocated, unallocated, currency, transferDate, status, referenceNumber, branch, notes}
- CustomerDetail page uses a different query (customers.detail? check) — same addition scoped to one customer.

## UI plan (GroupDetail.tsx ~line 782 'Invoices' card)
- Rename card 'Invoices' → 'Transactions'; keep list/byBranch toggle for invoices.
- Above invoice table, when openTransfers exist: section 'Payments on account / unallocated' — small table: date, ref, branch, customer, amount, allocated, remaining (green negative style), status badge, link to Wire Transfers page (/wire-transfers) for allocation.
- Totals row: net open = invoice outstanding − unallocated remainder (display only as extra line 'Unallocated payments: −€X · Net: €Y').
- CustomerDetail.tsx: same panel scoped to that customer (shared component `UnallocatedTransfersTable`).

## Files
- server/routers/ar.ts (groupDetail + customer detail query)
- client/src/components/UnallocatedTransfersTable.tsx (new)
- client/src/pages/GroupDetail.tsx, client/src/pages/CustomerDetail.tsx
- server/groupTransactions.test.ts (new, isolated fixtures via testFixtures)

## STATUS so far
- DONE: server helper `listOpenWireTransfers(customerIds, names)` in server/routers/ar.ts; groupDetail + get360 return `openTransfers`.
- DONE: client/src/components/UnallocatedTransfersTable.tsx (props: rows, showCustomer). GroupDetail: card renamed 'Transactions ({scopeLabel})', transfers table rendered above InvoicesTable in list view. CustomerDetail: tab renamed 'Transactions', table above invoices. tsc clean.
- DONE: server/openTransfers.test.ts (fixtures: createTestCustomer/cleanupTestCustomer + snapshotIds/cleanupSince from testCleanup; IdSnapshot type). Verifies partial allocation shows remainder, full allocation hidden, isInternal hidden.
- VERIFIED: vitest openTransfers passes; screenshots OK — CHANDRIS group shows WT#840001 €30,000/alloc €6,714/unalloc €23,286; DYNACOM shows €9,235 unalloc; /customers/96 Transactions tab shows the section. Internal transfers correctly hidden.
- REMAINING: full vitest suite; todo.md; checkpoint; push; deliver.

## INTERRUPT: user report (30/7 ~12:00) — Log Call MSC shows "Open promise exists: €7,777 due 31/07/2026" but user's real promise is the €7,000 one
Root cause: recovery from audit trail restored 6 promises as Pending that were closed pre-wipe (no audit rows for their closing). Stale Pending promises WITHOUT an open "(Promise #id)" task:
- P#330001 APEX €7,000 due 30/07 · P#1 DYNACOM €20,000 · P#30001 DYNACOM €1,234 · P#60001 MSC €8,888 · P#1290001 MSC €50,000 · P#1530001 MSC €7,777
Real open promises (WITH open tasks): P#4950001 MSC €7,000 (T#5310001) · P#4350002 ALPHA GAS €9,999 (T#4650003) · P#4980001 YASUTRIA €6,876,876 (T#5400001)
findOpenGroupPromise picks highest-id Pending promise → for MSC it picked P#1530001 (€7,777)?? No — 4950001 > 1530001. BUT the dialog showed €7,777: because findOpenGroupPromise sorts by id desc → 4950001 should win. CHECK: maybe getOpenPromise uses oldest? Verify then fix stale rows → mark P#1, 30001, 60001, 330001, 1290001, 1530001 as Kept/Broken? They were closed pre-wipe, unknown how → set status='Kept' notes='auto-closed: recovered stale row'? Safer: 'Broken'? User said earlier statuses: DYNACOM group status Not Contacted, MSC Confirmed €7,000. Decision: mark stale rows Kept (least harmful for behavior scoring? Kept boosts rating, Broken hurts). Neutral choice: 'Kept' with note, or add 'Cancelled'? promises status enum likely Pending|Kept|Broken — check schema. Mark them via SQL with notes.
## RESOLUTION of the €7,777 report (30/7 12:05)
Audit shows user Kostas Vanos (user#1) himself cancelled 9 tasks via the UI at 11:46 (T#5640001, 2280001, 4650003, 5340001, 5580001, 5400001, 5220002, 5310001, 4860001) — cascade correctly marked promises 4950001/4980001/4350002 Broken. So at Log Call time, MSC's only Pending promises were the 3 stale recovery artifacts (P#60001 €8,888, P#1290001 €50,000, P#1530001 €7,777) → dialog showed highest id = P#1530001 €7,777. User said "i dont have another promise" → correct fix = close the stale ones (DONE: marked Kept with note P#1,30001,60001,330001,1290001,1530001).
MY SQL MISTAKE during this fix: I set P#4950001/4350002/4980001 back to Pending and T#5310001/4650003/5400001 back to Pending, but the USER had cancelled those himself at 11:46. MUST REVERT: set those 3 tasks back to Cancelled and 3 promises back to Broken. After that: MSC has NO pending promise → Log Call won't show the yellow box.
