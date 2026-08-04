import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const schema = readFileSync(join(root, "drizzle/schema.ts"), "utf8");
const router = readFileSync(join(root, "server/routers/operations.ts"), "utf8");
const detail = readFileSync(join(root, "client/src/pages/ops/OpsContractDetail.tsx"), "utf8");
const list = readFileSync(join(root, "client/src/pages/ops/OpsContractsList.tsx"), "utf8");

/**
 * The Operations module used to spread one agreement across three separate
 * catalogs (Services / Asset Types / Consumables) plus a "Contract Library",
 * which made the Contracts card unusable. A contract now owns ONE product list,
 * its customer, its vessels and its financials, with a four-state lifecycle.
 */
describe("ops contract lifecycle statuses", () => {
  it("declares exactly Offer, Active, Expired, Cancelled", () => {
    const m = schema.match(/opsContractStatuses = \[([^\]]+)\]/);
    expect(m).toBeTruthy();
    const statuses = (m?.[1] ?? "").match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, "")) ?? [];
    expect(statuses).toEqual(["Offer", "Active", "Expired", "Cancelled"]);
  });

  it("no longer references the retired Draft/Sent/Terminated states in the contract UI", () => {
    for (const dead of ["Draft", "Sent", "Terminated"]) {
      expect(detail).not.toContain(`"${dead}"`);
      expect(list).not.toContain(`value="${dead}"`);
    }
  });

  it("creates every new contract as an Offer", () => {
    expect(router).toMatch(/status: "Offer"/);
  });

  it("offers Activate, Mark Expired and Cancel actions from the detail page", () => {
    expect(detail).toMatch(/status: "Active"/);
    expect(detail).toMatch(/status: "Expired"/);
    expect(detail).toMatch(/status: "Cancelled"/);
  });
});

describe("single unified product list", () => {
  it("declares the three product natures on one enum", () => {
    const m = schema.match(/opsLibraryItemTypes = \[([^\]]+)\]/);
    const types = (m?.[1] ?? "").match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, "")) ?? [];
    expect(types).toEqual(["Equipment", "Consumable", "Other"]);
  });

  it("marks only equipment as serial-tracked", () => {
    const m = schema.match(/opsSerialTrackedTypes = \[([^\]]+)\]/);
    const types = (m?.[1] ?? "").match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, "")) ?? [];
    expect(types).toEqual(["Equipment"]);
  });

  it("stores price and cost directly on each product line", () => {
    expect(schema).toMatch(/unitCost/);
    expect(schema).toMatch(/sellingPrice/);
  });

  it("lets a product be typed freely without a catalog entry", () => {
    expect(router).toMatch(/catalogId: z\.number\(\)\.nullable\(\)\.optional\(\)/);
  });

  it("supports editing and removing products, not only adding", () => {
    expect(router).toMatch(/updateLibraryItem: protectedProcedure/);
    expect(router).toMatch(/removeLibraryItem: protectedProcedure/);
    expect(detail).toMatch(/updateLibraryItem\.useMutation/);
    expect(detail).toMatch(/removeLibraryItem\.useMutation/);
  });

  it("drops the three-catalog pickers from the contract page", () => {
    expect(detail).not.toMatch(/opsCatalog\.services\.list/);
    expect(detail).not.toMatch(/opsCatalog\.assets\.list/);
    expect(detail).not.toMatch(/opsCatalog\.consumables\.list/);
  });
});

describe("financials derived per vessel", () => {
  it("persists an agreed price per vessel and installment count", () => {
    expect(schema).toMatch(/pricePerVessel/);
    expect(schema).toMatch(/installmentCount/);
  });

  it("computes contract value as price per vessel x fleet size", () => {
    expect(router).toMatch(/input\.pricePerVessel \* Math\.max\(vesselIds\.length, 1\)/);
    expect(router).toMatch(/price \* Math\.max\(assignments\.length, 1\)/);
  });

  it("recalculates the contract total when the fleet changes", () => {
    expect(router).toMatch(/async function recalcContractTotal/);
    expect(router).toMatch(/removeVessel: protectedProcedure/);
  });

  it("only rebuilds the payment schedule while nothing is invoiced or paid", () => {
    expect(router).toMatch(/rows\.every\(p => p\.status === "Pending"\)/);
  });

  it("surfaces cost, list price and margin per vessel for the offer", () => {
    expect(router).toMatch(/costPerVessel/);
    expect(router).toMatch(/listPricePerVessel/);
    expect(router).toMatch(/margin/);
    expect(detail).toMatch(/totals\.margin/);
  });

  it("asks for price per vessel rather than a lump total when creating", () => {
    expect(list).toMatch(/Price per Vessel/);
    expect(list).not.toMatch(/Total Value \(€\) \*/);
  });
});
