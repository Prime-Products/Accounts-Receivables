/**
 * The credit-notes and payments filters used to vanish from the Transactions
 * toolbar whenever the scope had none, and an active status/installments filter
 * could silently empty them. These are source-level guards so the buttons stay
 * permanently visible and self-explanatory on both cards.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const group = read("client/src/pages/GroupDetail.tsx");
const customer = read("client/src/pages/CustomerDetail.tsx");
const invoices = read("client/src/pages/Invoices.tsx");
const sendEmail = read("client/src/components/SendEmailDialog.tsx");

describe("transactions toolbar — credit notes / payments always visible", () => {
  for (const [name, src] of [
    ["group card", group],
    ["company card", customer],
  ] as const) {
    it(`${name}: does not hide the buttons when the scope has none`, () => {
      expect(src).not.toContain("{allCreditNotes.length > 0 && (");
      expect(src).not.toContain("{allTransfers.length > 0 && (");
      expect(src).toContain("disabled={allCreditNotes.length === 0}");
      expect(src).toContain("disabled={allTransfers.length === 0}");
    });

    it(`${name}: turning a view on clears the invoice-only filters`, () => {
      expect(src).toContain("clearInvoiceOnlyFilters");
      expect(src).toContain("onClick={toggleCreditOnly}");
      expect(src).toContain("onClick={togglePaymentsOnly}");
    });

    it(`${name}: flags rows hidden by other filters instead of showing a bare count`, () => {
      expect(src).toContain("hidden");
      expect(src).toMatch(/Credit notes are hidden by the current filters/);
      expect(src).toMatch(/Payments are hidden by the current filters/);
    });
  }
});

describe("Invoices page — global credit notes view", () => {
  it("queries every open credit note across the book", () => {
    expect(invoices).toContain("trpc.invoices.openCreditNotes.useQuery()");
  });

  it("offers a Credit notes view next to By group / By vessel", () => {
    expect(invoices).toContain("creditView");
    expect(invoices).toContain("Credit notes ({(openCreditNotes ?? []).length})");
  });

  it("shows the unused credit total with its per-currency split", () => {
    expect(invoices).toContain("Unused credit");
    expect(invoices).toContain("creditTotals");
  });

  it("ignores invoice-only filters (status, bucket, installments) for credit notes", () => {
    const block = invoices.slice(invoices.indexOf("const filteredCreditNotes"), invoices.indexOf("const creditTotals"));
    expect(block).not.toContain("statusFilter");
    expect(block).not.toContain("bucketFilter");
    expect(block).not.toContain("contractFilter");
    expect(block).toContain("branchFilter");
    expect(block).toContain("groupDrill");
  });
});

describe("Send Email — searchable contact list", () => {
  it("filters the contacts with the shared token matcher", () => {
    expect(sendEmail).toContain("matchesAllTokens");
    expect(sendEmail).toContain("shownContacts");
  });

  it("keeps the list bounded so the dialog does not grow forever", () => {
    expect(sendEmail).toContain("max-h-56 overflow-y-auto");
  });

  it("resets the search when the dialog closes", () => {
    expect(sendEmail).toContain("setContactSearch(\"\")");
  });
});
