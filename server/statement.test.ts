import { describe, expect, it } from "vitest";
import { buildGroupStatement, StatementInvoiceLike } from "./lib/statement";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 6, 30); // 30/7/2026

function inv(over: Partial<StatementInvoiceLike>): StatementInvoiceLike {
  return {
    id: 1,
    customerId: 1,
    invoiceNumber: "INV-1",
    company: "Prime Products LTD",
    currency: "EUR",
    issueDate: NOW - 40 * DAY,
    dueDate: NOW - 10 * DAY,
    amount: 100,
    paidAmount: 0,
    status: "Unpaid",
    vesselId: null,
    notes: null,
    ...over,
  };
}

describe("buildGroupStatement", () => {
  it("builds one statement per group company and skips companies with no open invoices", () => {
    const stmt = buildGroupStatement({
      groupName: "TESTGROUP",
      now: NOW,
      customers: [
        { id: 1, name: "ALPHA CO", paymentTermsDays: 60 },
        { id: 2, name: "BETA CO", paymentTermsDays: 30 },
      ],
      invoices: [inv({ id: 1, customerId: 1 })], // only ALPHA has open docs
      vesselNames: new Map(),
    });
    expect(stmt.companies.length).toBe(1);
    expect(stmt.companies[0].companyName).toBe("ALPHA CO");
    expect(stmt.companies[0].paymentTermsDays).toBe(60);
  });

  it("hides zero-balance branches in the totals table", () => {
    const stmt = buildGroupStatement({
      groupName: "TESTGROUP",
      now: NOW,
      customers: [{ id: 1, name: "ALPHA CO", paymentTermsDays: 60 }],
      invoices: [
        inv({ id: 1, company: "Prime Products LTD" }),
        // fully paid on another branch → not open → branch hidden entirely
        inv({ id: 2, invoiceNumber: "INV-2", company: "Prime Products Distribution B.V", paidAmount: 100, status: "Paid" }),
      ],
      vesselNames: new Map(),
    });
    const c = stmt.companies[0];
    expect(c.totals.length).toBe(1);
    expect(c.totals[0].branch.key).toBe("Prime Products LTD");
    expect(c.totals[0].balance).toBe(100);
    expect(c.totals[0].overdue).toBe(100);
  });

  it("computes overdue days (positive past due, negative upcoming) and month buckets", () => {
    const stmt = buildGroupStatement({
      groupName: "TESTGROUP",
      now: NOW,
      customers: [{ id: 1, name: "ALPHA CO", paymentTermsDays: 60 }],
      invoices: [
        inv({ id: 1, dueDate: NOW - 5 * DAY }), // 5 days overdue
        inv({ id: 2, invoiceNumber: "INV-2", dueDate: NOW + 1 * DAY, amount: 50 }), // due within month
      ],
      vesselNames: new Map(),
    });
    const analysis = stmt.companies[0].analyses[0];
    const r1 = analysis.rows.find(r => r.document === "INV-1")!;
    const r2 = analysis.rows.find(r => r.document === "INV-2")!;
    expect(r1.overdueDays).toBeGreaterThan(0);
    expect(r2.overdueDays).toBeLessThanOrEqual(0);
    const t = stmt.companies[0].totals[0];
    expect(t.overdue).toBe(100);
    expect(t.upcomingWithinMonth).toBe(50);
  });

  it("branch analysis totals match the totals table (partial payments respected)", () => {
    const stmt = buildGroupStatement({
      groupName: "TESTGROUP",
      now: NOW,
      customers: [{ id: 1, name: "ALPHA CO", paymentTermsDays: 60 }],
      invoices: [
        inv({ id: 1, amount: 100 }),
        inv({ id: 2, invoiceNumber: "INV-2", amount: 200, paidAmount: 50 }),
      ],
      vesselNames: new Map(),
    });
    const c = stmt.companies[0];
    expect(c.analyses[0].totalOpenAmount).toBe(250);
    expect(c.analyses[0].totalDocAmount).toBe(300);
    expect(c.totals[0].balance).toBe(250);
    expect(c.totals[0].unpaid).toBe(250);
  });

  it("resolves vessel names onto analysis rows", () => {
    const stmt = buildGroupStatement({
      groupName: "TESTGROUP",
      now: NOW,
      customers: [{ id: 1, name: "ALPHA CO", paymentTermsDays: 60 }],
      invoices: [inv({ id: 1, vesselId: 7 })],
      vesselNames: new Map([[7, "MV TESTSHIP"]]),
    });
    expect(stmt.companies[0].analyses[0].rows[0].vessel).toBe("MV TESTSHIP");
  });
});
