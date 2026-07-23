/**
 * Tests for the historical payment behavior helpers used by the smart forecast:
 * weighted median, group aggregation and the history-blended heuristic.
 */
import { describe, expect, it } from "vitest";
import {
  aggregateGroupBehavior,
  BehaviorRow,
  buildBehaviorProfile,
  heuristicExpectedAmount,
  heuristicWithHistory,
  weightedMedian,
} from "./lib/arLogic";

const row = (over: Partial<BehaviorRow>): BehaviorRow => ({
  customerId: 1,
  payments: 10,
  totalPaid: 1000,
  avgDaysLate: 10,
  medianDaysLate: 8,
  avgDaysFromInvoice: 40,
  medianDaysFromInvoice: 35,
  customerGroup: "GRP",
  customerName: "Cust",
  ...over,
});

describe("weightedMedian", () => {
  it("returns 0 for empty input", () => {
    expect(weightedMedian([])).toBe(0);
  });

  it("returns the single value when only one entry", () => {
    expect(weightedMedian([[42, 5]])).toBe(42);
  });

  it("weights values by payment counts", () => {
    // 5 at weight 1, 100 at weight 9 → median lands on 100
    expect(weightedMedian([[5, 1], [100, 9]])).toBe(100);
  });

  it("ignores zero-weight entries", () => {
    expect(weightedMedian([[500, 0], [7, 3]])).toBe(7);
  });
});

describe("aggregateGroupBehavior", () => {
  it("aggregates companies of the same group with payment-weighted stats", () => {
    const rows: BehaviorRow[] = [
      row({ customerId: 1, payments: 30, avgDaysLate: 10, medianDaysLate: 8, totalPaid: 3000 }),
      row({ customerId: 2, payments: 10, avgDaysLate: 50, medianDaysLate: 45, totalPaid: 1000 }),
    ];
    const out = aggregateGroupBehavior(rows);
    expect(out.size).toBe(1);
    const g = out.get("GRP")!;
    expect(g.companies).toBe(2);
    expect(g.payments).toBe(40);
    expect(g.totalPaid).toBe(4000);
    // Weighted avg: (10*30 + 50*10) / 40 = 20
    expect(g.avgDaysLate).toBe(20);
    // Weighted median across [8 w30, 45 w10] → 8
    expect(g.medianDaysLate).toBe(8);
  });

  it("falls back to customer name / id when no group", () => {
    const rows: BehaviorRow[] = [
      row({ customerId: 3, customerGroup: null, customerName: "Solo Co" }),
      row({ customerId: 4, customerGroup: null, customerName: null }),
    ];
    const out = aggregateGroupBehavior(rows);
    expect(out.has("Solo Co")).toBe(true);
    expect(out.has("#4")).toBe(true);
  });
});

describe("heuristicWithHistory", () => {
  const emptyProfile = buildBehaviorProfile([], [], [], Date.now());

  it("falls back to base heuristic when no history", () => {
    const base = heuristicExpectedAmount(10000, 5000, emptyProfile);
    const withNull = heuristicWithHistory(10000, 5000, emptyProfile, null);
    expect(withNull.amount).toBe(base.amount);
  });

  it("falls back to base heuristic when history has fewer than 2 payments", () => {
    const base = heuristicExpectedAmount(10000, 5000, emptyProfile);
    const out = heuristicWithHistory(10000, 5000, emptyProfile, { avgDaysLate: 60, medianDaysLate: 55, payments: 1 });
    expect(out.amount).toBe(base.amount);
  });

  it("expects more from historically punctual customers than chronic late payers", () => {
    const punctual = heuristicWithHistory(10000, 5000, emptyProfile, { avgDaysLate: -2, medianDaysLate: -1, payments: 50 });
    const late = heuristicWithHistory(10000, 5000, emptyProfile, { avgDaysLate: 90, medianDaysLate: 80, payments: 50 });
    expect(punctual.amount).toBeGreaterThan(late.amount);
  });

  it("never exceeds total exposure", () => {
    const out = heuristicWithHistory(10000, 5000, emptyProfile, { avgDaysLate: -5, medianDaysLate: -5, payments: 100 });
    expect(out.amount).toBeLessThanOrEqual(15000);
  });

  it("mentions history in the reasoning", () => {
    const out = heuristicWithHistory(10000, 5000, emptyProfile, { avgDaysLate: 20, medianDaysLate: 15, payments: 12 });
    expect(out.reasoning).toContain("median 15d late");
    expect(out.reasoning).toContain("12 payments");
  });
});
