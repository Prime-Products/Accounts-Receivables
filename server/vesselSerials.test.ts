import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("vessels.detail exposes serial-tracked instruments", () => {
  const router = read("server/routers/ar.ts");

  it("imports the ops db helpers", () => {
    expect(router).toContain('import * as opsDb from "../opsDb"');
  });

  it("loads the vessel's assets, contracts and certificates", () => {
    expect(router).toContain("opsDb.listAssets({ vesselId: input.id })");
    expect(router).toContain("opsDb.listOpsContracts()");
    expect(router).toContain("opsDb.listCertificates()");
  });

  it("returns an equipment array from the detail procedure", () => {
    expect(router).toContain("const equipment = assets.map");
    expect(router).toMatch(/return \{[\s\S]*equipment,[\s\S]*invoices: invoiceRows,/);
  });

  it("exposes the serial number and certificate urgency per instrument", () => {
    expect(router).toContain("serialNumber: a.serialNumber");
    expect(router).toContain("daysUntilCertificateExpiry");
    expect(router).toContain("contractNumber: contract?.contractNumber ?? null");
  });

  it("keeps the soonest-expiring certificate for each asset", () => {
    expect(router).toContain("cert.expiryDate < existing.expiryDate");
  });
});

describe("vessel modal shows grouped contract items with serials under the description", () => {
  const page = read("client/src/components/VesselProductsTable.tsx");
  const modal = read("client/src/components/VesselDetailDialog.tsx");

  it("renders the products card for the vessel", () => {
    expect(modal).toContain("<Package className=\"h-4 w-4\" /> Products");
  });

  it("reads the contract items from the query result", () => {
    expect(modal).toContain("const contractItems = data?.contractItems ?? []");
  });

  it("groups the items exactly like the contract card", () => {
    expect(page).toContain('from "@shared/productGrouping"');
    expect(page).toContain("groupContractProducts(items)");
    expect(page).toContain("groups.map(group =>");
  });

  it("puts the serials on sub-rows under the item name", () => {
    // The name line comes first, the per-serial detail table directly after it.
    const idxName = page.indexOf('<div className="font-medium">{item.name}</div>');
    const idxSerial = page.indexOf("{u.serialNumber}");
    expect(idxName).toBeGreaterThan(-1);
    expect(idxSerial).toBeGreaterThan(idxName);
    // The count now sits on the collapsed line; the detail opens on click.
    expect(page).toContain("{item.serials.length} serial(s)");
  });

  it("does not add a separate serial column header", () => {
    expect(page).not.toContain("<TableHead>Serial #</TableHead>");
    expect(page).toContain("<TableHead>Product</TableHead>");
  });

  it("shows the supply status per line", () => {
    expect(page).toContain("<TableHead>Supply</TableHead>");
    // Every line renders the shared badge, tracked or not.
    expect(page).toContain('import { SupplyBadge } from "@/components/SupplyBadge"');
    expect(page).toContain("<SupplyBadge supplied={item.unitsSupplied} total={item.unitsExpected} />");
    // The per-line shortfall is carried by the badge itself (e.g. "Not supplied 0/4"),
    // keeping each line to a single row.
    expect(page).toContain("unitsExpected");
  });

  it("links each instrument back to its contract", () => {
    expect(page).toContain("/ops/contracts/${item.contractId}");
  });

  it("explains the empty state", () => {
    expect(modal).toContain("This vessel is not assigned to any Prime 247 contract yet");
  });
});

describe("serial-under-name layout is consistent across the app", () => {
  it("equipment page shows the serial under the instrument name", () => {
    const page = read("client/src/pages/ops/OpsAssets.tsx");
    expect(page).toContain("S/N {a.serialNumber}");
    expect(page).toContain("Instrument <SortIcon col=\"name\" />");
    expect(page).not.toContain("Serial # <SortIcon");
    expect(page).toContain("colSpan={7}");
  });

  it("equipment search still matches on serial number", () => {
    const page = read("client/src/pages/ops/OpsAssets.tsx");
    expect(page).toContain("matchesAllTokens(q, [a.serialNumber, a.name, a.vesselName ?? \"\"])");
  });
});
