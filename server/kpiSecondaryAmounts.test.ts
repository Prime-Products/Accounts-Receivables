import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The KPI cards used to bury their secondary amount in a faint 10-11px
 * coloured line ("EOM: EUR 127,474", "last year: EUR 366,576 - -36%"), which was
 * hard to read. Every secondary amount now uses the same pattern as the
 * Open Balance card: a label on the left, the amount right-aligned in
 * medium-weight mono, on its own row under a divider.
 */
const groupCard = readFileSync(join(process.cwd(), "client/src/pages/GroupDetail.tsx"), "utf8");
const companyCard = readFileSync(join(process.cwd(), "client/src/pages/CustomerDetail.tsx"), "utf8");

describe("KPI secondary amounts are readable", () => {
  it("drops the old faint inline labels", () => {
    expect(groupCard).not.toContain("EOM: {fmtEur");
    expect(companyCard).not.toContain("EOM: {fmtEur");
    expect(groupCard).not.toContain("last year: {data.totals.turnoverLastYear");
    expect(companyCard).not.toContain("% vs last year");
  });

  it("labels the overdue end-of-month amount on its own row", () => {
    for (const src of [groupCard, companyCard]) {
      expect(src).toContain("End of month ·");
      expect(src).toContain("{fmtEur(data.overdueEomBalance)}");
    }
  });

  it("labels the previous-year turnover on its own row", () => {
    expect(groupCard).toContain("Last year");
    expect(groupCard).toContain("fmtEur(data.totals.turnoverLastYear)");
  });

  it("uses medium-weight mono for every secondary amount", () => {
    const rows = (src: string) => src.match(/text-\[11px\] font-mono font-medium/g) ?? [];
    // group card: EOM, expected to collect, variance, last year
    expect(rows(groupCard).length).toBeGreaterThanOrEqual(4);
    // company card: EOM, collected, remaining, avg days, credit limit, vs this year
    expect(rows(companyCard).length).toBeGreaterThanOrEqual(6);
  });

  it("separates the secondary rows with a divider", () => {
    for (const src of [groupCard, companyCard]) {
      expect(src).toContain("border-t pt-1.5");
    }
  });
});
