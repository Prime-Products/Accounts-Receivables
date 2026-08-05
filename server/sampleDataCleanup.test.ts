import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const root = join(__dirname, "..");
const opsDbSrc = readFileSync(join(root, "server/opsDb.ts"), "utf8");
const routerSrc = readFileSync(join(root, "server/routers/operations.ts"), "utf8");
const listSrc = readFileSync(join(root, "client/src/pages/ops/OpsContractsList.tsx"), "utf8");

describe("sample data marker", () => {
  it("marks sample contracts with a dedicated number prefix", () => {
    expect(opsDbSrc).toMatch(/SAMPLE_CONTRACT_PREFIX = "DEMO-"/);
  });

  it("selects sample contracts by that prefix rather than by id", () => {
    const listFn = opsDbSrc.slice(opsDbSrc.indexOf("export async function listSampleContracts"));
    expect(listFn).toContain("LIKE");
    expect(listFn).toContain("SAMPLE_CONTRACT_PREFIX");
  });
});

describe("purgeSampleContracts", () => {
  // The purge delegates to the shared cascade helper, so the guarantees live there.
  const cascadeStart = opsDbSrc.indexOf("export async function deleteContractsCascade");
  const fn = opsDbSrc.slice(cascadeStart, opsDbSrc.indexOf("// CONTRACT LIBRARY", cascadeStart));

  it("delegates the sample purge to the shared cascade helper", () => {
    const purge = opsDbSrc.slice(opsDbSrc.indexOf("export async function purgeSampleContracts"));
    expect(purge.slice(0, 300)).toContain("deleteContractsCascade");
  });

  it("returns a zeroed summary when nothing is seeded, without touching any table", () => {
    const guard = fn.slice(0, fn.indexOf("const conn"));
    expect(guard).toContain("if (contractIds.length === 0)");
    expect(guard).toContain("contracts: 0");
    expect(guard).not.toContain(".delete(");
  });

  it("deletes dependents before the contracts themselves", () => {
    const order = [
      "delete(opsCertificates)",
      "delete(opsAssets)",
      "delete(opsConsumableOrders)",
      "delete(opsPaymentSchedule)",
      "delete(opsVesselAssignments)",
      "delete(opsContractLibrary)",
      "delete(opsContracts)",
    ].map(needle => ({ needle, at: fn.indexOf(needle) }));
    for (const step of order) expect(step.at, step.needle).toBeGreaterThan(-1);
    const positions = order.map(s => s.at);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("removes certificates via their asset ids, since certificates carry no contract id", () => {
    expect(fn).toMatch(/delete\(opsCertificates\)[\s\S]{0,80}assetIds/);
  });

  it("never deletes catalogue rows — the pricelist holds real product data", () => {
    expect(fn).not.toContain("delete(opsAssetCatalog)");
    expect(fn).not.toContain("delete(opsConsumableCatalog)");
  });

  it("reports how much was removed per entity so the UI can confirm it", () => {
    for (const field of ["contracts:", "vessels:", "products:", "equipment:", "certificates:", "installments:"]) {
      expect(fn).toContain(field);
    }
  });
});

describe("sample data procedures", () => {
  it("exposes a status query and a purge mutation on the contracts router", () => {
    expect(routerSrc).toContain("sampleDataStatus: protectedProcedure.query");
    expect(routerSrc).toContain("purgeSampleData: protectedProcedure.mutation");
  });

  it("returns the contract numbers so the confirmation can list them", () => {
    const status = routerSrc.slice(routerSrc.indexOf("sampleDataStatus"), routerSrc.indexOf("purgeSampleData"));
    expect(status).toContain("contractNumbers");
    expect(status).toContain("count");
  });
});

describe("contracts list cleanup control", () => {
  it("only offers the cleanup while sample contracts exist", () => {
    expect(listSrc).toMatch(/sampleStatus && sampleStatus\.count > 0/);
  });

  it("confirms before purging instead of deleting on first click", () => {
    const trigger = listSrc.slice(listSrc.indexOf("sampleStatus.count > 0"));
    const button = trigger.slice(0, trigger.indexOf("</Button>"));
    expect(button).toContain("setPurgeOpen(true)");
    expect(button).not.toContain("purgeSamples.mutate");
  });

  it("states in the dialog that the pricelist survives the purge", () => {
    const dialog = listSrc.slice(listSrc.indexOf("Remove sample contracts"));
    expect(dialog).toMatch(/pricelist/i);
    expect(dialog).toMatch(/cannot be undone/i);
  });

  it("refreshes contracts, vessels and equipment after a purge", () => {
    const mutation = listSrc.slice(listSrc.indexOf("purgeSampleData.useMutation"), listSrc.indexOf("onError: (err) => toast.error(err.message || \"Could not remove the sample data\")"));
    expect(mutation).toContain("utils.opsContracts.invalidate()");
    expect(mutation).toContain("utils.vessels.invalidate()");
    expect(mutation).toContain("utils.opsAssets.invalidate()");
  });
});
