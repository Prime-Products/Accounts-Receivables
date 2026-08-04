import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A vessel is never a page of its own: clicking a vessel anywhere in AR Pro opens the
 * single app-wide vessel modal on top of the current page. The modal carries the full
 * vessel view — the same grouped Products card the contract shows, plus KPIs, contracts
 * and invoices — so the old three-column "Equipment on Board" dashboard and the separate
 * /vessels/:id page are gone.
 */
const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const contractDetail = read("client/src/pages/ops/OpsContractDetail.tsx");
const modal = read("client/src/components/VesselDetailDialog.tsx");
const productsTable = read("client/src/components/VesselProductsTable.tsx");
const app = read("client/src/App.tsx");

describe("contract → vessel opens the vessel modal", () => {
  it("the vessels tab row opens the modal instead of navigating", () => {
    expect(contractDetail).toContain("openVessel(a.vesselId)");
    expect(contractDetail).toContain("useVesselModal");
  });

  it("no longer routes a contract vessel to a page", () => {
    expect(contractDetail).not.toContain("/ops/vessel/");
    expect(contractDetail).not.toContain("navigate(`/vessels/${a.vesselId}`)");
  });

  it("shows the row is clickable", () => {
    const idx = contractDetail.indexOf("openVessel(a.vesselId)");
    expect(idx).toBeGreaterThan(0);
    expect(contractDetail.slice(Math.max(0, idx - 400), idx + 200)).toMatch(/cursor-pointer/);
  });
});

describe("legacy vessel routes hand off to the modal", () => {
  it("redirects the old per-vessel pages to the list, which opens the modal", () => {
    expect(app).toContain('<Route path={"/vessels/:id"}>');
    expect(app).toContain("Redirect to={`/vessels?vessel=${p.id}`}");
    expect(app).toContain('<Route path={"/ops/vessel/:id"}>');
  });

  it("mounts exactly one vessel modal for the whole app", () => {
    expect(app).toContain("VesselModalProvider");
  });
});

describe("the modal mirrors the contract Products card", () => {
  it("reuses the shared grouped products table", () => {
    expect(modal).toContain("<VesselProductsTable");
    expect(productsTable).toContain("groupContractProducts");
    expect(productsTable).toContain("productGroupBadgeColors");
  });

  it("carries the same product columns as the contract card", () => {
    for (const head of ["Product", "Qty / Vessel", "Unit Price", "Line Total", "Quota", "Supply", "Contract"]) {
      expect(productsTable).toContain(`>${head}<`);
    }
  });

  it("shows supply progress per line and a closing total for the vessel", () => {
    expect(productsTable).toContain("<SupplyBadge");
    expect(productsTable).toContain("This vessel total");
  });

  it("also shows the vessel's KPIs, contracts and invoices", () => {
    expect(modal).toContain("Open balance");
    expect(modal).toContain("Prime 247 contracts");
    expect(modal).toContain("<InvoicesTable");
  });
});
