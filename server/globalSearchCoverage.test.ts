import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/**
 * The one search box at the top of the app is the fastest way into any record,
 * so it has to cover every kind of thing AR Pro stores — not just customers and
 * invoices. These tests pin the entity coverage end to end: db helper → tRPC
 * procedure → dropdown section, plus the deep links each result needs to land
 * on something useful.
 */
describe("global search covers every record type", () => {
  const db = read("server/db.ts");
  const router = read("server/routers/ar.ts");
  const ui = read("client/src/components/GlobalSearch.tsx");

  it("queries Prime 247 contracts, quotations, credit notes, equipment, certificates and catalogs in the db helper", () => {
    const helper = db.slice(db.indexOf("export async function globalSearch"));
    const body = helper.slice(0, helper.indexOf("\n}\n"));
    for (const table of [
      "opsContracts",
      "opsQuotations",
      "creditNotes",
      "opsAssets",
      "opsCertificates",
      "opsAssetCatalog",
      "opsConsumableCatalog",
    ]) {
      expect(body).toContain(`.from(${table})`);
    }
  });

  it("matches contracts by number, title and customer name", () => {
    expect(db).toContain("like(opsContracts.contractNumber, q)");
    expect(db).toContain("like(opsContracts.title, q)");
  });

  it("finds equipment by serial number", () => {
    expect(db).toContain("like(opsAssets.serialNumber, q)");
    expect(db).toContain("like(opsCertificates.certificateNumber, q)");
  });

  it("returns the new collections from the search procedure", () => {
    const proc = router.slice(router.indexOf("  search: protectedProcedure"));
    const body = proc.slice(0, proc.indexOf("\n    }),"));
    for (const key of ["contracts:", "quotations:", "creditNotes:", "equipment:", "certificates:", "products:"]) {
      expect(body).toContain(key);
    }
  });

  it("only offers credit notes that still have an open balance", () => {
    expect(router).toContain("filter(cn => Number(cn.openAmount) > 0)");
  });

  it("renders a dropdown section for each new entity", () => {
    for (const title of [
      'title="Prime 247 contracts"',
      'title="Quotations"',
      'title="Equipment on board"',
      'title="Certificates"',
      'title="Products (pricelist)"',
      'title="Credit notes"',
    ]) {
      expect(ui).toContain(title);
    }
  });

  it("deep links each result to a screen that shows it", () => {
    expect(ui).toContain("go(`/ops/contracts/${c.id}`)");
    expect(ui).toContain("/ops/assets?q=");
    expect(ui).toContain("/ops/certificates?q=");
    expect(ui).toContain("/ops/catalog?tab=");
    expect(ui).toContain("/invoices?view=credits&q=");
  });

  it("seeds the target pages from those deep links", () => {
    expect(read("client/src/pages/ops/OpsCertificates.tsx")).toContain('get("q")');
    expect(read("client/src/pages/ops/OpsAssets.tsx")).toContain('get("q")');
    expect(read("client/src/pages/ops/OpsCatalog.tsx")).toContain('get("tab")');
  });

  it("advertises the wider scope in the placeholder", () => {
    expect(ui).toContain("Search anything");
  });
});
