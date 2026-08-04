import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { groupContractProducts, productGroupOrder, productGroupRank } from "../shared/productGrouping";

const root = join(__dirname, "..");
const detailPage = readFileSync(join(root, "client/src/pages/ops/OpsContractDetail.tsx"), "utf8");
const sidebar = readFileSync(join(root, "client/src/components/DashboardLayout.tsx"), "utf8");
const appRoutes = readFileSync(join(root, "client/src/App.tsx"), "utf8");
const schema = readFileSync(join(root, "drizzle/schema.ts"), "utf8");
const opsRouter = readFileSync(join(root, "server/routers/operations.ts"), "utf8");

describe("contract product grouping", () => {
  it("orders the natures equipment, consumables, then the rest", () => {
    expect([...productGroupOrder]).toEqual(["Equipment", "Consumable", "Other"]);
  });

  it("groups a mixed product list into the agreed reading order", () => {
    const items = [
      { id: 1, itemType: "Consumable", name: "Detector tubes" },
      { id: 2, itemType: "Other", name: "Regulator" },
      { id: 3, itemType: "Equipment", name: "GX-3R" },
      { id: 4, itemType: "Consumable", name: "Calibration cylinder" },
      { id: 5, itemType: "Equipment", name: "GX-6100" },
    ];
    const groups = groupContractProducts(items);
    expect(groups.map(g => g.group)).toEqual(["Equipment", "Consumable", "Other"]);
    expect(groups[0].items.map(i => i.id)).toEqual([3, 5]);
    expect(groups[0].label).toBe("Equipment");
  });

  it("omits groups that have no items so no empty headings render", () => {
    const groups = groupContractProducts([{ id: 1, itemType: "Equipment", name: "GX-3R" }]);
    expect(groups).toHaveLength(1);
    expect(groups[0].group).toBe("Equipment");
  });

  it("treats an unknown nature as Other rather than dropping the line", () => {
    const groups = groupContractProducts([{ id: 9, itemType: "Mystery", name: "Unlabelled part" }]);
    expect(groups).toHaveLength(1);
    expect(groups[0].group).toBe("Other");
    expect(productGroupRank("Mystery")).toBe(productGroupOrder.length);
  });

  it("keeps the original order of items inside a group", () => {
    const groups = groupContractProducts([
      { id: 1, itemType: "Consumable", name: "B" },
      { id: 2, itemType: "Consumable", name: "A" },
    ]);
    expect(groups[0].items.map(i => i.name)).toEqual(["B", "A"]);
  });
});

describe("contract detail tab structure", () => {
  it("splits the card into products, financials and vessels tabs", () => {
    expect(detailPage).toContain('<TabsTrigger value="products">');
    expect(detailPage).toContain('<TabsTrigger value="financials">');
    expect(detailPage).toContain('<TabsTrigger value="vessels">');
  });

  it("opens on the products tab", () => {
    // The tab comes from the URL, falling back to products.
    expect(detailPage).toContain('.get("tab") ?? "products"');
  });

  it("renders products through the shared grouping helper", () => {
    expect(detailPage).toContain('from "@shared/productGrouping"');
    expect(detailPage).toContain("productGroups.map(group =>");
  });

  it("keeps the payment schedule inside the financials tab", () => {
    const financialsStart = detailPage.indexOf('<TabsContent value="financials"');
    const vesselsStart = detailPage.indexOf('<TabsContent value="vessels"');
    const scheduleHeading = detailPage.indexOf("Payment Schedule</CardTitle>");
    expect(financialsStart).toBeGreaterThan(-1);
    expect(vesselsStart).toBeGreaterThan(financialsStart);
    expect(scheduleHeading).toBeGreaterThan(financialsStart);
    expect(scheduleHeading).toBeLessThan(vesselsStart);
  });

  it("shows the contract period and payment terms in the financials tab", () => {
    // The commercial length of the agreement replaced the payment method, which
    // was never used in practice.
    expect(detailPage).toContain("Contract Period");
    expect(detailPage).not.toContain(">Payment Method<");
    expect(detailPage).toContain("Payment Terms");
    expect(detailPage).toContain("Commercial Terms");
  });

  it("keeps the vessels list out of the products tab", () => {
    const productsStart = detailPage.indexOf('<TabsContent value="products"');
    const financialsStart = detailPage.indexOf('<TabsContent value="financials"');
    const vesselsTab = detailPage.indexOf('<TabsContent value="vessels"');
    // The vessels table and its actions must sit after the financials tab closes.
    const vesselTableHeading = detailPage.indexOf("<TableHead>Vessel</TableHead>");
    const addVesselTrigger = detailPage.indexOf("Add Vessel\n");
    expect(productsStart).toBeGreaterThan(-1);
    expect(vesselsTab).toBeGreaterThan(financialsStart);
    expect(vesselTableHeading).toBeGreaterThan(vesselsTab);
    expect(addVesselTrigger).toBeGreaterThan(vesselsTab);
  });
});

describe("contract payment terms persistence", () => {
  it("stores the contract period, terms and notes on the contract", () => {
    expect(schema).toContain('contractPeriodYears: int("contractPeriodYears")');
    expect(schema).toContain('paymentTermsDays: int("paymentTermsDays")');
    expect(schema).toContain('paymentNotes: text("paymentNotes")');
  });

  it("offers 3, 4 and 5-year periods in the UI", () => {
    expect(detailPage).toContain("const CONTRACT_PERIODS = [3, 4, 5] as const");
    expect(detailPage).toContain("CONTRACT_PERIODS.map(y =>");
    expect(detailPage).toContain("periodLabel(");
  });

  it("accepts the period and payment fields on the contract update procedure", () => {
    expect(opsRouter).toContain("contractPeriodYears: z.number().int().min(1).max(10).optional()");
    expect(opsRouter).toContain("paymentTermsDays: z.number().int().min(0).max(365).optional()");
  });

  it("derives the contract end date from the chosen period", () => {
    expect(opsRouter).toContain("end.setFullYear(end.getFullYear() + contractPeriodYears)");
    expect(opsRouter).toContain("data.endDate = end.getTime()");
  });

  it("keeps the open tab in the URL so a tab can be linked to", () => {
    expect(detailPage).toContain('new URLSearchParams(window.location.search).get("tab")');
    expect(detailPage).toContain("<Tabs value={activeTab} onValueChange={setActiveTab}");
  });
});

describe("consumable orders retired from the app", () => {
  it("removes the Orders entry from the Prime 247 menu", () => {
    expect(sidebar).not.toContain('label: "Orders"');
    expect(sidebar).not.toContain("/ops/orders");
  });

  it("removes the orders route", () => {
    expect(appRoutes).not.toContain("/ops/orders");
    expect(appRoutes).not.toContain("OpsOrders");
  });

  it("keeps the other Prime 247 destinations intact", () => {
    for (const path of ["/ops", "/ops/contracts", "/ops/assets", "/ops/certificates", "/ops/catalog"]) {
      expect(sidebar).toContain(`path: "${path}"`);
    }
  });
});
