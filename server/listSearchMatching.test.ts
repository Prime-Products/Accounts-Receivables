import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { matchesAllTokens } from "../shared/textMatch";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

/**
 * Every list's own search box must behave like the global search: accents and
 * script (Greek vs Latin) are irrelevant, and words may appear in any order.
 * These specs pin the wiring so a future refactor cannot silently fall back to
 * plain `toLowerCase().includes()` matching on one page only.
 */
describe("per-list search boxes use shared matching", () => {
  const pages = ["client/src/pages/AddressBook.tsx", "client/src/pages/Vessels.tsx", "client/src/pages/Customers.tsx", "client/src/pages/Invoices.tsx"];

  it.each(pages)("%s imports the shared matcher", page => {
    expect(read(page)).toContain('from "@shared/textMatch"');
  });

  it("Collections Desk filters groups through the matcher", () => {
    const src = read("client/src/pages/Customers.tsx");
    expect(src).toMatch(/matchesSearch = matchesAllTokens\(search, \[g\.group\]\)/);
    // The old substring filter must be gone.
    expect(src).not.toContain("g.group.toLowerCase().includes(search.toLowerCase())");
  });

  it("Invoices search covers number, customer, vessel and group", () => {
    const src = read("client/src/pages/Invoices.tsx");
    expect(src).toMatch(/matchesAllTokens\(search, \[i\.invoiceNumber, i\.customerName, vessel, group\]\)/);
    expect(src).not.toContain("i.invoiceNumber.toLowerCase().includes(q)");
  });
});

describe("list search behaviour the pages rely on", () => {
  it("finds a Latin-spelled customer from a Greek query", () => {
    expect(matchesAllTokens("Μπουκουβάλα", ["Prokopis Boukouvalas", "C1234", "MINERVA"])).toBe(true);
  });

  it("matches an invoice number and a customer name in either word order", () => {
    const row = ["INV-2026-1234", "Prokopis Boukouvalas", "M/V ATHENA", "MINERVA"];
    expect(matchesAllTokens("boukouvalas 1234", row)).toBe(true);
    expect(matchesAllTokens("1234 boukouvalas", row)).toBe(true);
  });

  it("matches a vessel name together with its group", () => {
    expect(matchesAllTokens("athena minerva", ["INV-1", "Some Co", "M/V ATHENA", "MINERVA"])).toBe(true);
  });

  it("rejects a row when one token is absent everywhere", () => {
    expect(matchesAllTokens("boukouvalas tsakos", ["INV-1", "Prokopis Boukouvalas", "", "MINERVA"])).toBe(false);
  });

  it("treats an empty query as matching everything", () => {
    expect(matchesAllTokens("", ["anything"])).toBe(true);
    expect(matchesAllTokens("   ", ["anything"])).toBe(true);
  });

  it("ignores null and undefined fields instead of throwing", () => {
    expect(matchesAllTokens("minerva", [null, undefined, "MINERVA GROUP"])).toBe(true);
  });
});
