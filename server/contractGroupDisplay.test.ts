import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Prime 247 contracts are followed at group level: the list names the group only,
 * and the specific contracting company is revealed inside the contract.
 */
const listSrc = readFileSync(join(process.cwd(), "client/src/pages/ops/OpsContractsList.tsx"), "utf8");
const detailSrc = readFileSync(join(process.cwd(), "client/src/pages/ops/OpsContractDetail.tsx"), "utf8");

describe("contracts list shows the group only", () => {
  it("labels the customer column as Group", () => {
    expect(listSrc).toMatch(/>Group <SortIcon col="customerGroup"/);
  });

  it("sorts that column by group, not by company", () => {
    expect(listSrc).toContain('toggleSort("customerGroup")');
    expect(listSrc).not.toContain('toggleSort("customerName")');
  });

  it("does not render the company name as a second line in the row", () => {
    expect(listSrc).not.toMatch(/text-xs text-muted-foreground truncate">\{c\.customerName\}/);
  });

  it("still lets search match the company name so a company lookup finds its contract", () => {
    expect(listSrc).toMatch(/matchesAllTokens\(q, \[[^\]]*c\.customerName[^\]]*c\.customerGroup/);
  });
});

describe("contract page names the company behind the group", () => {
  it("derives the group name with a fallback to the company name", () => {
    expect(detailSrc).toContain('const customerGroupName = (customer?.customerGroup ?? "").trim() || customer?.name || "—"');
  });

  it("leads with the group in the header", () => {
    expect(detailSrc).toMatch(/font-medium text-foreground">\{customerGroupName\}/);
  });

  it("shows the contracting company only when it differs from the group", () => {
    expect(detailSrc).toContain("customer.name !== customerGroupName");
  });
});
