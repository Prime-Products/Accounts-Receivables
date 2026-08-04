import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Clicking a vessel inside a contract must land on the full vessel page (/vessels/:id),
 * which shows the same grouped Products view as the contract itself, rather than the
 * older three-column "Equipment on Board" dashboard.
 */
const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const contractDetail = read("client/src/pages/ops/OpsContractDetail.tsx");
const vesselDetail = read("client/src/pages/VesselDetail.tsx");
const app = read("client/src/App.tsx");

describe("contract → vessel navigation", () => {
  it("sends the vessel row to the full vessel page", () => {
    expect(contractDetail).toContain("navigate(`/vessels/${a.vesselId}`)");
  });

  it("no longer opens the old ops vessel dashboard from a contract", () => {
    expect(contractDetail).not.toContain("/ops/vessel/");
  });

  it("keeps that route registered to the vessel page that carries the Products card", () => {
    expect(app).toContain('<Route path={"/vessels/:id"} component={VesselDetail} />');
  });

  it("shows the row is clickable", () => {
    const region = contractDetail.slice(contractDetail.indexOf("navigate(`/vessels/${a.vesselId}`)") - 300);
    expect(region.slice(0, 400)).toMatch(/cursor-pointer/);
  });
});

describe("vessel page mirrors the contract Products card", () => {
  it("groups the vessel's products the same way the contract does", () => {
    expect(vesselDetail).toContain("groupContractProducts");
    expect(vesselDetail).toContain("productGroupBadgeColors");
  });

  it("carries the same product columns as the contract card", () => {
    for (const head of ["Product", "Qty / Vessel", "Unit Price", "Line Total", "Quota", "Supply", "Contract"]) {
      expect(vesselDetail).toContain(`>${head}<`);
    }
  });

  it("shows supply progress per line and a closing total for the vessel", () => {
    expect(vesselDetail).toContain("<SupplyBadge");
    expect(vesselDetail).toContain("This vessel total");
  });
});
