# Dispute feature — implementation state (27 Jul 2026)

## Done
- Backend `invoices.markDisputed` in server/routers/ar.ts (~line 1881): input { id, disputed, reason? }.
  - disputed=true → status "Disputed"; reason appended to invoice notes as "[Dispute YYYY-MM-DD] reason".
  - disputed=false → status re-derived via deriveInvoiceStatus (Paid/Partially Paid/Overdue/Open).
  - audit logged with reason; returns { success, status }.
- deriveInvoiceStatus in server/lib/arLogic.ts keeps "Disputed" sticky when current === "Disputed".
- todo.md has section "## Invoice dispute (user request 27/7)" with 4 [ ] items (backend one can be marked [x]).

## Remaining
1. Frontend Invoices.tsx: dispute action per row (dropdown or button) + reason dialog; invalidate invoices.
   - Invoices.tsx: table rows render in `visibleRows.map(i => ...)` around line ~515; row has cells Invoice/Customer/Vessel/Prime Branch/Due Date/Status/Amount/Outstanding/Days Overdue.
   - STATUSES const already includes "Disputed"; status filter exists.
   - trpc utils available (`utils.invoices.invalidate()`), toast via sonner.
   - Note: invoices.list payload was trimmed (no `notes` field) — reason tooltip only on detail views or skip.
2. Optional: dispute action in CustomerDetail/GroupDetail invoice tables (they show status badges).
3. Tests: server/dispute.test.ts — markDisputed sets status + notes, revert derives correct status (create test invoice, dispute, revert, cleanup). Follow pattern of server/vessels.test.ts (uses appRouter caller with ctx user).
4. Run vitest, screenshot verify, checkpoint, deliver in Greek.

## Perf context (already delivered)
- Invoices table renders 200-row window (visibleCount state) with Load more.

# Unified invoice table task (27 Jul, in progress)

## Goal
User wants identical invoice info in Invoices page, group card (GroupDetail), customer card (CustomerDetail).

## Done
- Backend: groupDetail (ar.ts ~line 1002) and get360 (~line 1314) invoice rows now include `outstanding` and `daysOverdue` (same as invoices.list). tsc OK.
- Created shared component `client/src/components/InvoicesTable.tsx`:
  - export interface InvoiceRowData { id, invoiceNumber, customerName?, vesselName?, company?, currency?, amount, amountEur?, paidAmount, status, issueDate, dueDate, outstanding, daysOverdue }
  - export function InvoicesTable({ rows, showCustomer = true, onDisputeChanged }) — full column set: Invoice / Customer (optional) / Vessel / Prime Branch / Doc. Date / Due Date / Status (dropdown w/ Mark as Disputed + reason dialog, Clear dispute) / Amount / Paid / Outstanding / Days Overdue. Handles its own markDisputed mutation + invalidates utils.invoices, calls onDisputeChanged.

## Remaining
1. Invoices.tsx: replace inline non-group table (its own Table at ~line 508-576 + its dispute dialog + markDisputed mutation + dispTarget state) with <InvoicesTable rows={visibleRows as any} /> — note invoices.list lacks issueDate? NO — it has issueDate (trimmed payload includes issueDate). Keep the group-view table as is. Remove now-unused imports (DropdownMenu, Textarea, AlertTriangle, ChevronDown, Undo2, dispute dialog etc.) if fully moved.
2. CustomerDetail.tsx invoices tab (~line 341-397): replace table with <InvoicesTable rows={visibleInvoices as any} showCustomer={false} onDisputeChanged={() => utils.customers.get360.invalidate()} />.
3. GroupDetail.tsx invoices table (~line 692-740): replace with <InvoicesTable rows={filteredInvoices as any} onDisputeChanged={() => utils.customers.groupDetail.invalidate()} /> (check actual util names: trpc.customers.get360 / trpc.customers.groupDetail).
4. tsc, screenshots (/invoices, a group card, a customer card), run dispute tests, mark todo items [x], checkpoint, deliver Greek summary.

## Todo.md section
"## Unified invoice info across views (user request 27/7)" — 4 [ ] items to mark.
