import { describe, expect, it } from "vitest";

/** Mirrors endOfCurrentMonth() in server/routers/ar.ts */
function endOfCurrentMonth(now = new Date()): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) - 1;
}

describe("overdue end-of-month cutoff", () => {
  it("is the last millisecond of the current UTC month", () => {
    const eom = endOfCurrentMonth(new Date(Date.UTC(2026, 6, 23))); // 23 Jul 2026
    const d = new Date(eom);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(6); // July
    expect(d.getUTCDate()).toBe(31);
    expect(d.getUTCHours()).toBe(23);
    expect(d.getUTCMinutes()).toBe(59);
  });

  it("handles December rollover to January", () => {
    const eom = endOfCurrentMonth(new Date(Date.UTC(2026, 11, 15))); // 15 Dec 2026
    const d = new Date(eom);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(11);
    expect(d.getUTCDate()).toBe(31);
  });

  it("includes already-overdue and due-later-this-month invoices, excludes next month", () => {
    const now = Date.UTC(2026, 6, 23);
    const eom = endOfCurrentMonth(new Date(now));
    const invoices = [
      { dueDate: Date.UTC(2026, 5, 10), amt: 100 }, // overdue already
      { dueDate: Date.UTC(2026, 6, 28), amt: 50 }, // due later this month → counted in EOM
      { dueDate: Date.UTC(2026, 7, 5), amt: 70 }, // next month → excluded
    ];
    const overdueNow = invoices.filter(i => now > i.dueDate).reduce((s, i) => s + i.amt, 0);
    const overdueEom = invoices.filter(i => i.dueDate <= eom).reduce((s, i) => s + i.amt, 0);
    expect(overdueNow).toBe(100);
    expect(overdueEom).toBe(150);
    expect(overdueEom).toBeGreaterThanOrEqual(overdueNow);
  });
});
