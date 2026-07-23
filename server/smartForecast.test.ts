import { describe, expect, it } from "vitest";
import {
  buildBehaviorProfile,
  DAY_MS,
  heuristicExpectedAmount,
  type InvoiceLike,
} from "./lib/arLogic";

const now = Date.UTC(2026, 6, 23);

function inv(partial: Partial<InvoiceLike> & { id: number }): InvoiceLike {
  return {
    dueDate: now - 10 * DAY_MS,
    amount: "1000",
    paidAmount: "0",
    status: "Open",
    currency: "EUR",
    amountEur: null,
    ...partial,
  };
}

describe("buildBehaviorProfile", () => {
  it("computes collection rate and overdue exposure", () => {
    const invoices = [
      inv({ id: 1, status: "Paid", paidAmount: "1000" }),
      inv({ id: 2, status: "Open", dueDate: now - 40 * DAY_MS }), // overdue 40d
      inv({ id: 3, status: "Open", dueDate: now + 10 * DAY_MS }), // not yet due
    ];
    const p = buildBehaviorProfile(invoices, [], [], now);
    expect(p.totalOpenEur).toBe(2000);
    expect(p.overdueEur).toBe(1000);
    expect(p.collectionRate).toBeCloseTo(1 / 3, 2);
    expect(p.openInvoiceCount).toBe(2);
    expect(p.paidInvoiceCount).toBe(1);
    // avg delay falls back to open overdue invoices: 40 days
    expect(p.avgDelayDays).toBe(40);
  });

  it("uses paidDates map for average delay when provided", () => {
    const invoices = [inv({ id: 1, status: "Paid", paidAmount: "1000", dueDate: now - 30 * DAY_MS })];
    const paidDates = new Map<number, number>([[1, now - 10 * DAY_MS]]); // paid 20d late
    const p = buildBehaviorProfile(invoices, [], [], now, paidDates);
    expect(p.avgDelayDays).toBe(20);
  });

  it("computes promise reliability", () => {
    const p = buildBehaviorProfile([], [], [{ status: "Kept" }, { status: "Kept" }, { status: "Broken" }], now);
    expect(p.promiseReliability).toBeCloseTo(2 / 3, 2);
  });

  it("computes recent payment ratio from last-6-month receipts", () => {
    const invoices = [inv({ id: 1, status: "Open", dueDate: now - 5 * DAY_MS })];
    const receipts = [
      { receiptDate: now - 30 * DAY_MS, amount: "500" },
      { receiptDate: now - 400 * DAY_MS, amount: "9999" }, // outside window
    ];
    const p = buildBehaviorProfile(invoices, receipts, [], now);
    expect(p.recentPaymentRatio).toBeCloseTo(0.5, 2);
  });
});

describe("heuristicExpectedAmount", () => {
  const baseProfile = {
    avgDelayDays: 0,
    collectionRate: 1,
    recentPaymentRatio: 1,
    promiseReliability: 1,
    paidInvoiceCount: 10,
    openInvoiceCount: 1,
    totalOpenEur: 1000,
    overdueEur: 0,
  };

  it("expects most of the due amount from a reliable on-time payer", () => {
    const { amount } = heuristicExpectedAmount(10000, 0, baseProfile);
    expect(amount).toBeGreaterThan(8000);
    expect(amount).toBeLessThanOrEqual(10000);
  });

  it("expects only a fraction from a chronically late payer (Eletson scenario)", () => {
    const late = { ...baseProfile, avgDelayDays: 90, collectionRate: 0.4, recentPaymentRatio: 0.2, promiseReliability: 0.3 };
    const { amount, reasoning } = heuristicExpectedAmount(50000, 50000, late);
    expect(amount).toBeLessThan(40000); // far below the 100k owed
    expect(amount).toBeGreaterThan(0);
    expect(reasoning).toContain("avg delay 90d");
  });

  it("never exceeds due + overdue", () => {
    const { amount } = heuristicExpectedAmount(100, 50, baseProfile);
    expect(amount).toBeLessThanOrEqual(150);
  });
});
