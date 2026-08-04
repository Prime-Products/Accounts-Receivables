import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The user reported that "Assets" was not understandable ("τα assets δεν τα καταλαβαινω,
 * μηπως τα ονομασουμε προιοντα"). The UI now speaks about Equipment (the physical,
 * serial-numbered units on a vessel) and Products (the catalog entries a contract sells).
 * DB tables / tRPC routers / routes deliberately keep the `assets` identifier, so these
 * checks pin the user-facing strings only.
 */
const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const equipmentPage = read("client/src/pages/ops/OpsAssets.tsx");
const catalogPage = read("client/src/pages/ops/OpsCatalog.tsx");
const sidebar = read("client/src/components/DashboardLayout.tsx");
const opsDashboard = read("client/src/pages/ops/OpsDashboard.tsx");
const vesselDashboard = read("client/src/pages/ops/OpsVesselDashboard.tsx");
const certificatesPage = read("client/src/pages/ops/OpsCertificates.tsx");

describe("equipment terminology (renamed from Assets)", () => {
  it("sidebar links to Equipment while the route stays /ops/assets", () => {
    expect(sidebar).toContain('label: "Equipment", path: "/ops/assets"');
    expect(sidebar).not.toContain('label: "Assets"');
  });

  it("the page is titled Equipment on Vessels and explains one row per serial", () => {
    expect(equipmentPage).toContain("Equipment on Vessels");
    expect(equipmentPage).toContain("one row per serial number, from supply through return");
    expect(equipmentPage).not.toContain("Asset Tracking");
  });

  it("the create flow says Equipment, not Asset", () => {
    expect(equipmentPage).toContain("New Equipment");
    expect(equipmentPage).toContain('"Creating..." : "Create Equipment"');
    expect(equipmentPage).toContain('toast.success("Equipment created")');
    expect(equipmentPage).not.toMatch(/New Asset|Create Asset/);
  });

  it("search and empty state use the new wording", () => {
    expect(equipmentPage).toContain('placeholder="Search equipment..."');
    expect(equipmentPage).toContain("No equipment yet");
    expect(equipmentPage).not.toContain("Search assets...");
  });

  it("the catalog link inside the dialog is labelled Product", () => {
    expect(equipmentPage).toContain("<Label>Product <span");
    expect(equipmentPage).not.toContain("<Label>Asset Type");
    expect(equipmentPage).toContain("No products in the catalog yet");
  });
});

describe("catalog terminology", () => {
  it("the tab and dialogs say Product instead of Asset Type", () => {
    expect(catalogPage).toContain("Products</TabsTrigger>");
    expect(catalogPage).toContain("<DialogTitle>Add Product</DialogTitle>");
    expect(catalogPage).toContain("<DialogTitle>Edit Product</DialogTitle>");
    expect(catalogPage).toContain("Add Product");
    expect(catalogPage).not.toMatch(/Asset Type|asset types/);
  });

  it("toasts and empty states say Product", () => {
    expect(catalogPage).toContain('toast.success("Product created")');
    expect(catalogPage).toContain('toast.success("Product updated")');
    expect(catalogPage).toContain('toast.success("Product deleted")');
    expect(catalogPage).toContain("No products yet");
  });

  it("keeps the three catalog tabs (services, products, consumables)", () => {
    expect(catalogPage).toContain("Manage your service offerings, products, and consumable items");
  });
});

describe("equipment wording across the other ops screens", () => {
  it("KPI cards read Active Equipment", () => {
    for (const page of [opsDashboard, vesselDashboard]) {
      expect(page).toContain("Active Equipment");
      expect(page).not.toContain(">Active Assets<");
    }
  });

  it("ops dashboard subtitle and returns hint avoid the word assets", () => {
    expect(opsDashboard).toContain("Contracts, equipment, and fulfillment overview");
    expect(opsDashboard).toContain("Equipment awaiting collection");
  });

  it("the return workflow now lives on the Equipment page", () => {
    expect(equipmentPage).toContain("awaiting collection");
    expect(equipmentPage).not.toContain('toast.success("Asset marked as returned")');
  });

  it("certificates table column is Equipment while the sort key stays assetName", () => {
    expect(certificatesPage).toContain("Equipment <SortIcon");
    expect(certificatesPage).toContain('col="assetName"');
  });

  it("vessel dashboard back button returns to Equipment", () => {
    expect(vesselDashboard).toContain("Back to Equipment");
    expect(vesselDashboard).not.toContain("Back to Assets");
  });
});
