/**
 * The New Remittance customer picker used to rely on cmdk's built-in filtering.
 * With ~3,400 companies cmdk only scores the rows it has mounted, so typing
 * "mage" returned "No customer found" although MAGE SHIPPING LIMITED exists.
 * These tests pin the fix: filtering is done in our own code, over the full list,
 * with the shared matcher — and the dropdown data carries the fields it needs.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { matchesAllTokens, matchScore } from "../shared/textMatch";

const root = join(__dirname, "..");
const page = readFileSync(join(root, "client/src/pages/WireTransfersPage.tsx"), "utf8");
const taskDialog = readFileSync(join(root, "client/src/components/NewTaskDialog.tsx"), "utf8");
const router = readFileSync(join(root, "server/routers/ar.ts"), "utf8");

describe("remittance customer picker search", () => {
  it("does not delegate filtering to cmdk in the customer combobox", () => {
    expect(page).toContain("shouldFilter={false}");
    // The input must be controlled, otherwise our filter never sees the query.
    expect(page).toMatch(/CommandInput[\s\S]{0,120}value=\{query\}/);
    expect(page).toMatch(/onValueChange=\{setQuery\}/);
  });

  it("filters the full company list with the shared matcher, not the rendered slice", () => {
    expect(page).toContain('from "@shared/textMatch"');
    expect(page).toMatch(/companies\s*\n?\s*\.filter\(c => matchesAllTokens\(q, \[c\.name, c\.code, c\.group\]\)\)/);
  });

  it("group picker in New Task filters the same way", () => {
    expect(taskDialog).toContain("shouldFilter={false}");
    expect(taskDialog).toContain("matchesAllTokens(q, [g.name])");
  });

  it("listCompanies ships code and group so they are searchable", () => {
    const proc = router.slice(router.indexOf("listCompanies: protectedProcedure"));
    expect(proc.slice(0, 400)).toContain("code: c.code ?? null");
    expect(proc.slice(0, 400)).toContain("group: c.customerGroup ?? null");
  });

  it("matches the reported case: 'mage' finds MAGE SHIPPING LIMITED", () => {
    const companies = [
      { name: "MAGE SHIPPING LIMITED", code: "MAGE-SHIPPING-LIMITED-0145", group: "DYNACOM" },
      { name: "CHANDRIS HELLAS INC", code: "CHANDRIS-0001", group: "CHANDRIS" },
      { name: "IMAGE MARINE SA", code: "IMAGE-0002", group: "IMAGE" },
    ];
    const hits = companies.filter(c => matchesAllTokens("mage", [c.name, c.code, c.group]));
    expect(hits.map(c => c.name)).toContain("MAGE SHIPPING LIMITED");
    // Substring hits are allowed, but the exact word ranks first.
    const ranked = hits
      .slice()
      .sort((a, b) => matchScore("mage", [b.name, b.code, b.group]) - matchScore("mage", [a.name, a.code, a.group]));
    expect(ranked[0].name).toBe("MAGE SHIPPING LIMITED");
  });

  it("searching a group name finds its member companies", () => {
    const companies = [
      { name: "MAGE SHIPPING LIMITED", code: "MAGE-0145", group: "DYNACOM" },
      { name: "CREST AGENCY LTD", code: "CREST-0009", group: "DYNACOM" },
      { name: "CHANDRIS HELLAS INC", code: "CHANDRIS-0001", group: "CHANDRIS" },
    ];
    const hits = companies.filter(c => matchesAllTokens("dynacom", [c.name, c.code, c.group]));
    expect(hits).toHaveLength(2);
  });
});
