import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const router = readFileSync(join(process.cwd(), "server/routers/addressBook.ts"), "utf8");
const page = readFileSync(join(process.cwd(), "client/src/pages/AddressBook.tsx"), "utf8");

/**
 * The same person is registered on every company of a group, so the raw contact
 * rows repeat them (Irene Kofina on three Enesel companies). The list collapses
 * them into one row. These tests pin the identity rule, because getting it wrong
 * in either direction is damaging: too loose merges unrelated colleagues who
 * share a company mailbox, too strict leaves the duplicates on screen.
 */
describe("contacts list collapses duplicate people", () => {
  it("keys the merge on name AND email, never on email alone", () => {
    const key = router.match(/const key = `\$\{r\.name[^`]*`/)?.[0] ?? "";
    expect(key).toContain("r.name");
    expect(key).toContain("r.email");
  });

  it("does not scope the merge to a single group key", () => {
    // Sister companies are often filed under their own group name, so including
    // r.group in the key would leave the duplicates unmerged.
    const key = router.match(/const key = `\$\{r\.name[^`]*`/)?.[0] ?? "";
    expect(key).not.toContain("r.group");
  });

  it("carries every company and group of the person on the merged row", () => {
    expect(router).toContain("companyNames");
    expect(router).toContain("groupNames");
    // The arrays are internal to the merge; the row ships the joined string plus
    // a count, so the client can render "first name +n" without a second copy.
    expect(router).toMatch(/companyName: companyNames\.join\(", "\)/);
    expect(router).toMatch(/companyCount: companyNames\.length/);
    expect(router).toMatch(/group: groupNames\.join\(", "\)/);
    expect(router).toMatch(/groupCount: groupNames\.length/);
  });

  it("keeps data recorded on any duplicate: gift, department type, title, phone", () => {
    expect(router).toMatch(/r\.giftHistory\.length > seen\.giftHistory\.length/);
    expect(router).toMatch(/r\.contactType === "Department"/);
    expect(router).toMatch(/if \(!seen\.title && r\.title\)/);
    expect(router).toMatch(/if \(!seen\.phone && r\.phone\)/);
  });

  it("merges the search haystacks so the person is still findable by any of their companies", () => {
    // Merged without repeating text already present, so the payload stays small.
    expect(router).toMatch(/seen\.searchText = r\.searchText && !seen\.searchText\.includes\(r\.searchText\)/);
  });

  it("counts unique people for the Contacts tab badge", () => {
    const counts = router.slice(router.indexOf("counts: protectedProcedure"));
    expect(counts).toContain("const people = new Set(");
    expect(counts).toMatch(/contact: people\.size/);
  });

  it("shows a +n badge with the full list on hover for multi-company people", () => {
    // The lists are derived from the joined strings the row already carries.
    expect(page).toMatch(/companyCount/);
    expect(page).toMatch(/String\(r\.companyName \?\? ""\)\.split\(", "\)/);
    expect(page).toMatch(/groupCount/);
    expect(page).toMatch(/String\(r\.group \?\? ""\)\.split\(", "\)/);
    expect(page).toMatch(/\+\{companies\.length - 1\}/);
    expect(page).toMatch(/\+\{groups\.length - 1\}/);
  });
});

/**
 * Regression guard for the real data shape: a shared company mailbox must not
 * become an identity. 42 different MSC employees sit on info@msccy.com.cy.
 */
describe("shared company mailboxes are not treated as one person", () => {
  it("uses the name as the primary discriminator", () => {
    const merge = router.slice(router.indexOf("const merged = new Map"), router.indexOf("const rows = Array.from(merged"));
    const keyLine = merge.split("\n").find(l => l.includes("const key =")) ?? "";
    // Name must come first in the composite key, so two colleagues sharing a
    // mailbox land in different buckets.
    expect(keyLine.indexOf("r.name")).toBeGreaterThan(-1);
    expect(keyLine.indexOf("r.name")).toBeLessThan(keyLine.indexOf("r.email"));
  });
});
