import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const page = readFileSync(join(process.cwd(), "client/src/pages/Customers.tsx"), "utf8");

/**
 * The Companies tab lists the whole ledger (3,400+ companies). Rendering every
 * row at once made the tab slow to open and to sort, so it pages like the
 * Address Book. Filters and the TOTAL row must still see the full set — only the
 * DOM is limited — which is what these tests pin.
 */
describe("Companies tab pages its rows", () => {
  it("renders a bounded slice, not the whole filtered list", () => {
    expect(page).toMatch(/const COMPANY_PAGE = \d+/);
    expect(page).toMatch(/filtered\.slice\(0, companyLimit\)/);
    expect(page).toContain("visibleCompanies.map(c => (");
    expect(page).not.toContain("filtered.map(c => (");
  });

  it("offers Show more and Show all", () => {
    expect(page).toMatch(/setCompanyLimit\(n => n \+ COMPANY_PAGE\)/);
    expect(page).toMatch(/setCompanyLimit\(filtered\.length\)/);
    expect(page).toMatch(/Showing \{visibleCompanies\.length\} of \{filtered\.length\}/);
  });

  it("resets the page size when the filters or sort change", () => {
    const effect = page.slice(page.indexOf("setCompanyLimit(COMPANY_PAGE);\n  }, ["));
    expect(effect.slice(0, 80)).toContain("[search, ratingFilter, companySort, view]");
  });

  it("keeps totals over the full filtered set", () => {
    // The TOTAL row and KPI cards must not reflect only the visible page.
    expect(page).toMatch(/TOTAL \(\{filtered\.length\} companies\)/);
    expect(page).toMatch(/\[filtered\]/);
  });
});
