import { describe, expect, it } from "vitest";
import { computeCreditRating } from "./lib/arLogic";

describe("computeCreditRating", () => {
  it("gives A to a clean payer with no overdue", () => {
    const r = computeCreditRating({
      daysLate: 0,
      openBalance: 100_000,
      overdueBalance: 0,
      overdue90Plus: 0,
      promisesKept: 2,
      promisesBroken: 0,
      onHoldStatus: "Active",
    });
    expect(r.rating).toBe("A");
    expect(r.score).toBe(100);
  });

  it("gives E to a very late payer with old overdue and legal status", () => {
    const r = computeCreditRating({
      daysLate: 180,
      openBalance: 50_000,
      overdueBalance: 50_000,
      overdue90Plus: 40_000,
      promisesKept: 0,
      promisesBroken: 3,
      onHoldStatus: "Legal",
    });
    expect(r.rating).toBe("E");
    expect(r.score).toBeLessThan(30);
  });

  it("is neutral when there is no history", () => {
    const r = computeCreditRating({
      daysLate: null,
      openBalance: 0,
      overdueBalance: 0,
      overdue90Plus: 0,
      promisesKept: 0,
      promisesBroken: 0,
      onHoldStatus: "Active",
    });
    // 21 + 30 + 15 + 7 + 10 = 83 → B
    expect(r.rating).toBe("B");
    expect(r.score).toBe(83);
  });

  it("penalizes on-hold status and broken promises", () => {
    const base = {
      daysLate: 10,
      openBalance: 100_000,
      overdueBalance: 20_000,
      overdue90Plus: 0,
      promisesKept: 1,
      promisesBroken: 0,
      onHoldStatus: "Active",
    };
    const good = computeCreditRating(base);
    const held = computeCreditRating({ ...base, onHoldStatus: "On Hold", promisesBroken: 2 });
    expect(held.score).toBeLessThan(good.score);
  });

  it("includes a factor breakdown that sums to the score", () => {
    const r = computeCreditRating({
      daysLate: 45,
      openBalance: 80_000,
      overdueBalance: 30_000,
      overdue90Plus: 10_000,
      promisesKept: 1,
      promisesBroken: 1,
      onHoldStatus: "Under Review",
    });
    expect(r.factors).toHaveLength(5);
    expect(r.factors.reduce((s, f) => s + f.points, 0)).toBe(r.score);
  });
});

describe("problematic rule (Expected < 80% of Overdue EOM)", () => {
  const isProblematic = (expected: number, overdueEom: number, hasForecast = true) =>
    hasForecast && overdueEom > 0 && expected < 0.8 * overdueEom;

  it("marks problematic when coverage is below 80%", () => {
    expect(isProblematic(70_000, 100_000)).toBe(true);
  });
  it("does not mark when coverage is at or above 80%", () => {
    expect(isProblematic(80_000, 100_000)).toBe(false);
    expect(isProblematic(120_000, 100_000)).toBe(false);
  });
  it("does not mark when there is no overdue EOM or no forecast", () => {
    expect(isProblematic(0, 0)).toBe(false);
    expect(isProblematic(10_000, 100_000, false)).toBe(false);
  });
});
