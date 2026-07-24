import { describe, expect, it } from "vitest";
import { computeCreditRating, computeCallPriority, statusTier } from "./lib/arLogic";

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
      turnoverYtd: 500_000,
      turnoverLastYear: 600_000,
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
    // 18 + 25 + 12 + 6 + 5 + 6 + 6 = 78 → B
    expect(r.rating).toBe("B");
    expect(r.score).toBe(78);
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
    expect(r.factors).toHaveLength(7);
    expect(r.factors.reduce((s, f) => s + f.points, 0)).toBe(r.score);
  });

  it("penalizes turnover decline and high overdue-to-turnover exposure", () => {
    const base = {
      daysLate: 10,
      openBalance: 100_000,
      overdueBalance: 50_000,
      overdue90Plus: 0,
      promisesKept: 1,
      promisesBroken: 0,
      onHoldStatus: "Active",
    };
    // Healthy turnover: large and stable.
    const healthy = computeCreditRating({ ...base, turnoverYtd: 900_000, turnoverLastYear: 1_000_000 });
    // Declining turnover and small size relative to the overdue exposure.
    const declining = computeCreditRating({ ...base, turnoverYtd: 30_000, turnoverLastYear: 1_000_000 });
    expect(declining.score).toBeLessThan(healthy.score);
    const trend = declining.factors.find(f => f.label === "Turnover trend");
    expect(trend).toBeTruthy();
    expect(trend!.points).toBeLessThan(10);
    // Exposure factor: overdue 50k vs turnover 100k (50% > 40% cap) → 0 pts.
    const exposed = computeCreditRating({ ...base, turnoverYtd: 100_000, turnoverLastYear: 100_000 });
    const exp = exposed.factors.find(f => f.label === "Overdue vs turnover");
    expect(exp!.points).toBe(0);
  });

  it("is neutral on turnover factors when no turnover data", () => {
    const r = computeCreditRating({
      daysLate: 0,
      openBalance: 10_000,
      overdueBalance: 0,
      overdue90Plus: 0,
      promisesKept: 0,
      promisesBroken: 0,
      onHoldStatus: "Active",
    });
    expect(r.factors.find(f => f.label === "Turnover trend")!.detail).toContain("neutral");
    expect(r.factors.find(f => f.label === "Overdue vs turnover")!.detail).toContain("neutral");
  });
});

describe("computeCallPriority", () => {
  it("ranks broken promises above similar overdue without breaks", () => {
    const base = {
      overdueBalance: 50_000,
      overdue6190: 10_000,
      overdue90Plus: 5_000,
      rating: "C" as const,
      promisesBroken: 0,
      forecastCoverage: null,
    };
    const clean = computeCallPriority(base);
    const broken = computeCallPriority({ ...base, promisesBroken: 2 });
    expect(broken.score).toBeGreaterThan(clean.score);
    expect(broken.reasons).toContain("Broken promise");
  });

  it("weights rating: E scores higher than A for the same amounts", () => {
    const base = {
      overdueBalance: 30_000,
      overdue6190: 5_000,
      overdue90Plus: 0,
      promisesBroken: 0,
      forecastCoverage: null,
    };
    const a = computeCallPriority({ ...base, rating: "A" });
    const e = computeCallPriority({ ...base, rating: "E" });
    expect(e.score).toBeGreaterThan(a.score);
    expect(e.reasons).toContain("Rating E");
  });

  it("boosts low forecast coverage and flags the reason", () => {
    const base = {
      overdueBalance: 40_000,
      overdue6190: 0,
      overdue90Plus: 0,
      rating: "B" as const,
      promisesBroken: 0,
    };
    const covered = computeCallPriority({ ...base, forecastCoverage: 1.0 });
    const uncovered = computeCallPriority({ ...base, forecastCoverage: 0.4 });
    expect(uncovered.score).toBeGreaterThan(covered.score);
    expect(uncovered.reasons).toContain("Low coverage");
  });

  it("returns zero-ish score when nothing overdue", () => {
    const r = computeCallPriority({
      overdueBalance: 0,
      overdue6190: 0,
      overdue90Plus: 0,
      rating: "A",
      promisesBroken: 0,
      forecastCoverage: null,
    });
    expect(r.score).toBe(0);
  });
});

describe("status-first Call List ordering (tier)", () => {
  const base = {
    overdue6190: 0,
    overdue90Plus: 0,
    rating: "C" as const,
    promisesBroken: 0,
    forecastCoverage: null,
  };
  const byCallOrder = (a: { tier: number; score: number }, b: { tier: number; score: number }) =>
    b.tier - a.tier || b.score - a.score;

  it("maps statuses to tiers: Critical/Legal=2, Problematic=1, Normal/Resolved=0", () => {
    expect(statusTier("Critical")).toBe(2);
    expect(statusTier("Legal")).toBe(2);
    expect(statusTier("Problematic")).toBe(1);
    expect(statusTier("Resolved")).toBe(0);
    expect(statusTier(null)).toBe(0);
    expect(statusTier(undefined)).toBe(0);
  });

  it("a small Problematic group outranks a huge Normal group", () => {
    const problematicSmall = computeCallPriority({ ...base, overdueBalance: 5_000, groupStatus: "Problematic" });
    const normalHuge = computeCallPriority({ ...base, overdueBalance: 200_000, groupStatus: null });
    const ordered = [normalHuge, problematicSmall].sort(byCallOrder);
    expect(ordered[0]).toBe(problematicSmall);
    expect(problematicSmall.reasons).toContain("Problematic");
  });

  it("Critical outranks Problematic regardless of amounts", () => {
    const critical = computeCallPriority({ ...base, overdueBalance: 1_000, groupStatus: "Critical" });
    const problematic = computeCallPriority({ ...base, overdueBalance: 500_000, groupStatus: "Problematic" });
    const ordered = [problematic, critical].sort(byCallOrder);
    expect(ordered[0]).toBe(critical);
    expect(critical.reasons).toContain("Critical");
  });

  it("within the same tier the financial score decides the order", () => {
    const big = computeCallPriority({ ...base, overdueBalance: 100_000, groupStatus: "Problematic" });
    const small = computeCallPriority({ ...base, overdueBalance: 10_000, groupStatus: "Problematic" });
    expect(big.tier).toBe(small.tier);
    expect(big.score).toBeGreaterThan(small.score);
  });

  it("Legal is flagged in reasons and shares the top tier", () => {
    const legal = computeCallPriority({ ...base, overdueBalance: 2_000, groupStatus: "Legal" });
    expect(legal.tier).toBe(2);
    expect(legal.reasons).toContain("Legal");
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
