import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const opsDbSrc = readFileSync(join(root, "server/opsDb.ts"), "utf8");
const routerSrc = readFileSync(join(root, "server/routers/operations.ts"), "utf8");
const listSrc = readFileSync(join(root, "client/src/pages/ops/OpsContractsList.tsx"), "utf8");
const detailSrc = readFileSync(join(root, "client/src/pages/ops/OpsContractDetail.tsx"), "utf8");

describe("contract delete — server cascade", () => {
  it("exposes a single-contract delete helper", () => {
    expect(opsDbSrc).toMatch(/export async function deleteContractsCascade/);
  });

  it("reports what will be removed before deleting", () => {
    expect(opsDbSrc).toMatch(/export async function countContractDependents/);
  });

  it("removes the dependent records, not just the contract row", () => {
    const start = opsDbSrc.indexOf("export async function deleteContractsCascade");
    const body = opsDbSrc.slice(start, opsDbSrc.indexOf("// CONTRACT LIBRARY", start));
    for (const table of [
      "opsVesselAssignments",
      "opsContractLibrary",
      "opsAssets",
      "opsPaymentSchedule",
      "opsCertificates",
    ]) {
      expect(body).toContain(`delete(${table})`);
    }
  });

  it("never touches the product pricelist while deleting a contract", () => {
    const start = opsDbSrc.indexOf("export async function deleteContractsCascade");
    const body = opsDbSrc.slice(start, opsDbSrc.indexOf("// CONTRACT LIBRARY", start));
    expect(body).not.toMatch(/delete\(opsAssetCatalog|delete\(opsConsumableCatalog/);
  });
});

describe("contract delete — router", () => {
  it("exposes deleteImpact and remove procedures", () => {
    expect(routerSrc).toMatch(/deleteImpact:\s*protectedProcedure/);
    expect(routerSrc).toMatch(/remove:\s*protectedProcedure/);
  });

  it("guards against a missing contract instead of silently succeeding", () => {
    const region = routerSrc.slice(routerSrc.indexOf("remove: protectedProcedure"));
    expect(region.slice(0, 1200)).toMatch(/NOT_FOUND/);
  });
});

describe("contract delete — UI", () => {
  it("offers a delete action on every contract row", () => {
    expect(listSrc).toMatch(/setDeleteId\(c\.id\)/);
    expect(listSrc).toMatch(/Delete \{c\.contractNumber\}/);
  });

  it("stops the row click from navigating when delete is pressed", () => {
    const region = listSrc.slice(listSrc.indexOf("setDeleteId(c.id)") - 400, listSrc.indexOf("setDeleteId(c.id)") + 80);
    expect(region).toMatch(/stopPropagation/);
  });

  it("keeps the row/header column counts in step after adding the actions column", () => {
    // Contract # / Customer / Title / Value / Vessels / Status / Start / End (+ actions).
    expect(listSrc).toMatch(/colSpan=\{8\}/);
    expect(listSrc).toMatch(/actions:\s*\d+/);
  });

  it("offers a delete action on the contract detail header", () => {
    expect(detailSrc).toMatch(/setDeleteOpen\(true\)/);
  });

  it("spells out the cascade counts in both confirmations", () => {
    for (const src of [listSrc, detailSrc]) {
      expect(src).toMatch(/vessel assignment/);
      expect(src).toMatch(/product line/);
      expect(src).toMatch(/equipment unit/);
      expect(src).toMatch(/cannot be undone/);
    }
  });

  it("reassures the user that customers, vessels and the pricelist survive", () => {
    for (const src of [listSrc, detailSrc]) {
      const region = src.slice(src.indexOf("Will be kept"));
      expect(region.slice(0, 400)).toMatch(/pricelist/);
    }
  });

  it("returns to the contract list after deleting from the detail page", () => {
    const region = detailSrc.slice(detailSrc.indexOf("const removeContract"));
    expect(region.slice(0, 900)).toMatch(/navigate\("\/ops\/contracts"\)/);
  });
});
