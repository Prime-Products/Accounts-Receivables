import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ops = readFileSync(join(process.cwd(), "server/routers/operations.ts"), "utf8");
const detail = readFileSync(join(process.cwd(), "client/src/pages/ops/OpsContractDetail.tsx"), "utf8");

describe("equipment generation from the contract product list", () => {
  it("exposes a single shared helper instead of duplicating the loop", () => {
    expect(ops).toContain("async function generateEquipmentForVessel(");
    // The inline generation loop that used to live in assignVessel must be gone.
    expect(ops).not.toMatch(/AUTOMATION ENGINE[\s\S]{0,200}for \(const item of library\)/);
  });

  it("only generates rows for serial-tracked natures", () => {
    const helper = ops.slice(ops.indexOf("async function generateEquipmentForVessel("));
    expect(helper.slice(0, 1600)).toContain("opsSerialTrackedTypes.includes");
  });

  it("is idempotent: existing serial numbers are skipped, not duplicated", () => {
    const helper = ops.slice(ops.indexOf("async function generateEquipmentForVessel("), ops.indexOf("// ═══", ops.indexOf("async function generateEquipmentForVessel(")));
    expect(helper).toContain("const taken = new Set(existing.map(a => a.serialNumber))");
    expect(helper).toContain("if (taken.has(serial))");
    expect(helper).toContain("skipped++");
  });

  it("creates equipment as Not Supplied until the first exchange", () => {
    const helper = ops.slice(ops.indexOf("async function generateEquipmentForVessel("));
    expect(helper.slice(0, 1600)).toContain('status: "Not Supplied"');
  });

  it("runs generation for vessels attached at contract creation time", () => {
    const create = ops.slice(ops.indexOf('notes: "Added at contract creation"'));
    expect(create.slice(0, 300)).toContain("generateEquipmentForVessel(id, vesselId)");
  });

  it("exposes an explicit generateEquipment procedure accepting an optional vessel", () => {
    expect(ops).toContain("generateEquipment: protectedProcedure");
    const proc = ops.slice(ops.indexOf("generateEquipment: protectedProcedure"));
    expect(proc.slice(0, 400)).toContain("vesselId: z.number().optional()");
    expect(proc.slice(0, 1200)).toContain("Add a vessel to the contract first");
  });

  it("reports created and skipped counts back to the caller", () => {
    const proc = ops.slice(ops.indexOf("generateEquipment: protectedProcedure"));
    expect(proc.slice(0, 1600)).toContain("return { created, skipped, vessels: targets.length }");
  });

  it("wires the action into the Vessels card, fleet-wide and per vessel", () => {
    expect(detail).toContain("trpc.opsContracts.generateEquipment.useMutation");
    expect(detail).toContain("Generate Equipment");
    expect(detail).toContain("generateEquipment.mutate({ contractId })");
    expect(detail).toContain("generateEquipment.mutate({ contractId, vesselId: a.vesselId })");
  });

  it("disables the fleet-wide action when the contract has no vessels", () => {
    const card = detail.slice(detail.indexOf("Generate Equipment") - 600, detail.indexOf("Generate Equipment"));
    expect(card).toContain("disabled={assignments.length === 0 || generateEquipment.isPending}");
  });

  it("tells the user when nothing needed creating", () => {
    expect(detail).toContain("Equipment already up to date for this contract");
  });
});
