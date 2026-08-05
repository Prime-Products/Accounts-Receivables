import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("server reports how many contracts each vessel is on", () => {
  const src = read("server/routers/ar.ts");

  it("loads every vessel assignment alongside the vessel stats", () => {
    expect(src).toContain("opsDb.listVesselAssignments()");
  });

  it("counts contracts distinctly so a repeated assignment is not double-counted", () => {
    expect(src).toContain("const contractIdsByVessel = new Map<number, Set<number>>()");
    expect(src).toContain("set.add(a.contractId)");
    expect(src).toContain("contractCount: contractIdsByVessel.get(v.id)?.size ?? 0");
  });

  it("returns the enrolled contracts on the vessel card", () => {
    expect(src).toContain("contracts: vesselContractIds.map(cid =>");
    expect(src).toContain("contractNumber: c?.contractNumber ?? null");
    expect(src).toContain("status: c?.status ?? null");
  });
});

describe("vessel card states its contract enrolment", () => {
  const src = read("client/src/components/VesselDetailDialog.tsx");

  it("reads the contracts off the vessel detail payload", () => {
    expect(src).toContain("const contracts = data?.contracts ?? []");
  });

  it("shows a contract-count badge in the header, pluralised", () => {
    expect(src).toContain('{contracts.length} contract{contracts.length === 1 ? "" : "s"}');
  });

  it("lists each contract number as a link to the contract", () => {
    expect(src).toContain("Prime 247 contracts ({contracts.length})");
    expect(src).toContain("href={`/ops/contracts/${c.id}`}");
    expect(src).toContain("{c.contractNumber ?? `#${c.id}`}");
  });

  it("explains the empty case instead of showing a bare zero", () => {
    expect(src).toContain("Not enrolled in any contract yet.");
  });
});

describe("vessels list has a contracts column", () => {
  const src = read("client/src/pages/Vessels.tsx");

  it("adds a sortable Contracts column", () => {
    expect(src).toContain('<SortableHead label="Contracts" k="contractCount" align="right" />');
    expect(src).toContain('| "contractCount"');
  });

  it("sorts the column highest-first on the first click", () => {
    expect(src).toContain('const descFirst: SortKey[] = ["openBalance", "overdueAmount", "invoiceCount", "contractCount"]');
  });

  it("gives the column a resizable default width", () => {
    expect(src).toContain("contractCount: 100");
  });

  it("renders a dash rather than a zero for vessels with no contract", () => {
    expect(src).toContain("v.contractCount > 0 ?");
    expect(src).toContain('<span className="text-muted-foreground">—</span>');
  });

  it("summarises how many listed vessels are on contract", () => {
    expect(src).toContain("onContract: src.filter(v => v.contractCount > 0).length");
    expect(src).toContain("{totals.onContract} on contract");
  });
});
