import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const operations = readFileSync(join(root, "server/routers/operations.ts"), "utf8");
const contractPage = readFileSync(join(root, "client/src/pages/ops/OpsContractDetail.tsx"), "utf8");
const schema = readFileSync(join(root, "drizzle/schema.ts"), "utf8");
const opsDb = readFileSync(join(root, "server/opsDb.ts"), "utf8");

/**
 * Each vessel on a contract is billed on its own schedule, starting from the date that
 * vessel's equipment shipped. These tests pin that rule down at the schema, generation
 * and presentation layers so a future refactor cannot silently return to one fleet-wide
 * schedule.
 */
describe("per-vessel installments — schema", () => {
  it("records a shipment date on the vessel assignment", () => {
    expect(schema).toMatch(/shipmentDate: bigint\("shipmentDate"/);
  });

  it("links each installment to a vessel", () => {
    const scheduleTable = schema.slice(schema.indexOf("opsPaymentSchedule"));
    expect(scheduleTable.slice(0, 1200)).toMatch(/vesselId: int\("vesselId"\)/);
  });
});

describe("per-vessel installments — generation", () => {
  it("splits the per-vessel price, not the whole contract value", () => {
    const fn = operations.slice(operations.indexOf("async function generateVesselSchedule"));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    expect(body).toMatch(/pricePerVessel/);
    expect(body).not.toMatch(/totalValue/);
  });

  it("starts the schedule at the vessel's shipment date", () => {
    const fn = operations.slice(operations.indexOf("async function generateVesselSchedule"));
    expect(fn.slice(0, fn.indexOf("\n}\n"))).toMatch(/shipmentDate/);
  });

  it("exposes a procedure to record or clear a vessel shipment", () => {
    expect(operations).toMatch(/setVesselShipment: protectedProcedure/);
    expect(operations).toMatch(/shipmentDate: z\.number\(\)\.nullable\(\)/);
  });

  it("never regenerates installments that are already invoiced or paid", () => {
    const fn = operations.slice(operations.indexOf("async function syncVesselSchedule"));
    expect(fn.slice(0, fn.indexOf("\n}\n"))).toMatch(/Pending/);
  });

  it("keeps total recalculation away from the installment rows", () => {
    const fn = operations.slice(operations.indexOf("async function recalcContractTotal"));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    expect(body).not.toMatch(/generateVesselSchedule|deletePaymentSchedule/);
  });

  it("has per-vessel schedule helpers in the db layer", () => {
    expect(opsDb).toMatch(/listPaymentScheduleForVessel/);
    expect(opsDb).toMatch(/deletePaymentScheduleItemsForVessel/);
    expect(opsDb).toMatch(/deleteFleetWidePaymentScheduleItems/);
  });
});

describe("per-vessel installments — presentation", () => {
  it("groups the payment schedule per vessel", () => {
    expect(contractPage).toMatch(/scheduleGroups/);
    expect(contractPage).toMatch(/Each vessel is billed on its own schedule/);
  });

  it("flags vessels that cannot be billed yet", () => {
    expect(contractPage).toMatch(/unscheduledVessels/);
    expect(contractPage).toMatch(/not shipped yet, so no installments/);
  });

  it("lets the shipment date be recorded from the vessels tab", () => {
    expect(contractPage).toMatch(/Shipped \/ Activated/);
    expect(contractPage).toMatch(/Record shipment/);
    expect(contractPage).toMatch(/setShipment\.mutate/);
  });

  it("keeps legacy fleet-wide rows visible under their own heading", () => {
    expect(contractPage).toMatch(/Contract-wide \(before per-vessel billing\)/);
  });
});
