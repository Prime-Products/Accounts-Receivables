import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const listSrc = readFileSync(join(__dirname, "..", "client/src/pages/ops/OpsContractsList.tsx"), "utf8");
const routerSrc = readFileSync(join(__dirname, "..", "server/routers/operations.ts"), "utf8");

/**
 * Fleet dashboard aggregation for the Prime 247 contracts list. Kept as a pure function
 * here so the arithmetic (agreed vs activated, pro-rata activated value, outstanding)
 * is pinned independently of the React page that renders it.
 */
type Row = {
  status: string;
  totalValue: number;
  vesselCount: number;
  activatedVesselCount: number;
  collectedAmount: number;
  totalInstallments: number;
  paidInstallments: number;
};

export function aggregateContractKpi(rows: Row[]) {
  const kpi = rows.reduce(
    (acc, c) => {
      const value = Number(c.totalValue) || 0;
      const perVessel = c.vesselCount > 0 ? value / c.vesselCount : 0;
      return {
        contracts: acc.contracts + 1,
        activeContracts: acc.activeContracts + (c.status === "Active" ? 1 : 0),
        agreedValue: acc.agreedValue + value,
        activatedValue: acc.activatedValue + perVessel * c.activatedVesselCount,
        agreedVessels: acc.agreedVessels + c.vesselCount,
        activatedVessels: acc.activatedVessels + c.activatedVesselCount,
        collected: acc.collected + c.collectedAmount,
        installments: acc.installments + c.totalInstallments,
        paidInstallments: acc.paidInstallments + c.paidInstallments,
      };
    },
    {
      contracts: 0, activeContracts: 0, agreedValue: 0, activatedValue: 0,
      agreedVessels: 0, activatedVessels: 0, collected: 0, installments: 0, paidInstallments: 0,
    },
  );
  return { ...kpi, outstanding: Math.max(kpi.activatedValue - kpi.collected, 0) };
}

const row = (over: Partial<Row> = {}): Row => ({
  status: "Active",
  totalValue: 30_000,
  vesselCount: 3,
  activatedVesselCount: 2,
  collectedAmount: 0,
  totalInstallments: 9,
  paidInstallments: 0,
  ...over,
});

describe("contracts list KPI dashboard", () => {
  it("separates agreed value from the shipped (activated) share", () => {
    const k = aggregateContractKpi([row()]);
    expect(k.agreedValue).toBe(30_000);
    // 2 of 3 vessels shipped → two thirds of the contract value is commercially live.
    expect(k.activatedValue).toBe(20_000);
  });

  it("counts agreed and activated vessels across contracts", () => {
    const k = aggregateContractKpi([
      row({ vesselCount: 3, activatedVesselCount: 2 }),
      row({ vesselCount: 5, activatedVesselCount: 0, status: "Offer" }),
    ]);
    expect(k.agreedVessels).toBe(8);
    expect(k.activatedVessels).toBe(2);
    expect(k.contracts).toBe(2);
    expect(k.activeContracts).toBe(1);
  });

  it("treats an offer with no shipments as zero activated value", () => {
    const k = aggregateContractKpi([row({ status: "Offer", activatedVesselCount: 0 })]);
    expect(k.activatedValue).toBe(0);
    expect(k.outstanding).toBe(0);
  });

  it("derives outstanding from activated value minus collected", () => {
    const k = aggregateContractKpi([row({ collectedAmount: 5_000 })]);
    expect(k.collected).toBe(5_000);
    expect(k.outstanding).toBe(15_000);
  });

  it("never reports negative outstanding when collections run ahead", () => {
    const k = aggregateContractKpi([row({ collectedAmount: 25_000 })]);
    expect(k.outstanding).toBe(0);
  });

  it("survives contracts with no vessels assigned yet", () => {
    const k = aggregateContractKpi([row({ vesselCount: 0, activatedVesselCount: 0 })]);
    expect(k.agreedValue).toBe(30_000);
    expect(k.activatedValue).toBe(0);
    expect(k.agreedVessels).toBe(0);
  });

  it("totals installment progress for the Collected card", () => {
    const k = aggregateContractKpi([
      row({ totalInstallments: 9, paidInstallments: 3 }),
      row({ totalInstallments: 6, paidInstallments: 1 }),
    ]);
    expect(k.installments).toBe(15);
    expect(k.paidInstallments).toBe(4);
  });

  it("returns zeros for an empty (fully filtered) list", () => {
    const k = aggregateContractKpi([]);
    expect(k).toMatchObject({ contracts: 0, agreedValue: 0, activatedValue: 0, agreedVessels: 0, outstanding: 0 });
  });
});

describe("contracts list — column order", () => {
  const order = ["contractNumber", "customer", "title", "totalValue", "vessels", "status", "startDate", "endDate", "actions"];

  it("declares the columns in the requested order", () => {
    const defaults = listSrc.slice(listSrc.indexOf("const COL_DEFAULTS"), listSrc.indexOf("export default"));
    const declared = [...defaults.matchAll(/^\s{2}(\w+):/gm)].map(m => m[1]);
    expect(declared).toEqual(order);
  });

  it("renders the headers in that same order", () => {
    const header = listSrc.slice(listSrc.indexOf("<TableHeader>"), listSrc.indexOf("</TableHeader>"));
    const rendered = [...header.matchAll(/cols\.style\("(\w+)"\)/g)].map(m => m[1]);
    expect(rendered).toEqual(order);
  });

  it("drops the standalone Collected and Installments columns from the table", () => {
    const header = listSrc.slice(listSrc.indexOf("<TableHeader>"), listSrc.indexOf("</TableHeader>"));
    expect(header).not.toContain(">Collected<");
    expect(header).not.toContain(">Installments<");
  });
});

describe("contracts list — KPI cards", () => {
  it("shows agreed vs activated value and vessels, collected and outstanding", () => {
    for (const label of ["Agreed Value", "Activated Value", "Agreed Vessels", "Activated Vessels", "Collected", "Outstanding"]) {
      expect(listSrc).toContain(label);
    }
  });

  it("uses the same left-accent card styling as the contract detail KPIs", () => {
    expect(listSrc).toMatch(/border-l-4 border-l-\[oklch\(/);
  });

  it("reads the activated count supplied by the server", () => {
    expect(listSrc).toContain("activatedVesselCount");
    expect(routerSrc).toMatch(/activatedVesselCount:\s*contractVessels\.filter\(a => a\.shipmentDate != null\)\.length/);
  });
});
