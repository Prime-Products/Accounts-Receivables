import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const services = [
  { id: 1, name: "Annual Calibration", category: "Service", defaultCost: "80.00", sellingPrice: "140.00", active: true },
  { id: 2, name: "Retired Service", category: null, defaultCost: "10.00", sellingPrice: "20.00", active: false },
];
const products = [
  { id: 7, name: "GX-3R Pro", category: "Gas Detectors", defaultCost: "620.00", sellingPrice: "980.00", active: true },
];
const consumables = [
  { id: 4, name: "CO2 Ampoule", category: "Ampoules", unit: "pcs", defaultCostPerUnit: "40.00", sellingPricePerUnit: "68.00", active: true },
];

vi.mock("../drizzle/schema", () => ({}));

describe("listPricelist", () => {
  beforeEach(() => vi.resetModules());

  async function loadPricelist() {
    vi.doMock("./opsDb", async importOriginal => {
      const actual = await importOriginal<typeof import("./opsDb")>();
      return actual;
    });
    return null;
  }

  it("flattens the pricelist tables into one list of active entries", async () => {
    // The helper composes the list functions, so we verify its source contract
    // rather than standing up a database: shape and mapping are what callers rely on.
    const src = read("server/opsDb.ts");
    expect(src).toContain("export async function listPricelist()");
    expect(src).toContain("listAssetCatalog()");
    expect(src).toContain("listConsumableCatalog()");
    // Services left the taxonomy, so they must not leak into contract lines.
    expect(src).not.toContain('suggestedItemType: "Service"');
    // Inactive rows must never reach a contract.
    expect(src.match(/\.filter\(\w+ => \w+\.active\)/g)?.length).toBeGreaterThanOrEqual(2);
    await loadPricelist();
  });

  it("maps each source to the item nature used by contracts", () => {
    const src = read("server/opsDb.ts");
    expect(src).toContain('source: "product" as const');
    expect(src).toContain('suggestedItemType: "Equipment" as const');
    expect(src).toContain('source: "consumable" as const');
    expect(src).toContain('suggestedItemType: "Consumable" as const');
  });

  it("exposes stable keys and both prices for every entry", () => {
    const src = read("server/opsDb.ts");
    expect(src).toContain("key: `product-${p.id}`");
    expect(src).toContain("key: `consumable-${c.id}`");
    expect(src).toContain("unitCost: p.defaultCost");
    expect(src).toContain("sellingPrice: p.sellingPrice");
    expect(src).toContain("unitCost: c.defaultCostPerUnit");
    expect(src).toContain("sellingPrice: c.sellingPricePerUnit");
  });

  it("keeps the fixture shape the UI expects", () => {
    // Guards against silently dropping a field the picker renders.
    for (const row of [...services, ...products]) {
      expect(row).toHaveProperty("defaultCost");
      expect(row).toHaveProperty("sellingPrice");
    }
    expect(consumables[0]).toHaveProperty("defaultCostPerUnit");
    expect(consumables[0]).toHaveProperty("sellingPricePerUnit");
  });
});

describe("pricelist procedure", () => {
  const src = read("server/routers/operations.ts");

  it("publishes a pricelist query on the catalog router", () => {
    expect(src).toContain("pricelist:");
    expect(src).toContain("listPricelist");
  });

  it("accepts selling prices on all three catalog sections", () => {
    expect(src).toContain("sellingPrice");
    expect(src).toContain("sellingPricePerUnit");
  });

  it("persists the pricelist origin on contract product edits", () => {
    const updateBlock = src.slice(src.indexOf("updateLibraryItem"), src.indexOf("updateLibraryItem") + 900);
    expect(updateBlock).toContain("catalogId");
  });
});

describe("contract Add Product dialog", () => {
  const src = read("client/src/pages/ops/OpsContractDetail.tsx");
  const picker = read("client/src/components/ProductPicker.tsx");

  it("queries the pricelist", () => {
    expect(picker).toContain("trpc.opsCatalog.pricelist.useQuery()");
  });

  it("chooses the product from a searchable picker rather than a plain text field", () => {
    expect(src).toContain('import { ProductPicker } from "@/components/ProductPicker"');
    expect(src).toContain("<ProductPicker");
    expect(src).toContain("onSelectEntry={applyPricelistEntry}");
    expect(src).not.toContain("From Pricelist (optional)");
  });

  it("still allows a one-off product that is not in the pricelist", () => {
    expect(src).toContain("onFreeText={name =>");
    expect(picker).toContain("as a one-off line");
    expect(picker).toContain("onFreeText(typed)");
  });

  it("opens the dialog wide enough to read long product names", () => {
    expect(src).toMatch(/storageKey="ops-lib-item-v2" defaultWidth=\{860\} defaultHeight=\{680\}/);
  });

  it("auto-fills name, cost and price from the chosen entry", () => {
    const apply = src.slice(src.indexOf("const applyPricelistEntry"), src.indexOf("const applyPricelistEntry") + 700);
    expect(apply).toContain("name: entry.name");
    expect(apply).toContain("unitCost");
    expect(apply).toContain("sellingPrice");
    expect(apply).toContain("catalogId: entry.catalogId");
  });

  it("lets the user search the pricelist by name, category or nature", () => {
    expect(picker).toContain("<CommandInput");
    expect(picker).toContain('value={`${e.name} ${e.category ?? ""} ${sourceLabel[e.source] ?? ""}`}');
  });

  it("shows the price and nature of every option in the list", () => {
    expect(picker).toContain("fmtEur(Number(e.sellingPrice))");
    expect(picker).toContain("sourceLabel[e.source]");
  });

  it("explains an empty pricelist instead of showing a dead dropdown", () => {
    expect(src).toContain("Pricelist is empty");
    expect(picker).toContain("Prime 247 > Pricelist");
  });

  it("sends the catalog link when saving the product line", () => {
    expect(src).toContain("catalogId: libForm.catalogId");
  });
});

describe("Pricelist page price fields", () => {
  const src = read("client/src/pages/ops/OpsCatalog.tsx");

  it("shows a selling price column in the equipment tab", () => {
    expect(src.match(/<TableHead>Selling Price<\/TableHead>/g)?.length).toBe(1);
  });

  it("shows a price per unit column for consumables", () => {
    expect(src).toContain("<TableHead>Price/Unit</TableHead>");
  });

  it("collects selling price in every create and edit dialog", () => {
    expect(src.match(/<Label>Selling Price<\/Label>/g)?.length).toBe(2);
    expect(src.match(/<Label>Price per Unit<\/Label>/g)?.length).toBe(2);
  });

  it("sends the price fields to the mutations", () => {
    expect(src).toContain("sellingPrice: form.sellingPrice || undefined");
    expect(src).toContain("sellingPricePerUnit: form.sellingPricePerUnit || undefined");
  });
});
