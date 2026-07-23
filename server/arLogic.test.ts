import { describe, expect, it } from "vitest";
import {
  agingBucket,
  buildForecast,
  canTransitionOnHold,
  computeAging,
  computeDso,
  daysOverdue,
  deriveInvoiceStatus,
  dueSopOffsets,
  DAY_MS,
  SOP_OFFSETS,
} from "./lib/arLogic";

const NOW = Date.UTC(2026, 6, 23); // 2026-07-23

describe("aging buckets", () => {
  it("classifies 0-30, 31-60, 61-90, 90+ exactly", () => {
    expect(agingBucket(NOW - 10 * DAY_MS, NOW)).toBe("0-30");
    expect(agingBucket(NOW - 30 * DAY_MS, NOW)).toBe("0-30");
    expect(agingBucket(NOW - 31 * DAY_MS, NOW)).toBe("31-60");
    expect(agingBucket(NOW - 60 * DAY_MS, NOW)).toBe("31-60");
    expect(agingBucket(NOW - 61 * DAY_MS, NOW)).toBe("61-90");
    expect(agingBucket(NOW - 90 * DAY_MS, NOW)).toBe("61-90");
    expect(agingBucket(NOW - 91 * DAY_MS, NOW)).toBe("90+");
  });

  it("computes aging totals from invoices, excluding paid and current", () => {
    const invoices = [
      { id: 1, dueDate: NOW - 5 * DAY_MS, amount: "1000", paidAmount: "0", status: "Overdue" },
      { id: 2, dueDate: NOW - 45 * DAY_MS, amount: "500", paidAmount: "200", status: "Partially Paid" },
      { id: 3, dueDate: NOW - 100 * DAY_MS, amount: "800", paidAmount: "800", status: "Paid" },
      { id: 4, dueDate: NOW + 10 * DAY_MS, amount: "700", paidAmount: "0", status: "Open" },
    ];
    const r = computeAging(invoices, NOW);
    expect(r.buckets["0-30"].amount).toBe(1000);
    expect(r.buckets["31-60"].amount).toBe(300);
    expect(r.buckets["90+"].amount).toBe(0);
    expect(r.current).toBe(700);
    expect(r.totalOverdue).toBe(1300);
  });
});

describe("SOP task offsets (+2, +15, +20, +30)", () => {
  it("has exactly the four SOP offsets", () => {
    expect(SOP_OFFSETS.map(o => o.days)).toEqual([2, 15, 20, 30]);
  });
  it("returns offsets whose trigger date has passed", () => {
    const due = NOW - 16 * DAY_MS;
    const types = dueSopOffsets(due, NOW).map(o => o.type);
    expect(types).toEqual(["Follow-up +2", "Follow-up +15"]);
  });
  it("returns all four at +30 days", () => {
    const due = NOW - 30 * DAY_MS;
    expect(dueSopOffsets(due, NOW)).toHaveLength(4);
  });
  it("returns none before +2 days", () => {
    const due = NOW - 1 * DAY_MS;
    expect(dueSopOffsets(due, NOW)).toHaveLength(0);
  });
});

describe("on-hold workflow transitions", () => {
  it("follows Under Review → Eligible for On Hold → On Hold → Legal", () => {
    expect(canTransitionOnHold("Under Review", "Eligible for On Hold")).toBe(true);
    expect(canTransitionOnHold("Eligible for On Hold", "On Hold")).toBe(true);
    expect(canTransitionOnHold("On Hold", "Legal")).toBe(true);
  });
  it("rejects skipping stages", () => {
    expect(canTransitionOnHold("Under Review", "On Hold")).toBe(false);
    expect(canTransitionOnHold("Under Review", "Legal")).toBe(false);
    expect(canTransitionOnHold("Legal", "Under Review")).toBe(false);
  });
  it("allows rejection and resolution", () => {
    expect(canTransitionOnHold("Under Review", "Rejected")).toBe(true);
    expect(canTransitionOnHold("On Hold", "Resolved")).toBe(true);
  });
});

describe("forecast", () => {
  it("builds 6 months and puts overdue into current month", () => {
    const invoices = [
      { id: 1, dueDate: NOW - 40 * DAY_MS, amount: "1000", paidAmount: "0", status: "Overdue" },
      { id: 2, dueDate: NOW + 40 * DAY_MS, amount: "2000", paidAmount: "0", status: "Open" },
    ];
    const installments = [
      { dueDate: NOW + 70 * DAY_MS, amount: "5000", status: "Upcoming" },
      { dueDate: NOW + 10 * DAY_MS, amount: "3000", status: "Paid" },
    ];
    const f = buildForecast(invoices, installments, NOW, 6);
    expect(f).toHaveLength(6);
    expect(f[0].fromInvoices).toBe(1000);
    const monthWithInvoice2 = f.find(m => m.fromInvoices === 2000);
    expect(monthWithInvoice2).toBeDefined();
    const monthWithInstallment = f.find(m => m.fromContracts === 5000);
    expect(monthWithInstallment).toBeDefined();
    expect(f.reduce((s, m) => s + m.fromContracts, 0)).toBe(5000); // paid installment excluded
  });
});

describe("misc", () => {
  it("daysOverdue", () => {
    expect(daysOverdue(NOW - 3 * DAY_MS, NOW)).toBe(3);
    expect(daysOverdue(NOW + DAY_MS, NOW)).toBe(0);
  });
  it("DSO", () => {
    expect(computeDso(100000, 300000, 90)).toBe(30);
    expect(computeDso(100000, 0, 90)).toBe(0);
  });
  it("invoice status derivation", () => {
    expect(deriveInvoiceStatus(100, 100, NOW + DAY_MS, NOW, "Open")).toBe("Paid");
    expect(deriveInvoiceStatus(100, 50, NOW + DAY_MS, NOW, "Open")).toBe("Partially Paid");
    expect(deriveInvoiceStatus(100, 0, NOW - DAY_MS, NOW, "Open")).toBe("Overdue");
    expect(deriveInvoiceStatus(100, 0, NOW + DAY_MS, NOW, "Open")).toBe("Open");
    expect(deriveInvoiceStatus(100, 0, NOW - DAY_MS, NOW, "Disputed")).toBe("Disputed");
  });
});
