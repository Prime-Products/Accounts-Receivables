import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The transactions list of the customer/group card is ONE list: invoices, credit
 * notes and payments (wire transfers) share the same grid and are ordered by
 * issue date. Matching happens inline on the row itself — a credit note against
 * open invoices, a received payment against open invoices — using the same
 * dialogs the Wire Transfers page uses.
 */
const table = readFileSync(new URL("../client/src/components/InvoicesTable.tsx", import.meta.url), "utf8");
const customer = readFileSync(new URL("../client/src/pages/CustomerDetail.tsx", import.meta.url), "utf8");
const group = readFileSync(new URL("../client/src/pages/GroupDetail.tsx", import.meta.url), "utf8");

describe("transactions list merges invoices, credit notes and payments", () => {
  it("accepts payments as rows of the same table", () => {
    expect(table).toContain("transfers?: OpenTransferRow[]");
    expect(table).toContain('kind: "transfer"');
    expect(table).toContain("function PaymentRow(");
  });

  it("orders every row type by issue date, newest first", () => {
    // Payments sort on their transfer date, credit notes on their document date.
    expect(table).toContain("issueDate: t.transferDate ?? 0");
    expect(table).toContain("issueDate: c.docDate ?? 0");
    expect(table).toContain("(a, b) => b.issueDate - a.issueDate || b.sortId - a.sortId");
  });

  it("shows the issue-date column again for all three row types", () => {
    expect(table).toContain('<SortableHead label="Issue Date" k="issueDate" />');
    expect(table).toContain("{fmtDate(i.issueDate)}");
    expect(table).toContain("{fmtDate(cn.docDate)}");
    expect(table).toContain("{fmtDate(t.transferDate)}");
  });

  it("offers matching inline on credit-note and payment rows", () => {
    expect(table).toContain("AllocateCreditNoteDialog");
    expect(table).toContain("AllocateWireTransferDialog");
    // The old link out to the Wire Transfers page is gone.
    expect(table).not.toContain('href="/wire-transfers"');
  });

  it("drops the old separate payments block from both cards", () => {
    for (const src of [customer, group]) {
      expect(src).not.toContain("UnallocatedTransfersTable");
      expect(src).toContain("transfers={visibleTransfers as any}");
    }
  });

  it("offers a Payments toggle that is mutually exclusive with Credit notes", () => {
    for (const src of [customer, group]) {
      expect(src).toContain("const [paymentsOnly, setPaymentsOnly] = useState(false)");
      expect(src).toContain("Payments ({allTransfers.length})");
      // Turning one filter on clears the other, so the list never shows an empty
      // intersection of "only credit notes" and "only payments".
      expect(src).toContain("setPaymentsOnly(v => !v); setCreditOnly(false)");
      expect(src).toContain("setCreditOnly(v => !v); setPaymentsOnly(false)");
    }
  });

  it("hides invoices while a payments-only filter is active", () => {
    expect(customer).toContain("if (creditOnly || paymentsOnly) return false");
    expect(group).toContain("if (creditOnly || paymentsOnly) return []");
  });
});
