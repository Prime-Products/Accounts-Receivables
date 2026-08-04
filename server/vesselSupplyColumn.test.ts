import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const detailPage = readFileSync(join(root, "client/src/pages/ops/OpsContractDetail.tsx"), "utf8");
const opsRouter = readFileSync(join(root, "server/routers/operations.ts"), "utf8");

/**
 * The Vessels tab of a contract must show, per vessel, how much of the contracted
 * equipment has actually been supplied. The counts are computed on the server from the
 * equipment rows of the contract so the UI stays a plain read.
 */
describe("per-vessel supply counts on the contract", () => {
  it("loads the contract equipment inside the contract get procedure", () => {
    expect(opsRouter).toContain("const contractAssets = await opsDb.listAssets({ contractId: input.id })");
  });

  it("treats anything that left the warehouse as supplied", () => {
    expect(opsRouter).toContain('const suppliedStatuses = new Set(["In Transit", "Active", "Pending Return", "Returned"])');
    expect(opsRouter).not.toMatch(/suppliedStatuses = new Set\(\[[^\]]*"Not Supplied"/);
  });

  it("returns a total and a supplied count on every vessel assignment", () => {
    expect(opsRouter).toContain("equipmentTotal: own.length");
    expect(opsRouter).toContain("equipmentSupplied: own.filter(x => suppliedStatuses.has(String(x.status))).length");
  });

  it("counts only the equipment of the vessel being described", () => {
    expect(opsRouter).toContain("const own = contractAssets.filter(x => x.vesselId === a.vesselId)");
  });
});

describe("supply column in the Vessels tab", () => {
  const vesselsTab = detailPage.indexOf('<TabsContent value="vessels"');

  it("adds a Supply header to the vessels table", () => {
    const header = detailPage.indexOf("<TableHead>Supply</TableHead>");
    expect(vesselsTab).toBeGreaterThan(-1);
    expect(header).toBeGreaterThan(vesselsTab);
  });

  it("renders the supplied count as x/y", () => {
    expect(detailPage).toContain("{(a as any).equipmentSupplied}/{(a as any).equipmentTotal} supplied");
  });

  it("falls back to a dash when the vessel has no equipment rows yet", () => {
    expect(detailPage).toContain("(a as any).equipmentTotal > 0 ?");
  });

  it("keeps the empty-state colspan in step with the column count", () => {
    const emptyRow = detailPage.slice(vesselsTab).indexOf('colSpan={7} className="text-center py-8 text-muted-foreground"');
    expect(emptyRow).toBeGreaterThan(-1);
  });
});
