import { describe, it, expect } from "vitest";
import { buildGroupStatement, buildGroupSummary, StatementInvoiceLike } from "./lib/statement";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 6, 30); // 30/7/2026

function inv(partial: Partial<StatementInvoiceLike> & { id: number; customerId: number }): StatementInvoiceLike {
  return {
    invoiceNumber: `INV-${partial.id}`,
    company: "Prime Products LTD",
    currency: "EUR",
    issueDate: NOW - 30 * DAY,
    dueDate: NOW + 10 * DAY,
    amount: "100.00",
    paidAmount: "0.00",
    status: "pending",
    vesselId: null,
    notes: null,
    ...partial,
  };
}

describe("buildGroupSummary", () => {
  const customers = [
    { id: 1, name: "ALPHA SHIPS", paymentTermsDays: 60 },
    { id: 2, name: "BETA MARINE", paymentTermsDays: 30 },
  ];

  it("aggregates balances and overdue per currency across companies", () => {
    const invoices: StatementInvoiceLike[] = [
      inv({ id: 1, customerId: 1, amount: "100.00" }), // EUR, not overdue
      inv({ id: 2, customerId: 1, amount: "50.00", dueDate: NOW - 5 * DAY }), // EUR overdue
      inv({ id: 3, customerId: 2, company: "Prime Products Distribution(s) PTE LTD", currency: "SGD", amount: "200.00" }), // SGD
    ];
    const stmt = buildGroupStatement({ groupName: "TEST GROUP", now: NOW, customers, invoices, vesselNames: new Map() });
    const summary = buildGroupSummary(stmt);

    const eur = summary.currencies.find(c => c.currency === "EUR")!;
    expect(eur.balance).toBeCloseTo(150);
    expect(eur.overdue).toBeCloseTo(50);
    const sgd = summary.currencies.find(c => c.currency === "SGD")!;
    expect(sgd.balance).toBeCloseTo(200);
    expect(sgd.overdue).toBeCloseTo(0);
  });

  it("builds a per-company index with per-currency balances and omits zero overdue", () => {
    const invoices: StatementInvoiceLike[] = [
      inv({ id: 1, customerId: 1, amount: "100.00" }),
      inv({ id: 2, customerId: 2, company: "Prime Products Distribution(s) PTE LTD", currency: "SGD", amount: "200.00", dueDate: NOW - 3 * DAY }),
    ];
    const stmt = buildGroupStatement({ groupName: "TEST GROUP", now: NOW, customers, invoices, vesselNames: new Map() });
    const summary = buildGroupSummary(stmt);

    expect(summary.companies).toHaveLength(2);
    const alpha = summary.companies.find(c => c.companyName === "ALPHA SHIPS")!;
    expect(alpha.balances.get("EUR")).toBeCloseTo(100);
    expect(alpha.balances.get("SGD")).toBeUndefined(); // dash in the PDF
    expect(alpha.overdue.size).toBe(0);

    const beta = summary.companies.find(c => c.companyName === "BETA MARINE")!;
    expect(beta.balances.get("SGD")).toBeCloseTo(200);
    expect(beta.overdue.get("SGD")).toBeCloseTo(200);
  });

  it("accounts for partial payments in balances", () => {
    const invoices: StatementInvoiceLike[] = [
      inv({ id: 1, customerId: 1, amount: "100.00", paidAmount: "40.00", dueDate: NOW - 1 * DAY }),
    ];
    const stmt = buildGroupStatement({ groupName: "TEST GROUP", now: NOW, customers, invoices, vesselNames: new Map() });
    const summary = buildGroupSummary(stmt);
    const eur = summary.currencies.find(c => c.currency === "EUR")!;
    expect(eur.balance).toBeCloseTo(60);
    expect(eur.overdue).toBeCloseTo(60);
  });
});
