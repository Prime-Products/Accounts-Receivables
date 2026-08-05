import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

/**
 * The vessel's products card is the contract's Products card scoped to one vessel.
 * These tests pin the shared vocabulary so the two cards cannot drift apart again.
 */
describe("vessel products card mirrors the contract products card", () => {
  // A vessel opens as a modal; the card itself is the shared products table.
  const vessel = read("client/src/components/VesselProductsTable.tsx");
  const modal = read("client/src/components/VesselDetailDialog.tsx");
  const contract = read("client/src/pages/ops/OpsContractDetail.tsx");

  it("uses the same card title and subtitle wording", () => {
    expect(modal).toContain("<Package className=\"h-3.5 w-3.5\" /> Products");
    expect(modal).toContain("Grouped by nature — equipment first, then consumables");
    expect(contract).toContain("Grouped by nature — equipment first, then consumables");
  });

  it("drops the old vessel-only heading", () => {
    expect(modal).not.toContain("Contract items on board");
    expect(modal).not.toContain("Equipment on Board");
  });

  it("heads each nature with the same coloured badge, line count and per-vessel value", () => {
    for (const src of [vessel, contract]) {
      // Both read the palette from the shared helper (the contract page keeps a local alias).
      expect(src).toContain('from "@shared/productGrouping"');
      expect(src).toMatch(/(productGroupBadgeColors|productTypeColors)\[group\.group\]/);
      expect(src).toContain("{group.items.length} line{group.items.length !== 1 ? \"s\" : \"\"} ·");
      expect(src).toContain("per vessel");
    }
  });

  it("shows the contract's commercial columns on the vessel too", () => {
    expect(vessel).toContain("<TableHead>Product</TableHead>");
    expect(vessel).toContain("Qty / Vessel");
    expect(vessel).toContain("Unit Price");
    expect(vessel).toContain("Line Total");
    expect(vessel).toContain("<TableHead>Quota</TableHead>");
  });

  it("renders quota exactly as the contract card does", () => {
    const quota = "item.quotaType ? `${item.quotaLimit} / ${item.quotaType === \"ContractLife\" ? \"contract\" : \"year\"}` : \"—\"";
    expect(vessel).toContain(quota);
    expect(contract).toContain(quota);
  });

  it("closes with a total row stating this vessel's value and supply progress", () => {
    expect(vessel).toContain("This vessel total");
    expect(vessel).toContain("fmtEur(vesselValue)");
    expect(vessel).toContain("const vesselValue = items.reduce((s, i) => s + Number(i.sellingPrice) * i.quantity, 0)");
  });

  it("keeps the supply badge and contract link columns that only the vessel needs", () => {
    expect(vessel).toContain("<TableHead>Supply</TableHead>");
    expect(vessel).toContain("<TableHead>Contract</TableHead>");
    expect(vessel).toContain("<SupplyBadge supplied={item.unitsSupplied} total={item.unitsExpected} />");
  });

  it("spans the serial detail and group headings across every column", () => {
    // The table computes its own span so the same component works with and
    // without the Contract column.
    expect(vessel).toContain("colSpan={columnCount}");
    expect(vessel).not.toContain("colSpan={4}");
  });
});

describe("product nature colours live in one place", () => {
  const shared = read("shared/productGrouping.ts");
  const contract = read("client/src/pages/ops/OpsContractDetail.tsx");

  it("exports the palette from the shared grouping helper", () => {
    expect(shared).toContain("export const productGroupBadgeColors");
    expect(shared).toContain("Equipment: \"bg-purple-100 text-purple-800 border-purple-200\"");
  });

  it("has the contract page consume the shared palette instead of its own copy", () => {
    expect(contract).toContain("const productTypeColors = productGroupBadgeColors");
  });
});

describe("vessel items carry the contract's commercials", () => {
  const src = read("server/routers/ar.ts");

  it("returns unit cost and selling price on each vessel contract item", () => {
    expect(src).toContain("unitCost: item.unitCost");
    expect(src).toContain("sellingPrice: item.sellingPrice");
  });
});
