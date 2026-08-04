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

describe("vessel page shows grouped contract items with serials under the description", () => {
  const page = read("client/src/pages/VesselDetail.tsx");

  it("renders a contract-items-on-board card", () => {
    expect(page).toContain("Contract items on board ({contractItems.length})");
  });

  it("reads the contract items from the query result", () => {
    expect(page).toContain("const contractItems = data?.contractItems ?? []");
  });

  it("groups the items exactly like the contract card", () => {
    expect(page).toContain('from "@shared/productGrouping"');
    expect(page).toContain("groupContractProducts(contractItems)");
    expect(page).toContain("itemGroups.map(group =>");
  });

  it("puts the serial numbers on sub-lines under the item name", () => {
    // The name line comes first, the S/N line directly after it.
    const idxName = page.indexOf('<div className="font-medium">{item.name}</div>');
    const idxSerial = page.indexOf("S/N {u.serialNumber}");
    expect(idxName).toBeGreaterThan(-1);
    expect(idxSerial).toBeGreaterThan(idxName);
  });

  it("does not add a separate serial column header", () => {
    expect(page).not.toContain("<TableHead>Serial #</TableHead>");
    expect(page).toContain("<TableHead>Item</TableHead>");
  });

  it("shows the supply status per line", () => {
    expect(page).toContain("Supply status");
    expect(page).toContain("Not Supplied");
    expect(page).toContain("unit(s) shipped");
  });

  it("links each instrument back to its contract", () => {
    expect(page).toContain("/ops/contracts/${item.contractId}");
  });

  it("explains the empty state", () => {
    expect(page).toContain("This vessel is not assigned to any Prime 247 contract yet");
  });
});

describe("serial-under-name layout is consistent across the app", () => {
  it("ops vessel dashboard drops the standalone serial column", () => {
    const page = read("client/src/pages/ops/OpsVesselDashboard.tsx");
    expect(page).not.toContain("<TableHead>Serial #</TableHead>");
    expect(page).toContain("<TableHead>Instrument</TableHead>");
    expect(page).toContain("S/N {a.serialNumber}");
    // Empty-state colSpan must match the reduced column count.
    expect(page).toContain('colSpan={3} className="text-center py-8 text-muted-foreground">No equipment assigned');
  });

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
