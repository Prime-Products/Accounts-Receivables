import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/**
 * The same people are registered on every company of a group (Minerva's staff
 * sit on each Minerva company), so per-group counts must count each person once.
 */
describe("group contact de-duplication", () => {
  const router = read("server/routers/addressBook.ts");
  const dialog = read("client/src/components/AddressBookRecordDialog.tsx");

  it("defines a person identity keyed on email with a name fallback", () => {
    expect(router).toMatch(/const personKeyOf =/);
    expect(router).toMatch(/if \(email\) return `e:\$\{email\}`/);
    expect(router).toMatch(/return `n:\$\{\(ct\.name \?\? ""\)\.trim\(\)\.toLowerCase\(\)\}`/);
  });

  it("counts unique people per group instead of raw contact rows", () => {
    expect(router).toMatch(/const peopleByGroup = new Map<string, Set<string>>\(\)/);
    expect(router).toMatch(/people\.add\(personKeyOf\(ct\)\)/);
    expect(router).toMatch(/row\.contacts = people\.size/);
  });

  it("excludes archived contacts from the group count", () => {
    const block = router.slice(router.indexOf("const peopleByGroup"));
    expect(block.slice(0, 600)).toMatch(/archived === 1\) continue/);
  });

  it("shows each shared person once in the record card related list", () => {
    expect(dialog).toMatch(/const relatedContacts = useMemo\(/);
    expect(dialog).toMatch(/if \(seen\.has\(key\)\) continue;/);
  });
});

/**
 * Search has to bridge scripts: most contacts are stored in Latin letters while
 * the user types Greek (e.g. "Μπουκουβάλα" for "Prokopis Boukouvalas").
 */
describe("cross-entity, cross-script search", () => {
  const router = read("server/routers/addressBook.ts");
  const db = read("server/db.ts");
  const ar = read("server/routers/ar.ts");
  const page = read("client/src/pages/AddressBook.tsx");
  const globalSearch = read("client/src/components/GlobalSearch.tsx");

  it("uses the shared token matcher on the server", () => {
    for (const src of [router, db, ar]) {
      expect(src).toMatch(/matchesAllTokens/);
    }
  });

  it("attaches a related-entity haystack to list rows", () => {
    expect(router).toMatch(/searchText:/);
  });

  it("filters the list client-side with the same matcher", () => {
    expect(page).toMatch(/matchesAllTokens/);
  });

  it("returns contacts and vessels from global search", () => {
    expect(db).toMatch(/contacts:/);
    expect(globalSearch).toMatch(/vessels/);
  });
});
