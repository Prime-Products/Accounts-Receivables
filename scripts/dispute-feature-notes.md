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
