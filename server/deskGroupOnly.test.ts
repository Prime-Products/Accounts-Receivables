import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const page = readFileSync(join(process.cwd(), "client/src/pages/Customers.tsx"), "utf8");

/**
 * Collections is tracked per group only — the flat "Companies" tab that used to sit
 * next to "Groups" on the Desk was removed on request. A single company is reached
 * from its group's member list (Customer 360), never from a company list here.
 *
 * These tests replace the old Companies-tab paging tests: they pin the removal so the
 * tab cannot creep back, and pin that the group list keeps its own paging and totals.
 */
describe("Collections Desk is group-only", () => {
  it("has no Groups/Companies view switch", () => {
    expect(page).not.toContain("TabsTrigger");
    expect(page).not.toContain('setView(v as "groups" | "companies")');
    expect(page).not.toMatch(/view === "companies"/);
    expect(page).not.toMatch(/view === "groups"/);
  });

  it("drops the flat company table and its paging state", () => {
    expect(page).not.toContain("COMPANY_COL_DEFAULTS");
    expect(page).not.toContain("companyLimit");
    expect(page).not.toContain("visibleCompanies");
    expect(page).not.toMatch(/TOTAL \(\{filtered\.length\} companies\)/);
  });

  it("loads the group list unconditionally", () => {
    expect(page).toContain("trpc.customers.groups.useQuery()");
  });

  it("renders the group rows from the filtered group set", () => {
    expect(page).toContain("filteredGroups.map(g => (");
  });

  it("keeps the TOTAL row over the full filtered group set", () => {
    expect(page).toMatch(/TOTAL \(\{filteredGroups\.length\} groups\)/);
  });
});
