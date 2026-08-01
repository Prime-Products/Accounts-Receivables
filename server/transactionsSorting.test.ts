import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The transactions list (client/src/components/InvoicesTable.tsx) mixes three
 * kinds of rows: invoices, open credit notes and payments (wire transfers with a
 * remainder). These tests pin the contract the collectors rely on:
 *   1. every column sorts ALL three kinds together (not just the invoices),
 *   2. Issue Date is the first column of the table,
 *   3. a credit note can be matched and a payment allocated straight from its row.
 *
 * The component itself is not rendered here (no DOM in this suite), so the file
 * is read as source and checked structurally — enough to catch a regression
 * where one row kind silently stops sorting or an action button disappears.
 */
const src = readFileSync(
  join(process.cwd(), "client/src/components/InvoicesTable.tsx"),
  "utf8",
);

describe("transactions list — unified sorting", () => {
  it("has a sort-value function that covers credit notes and payments", () => {
    expect(src).toContain("function txSortValue(row: TxRow, key: SortKey)");
    expect(src).toMatch(/if \(row\.kind === "credit"\)/);
    // The payment branch is the fall-through: it reads the transfer.
    expect(src).toMatch(/const t = row\.transfer;/);
  });

  it("sorts the merged list with txSortValue instead of sorting invoices alone", () => {
    expect(src).toContain("txSortValue(a, sortKey)");
    expect(src).toContain("txSortValue(b, sortKey)");
    // The old behaviour spliced credit notes into an invoice-only ordering.
    expect(src).not.toContain("merged.splice");
  });

  it("no longer keeps a separate invoice-only sorted array", () => {
    expect(src).not.toContain("const sortedRows = useMemo");
  });

  it("falls back to issue date, newest first, when no column is selected", () => {
    expect(src).toMatch(/b\.issueDate - a\.issueDate \|\| b\.sortId - a\.sortId/);
  });

  it("orders credit notes and payments as negative amounts", () => {
    // A credit note / payment reduces the balance, so sorting by amount must not
    // rank them next to the largest invoices.
    expect(src).toMatch(/case "amount": return -\(Number\(c\.amount\) \|\| 0\)/);
    expect(src).toMatch(/case "amount": return -\(Number\(t\.amount\) \|\| 0\)/);
  });

  it("sorts vessel for credit notes from the vessel name", () => {
    expect(src).toMatch(/case "vesselName": return \(c\.vesselName \?\? ""\)\.toLowerCase\(\)/);
  });
});

describe("transactions list — column order", () => {
  it("puts Issue Date before the Invoice column in the header", () => {
    const issue = src.indexOf('label="Issue Date"');
    const invoice = src.indexOf('label="Invoice"');
    expect(issue).toBeGreaterThan(-1);
    expect(invoice).toBeGreaterThan(-1);
    expect(issue).toBeLessThan(invoice);
  });

  it("declares issueDate first among the resizable column widths", () => {
    const defaults = src.slice(src.indexOf("const colDefaults"), src.indexOf("return d;"));
    expect(defaults.indexOf("issueDate:")).toBeLessThan(defaults.indexOf("invoiceNumber:"));
  });
});

describe("transactions list — inline actions", () => {
  it("offers Match on an open credit-note row", () => {
    expect(src).toContain("AllocateCreditNoteDialog");
    expect(src).toMatch(/Match/);
  });

  it("offers Allocate inline on a received payment row instead of linking away", () => {
    expect(src).toContain("AllocateWireTransferDialog");
    expect(src).not.toContain("Allocate →");
    expect(src).not.toContain('href="/wire-transfers"');
  });
});
