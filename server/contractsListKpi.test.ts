import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const listSrc = readFileSync(join(__dirname, "..", "client/src/pages/ops/OpsContractsList.tsx"), "utf8");
const routerSrc = readFileSync(join(__dirname, "..", "server/routers/operations.ts"), "utf8");

/**
 * Fleet dashboard aggregation for the Prime 247 contracts list. Kept as a pure function
 * here so the arithmetic (agreed vs activated, pro-rata activated value) is pinned
 * independently of the React page that renders it. Cash figures are deliberately not
 * part of this list — collections belong to the contract page and to Invoices.
 */
type Row = {
  status: string;
  totalValue: number;
  vesselCount: number;
  activatedVesselCount: number;
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
        currentValue: acc.currentValue + perVessel * c.activatedVesselCount,
        agreedVessels: acc.agreedVessels + c.vesselCount,
        activatedVessels: acc.activatedVessels + c.activatedVesselCount,
        pipelineVessels: acc.pipelineVessels + Math.max(c.vesselCount - c.activatedVesselCount, 0),
      };
    },
    {
      contracts: 0, activeContracts: 0, agreedValue: 0, currentValue: 0,
      agreedVessels: 0, activatedVessels: 0, pipelineVessels: 0,
    },
  );
  return kpi;
}

const row = (over: Partial<Row> = {}): Row => ({
  status: "Active",
  totalValue: 30_000,
  vesselCount: 3,
  activatedVesselCount: 2,
  ...over,
});

describe("contracts list KPI dashboard", () => {
  it("separates agreed value from the current (shipped) share", () => {
    const k = aggregateContractKpi([row()]);
    expect(k.agreedValue).toBe(30_000);
    // 2 of 3 vessels shipped → two thirds of the contract value is commercially live.
    expect(k.currentValue).toBe(20_000);
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

  it("treats an offer with no shipments as zero current value", () => {
    const k = aggregateContractKpi([row({ status: "Offer", activatedVesselCount: 0 })]);
    expect(k.currentValue).toBe(0);
    expect(k.pipelineVessels).toBe(3);
  });

  it("survives contracts with no vessels assigned yet", () => {
    const k = aggregateContractKpi([row({ vesselCount: 0, activatedVesselCount: 0 })]);
    expect(k.agreedValue).toBe(30_000);
    expect(k.currentValue).toBe(0);
    expect(k.agreedVessels).toBe(0);
  });

  it("counts the vessels still awaiting shipment", () => {
    const k = aggregateContractKpi([
      row({ vesselCount: 3, activatedVesselCount: 2 }),
      row({ vesselCount: 5, activatedVesselCount: 1 }),
    ]);
    expect(k.pipelineVessels).toBe(5);
  });

  it("returns zeros for an empty (fully filtered) list", () => {
    const k = aggregateContractKpi([]);
    expect(k).toMatchObject({ contracts: 0, agreedValue: 0, currentValue: 0, agreedVessels: 0, pipelineVessels: 0 });
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
  it("shows current against agreed for both value and vessels", () => {
    for (const label of ["Current / Agreed Value", "Active / Agreed Vessels", "of {fmtEur(kpi.agreedValue)} agreed"]) {
      expect(listSrc).toContain(label);
    }
  });

  it("keeps cash metrics off this page", () => {
    // Collected / Outstanding belong to the contract page and Invoices, not to the
    // contracts list, which is about scope and activation.
    expect(listSrc).not.toMatch(/CardTitle[^>]*>Collected</);
    expect(listSrc).not.toMatch(/CardTitle[^>]*>Outstanding</);
    expect(listSrc).not.toContain("installments paid");
    expect(listSrc).not.toContain("on active vessels");
  });

  it("uses the same left-accent card styling as the contract detail KPIs", () => {
    expect(listSrc).toMatch(/border-l-4 border-l-\[oklch\(/);
  });

  it("reads the activated count supplied by the server", () => {
    expect(listSrc).toContain("activatedVesselCount");
    expect(routerSrc).toMatch(/activatedVesselCount:\s*contractVessels\.filter\(a => a\.shipmentDate != null\)\.length/);
  });

  it("labels the money column Current Value and shows the activated amount, not the agreed total", () => {
    const header = listSrc.slice(listSrc.indexOf("<TableHeader>"), listSrc.indexOf("</TableHeader>"));
    expect(header).toMatch(/>Current Value <SortIcon col="totalValue"/);
    const body = listSrc.slice(listSrc.indexOf("<TableBody>"), listSrc.indexOf("</TableBody>"));
    expect(body).toContain("contractCurrentValue(c)");
    expect(body).not.toContain("fmtEur(Number(c.totalValue))}</TableCell>");
  });

  it("sorts the money column by current value rather than the agreed total", () => {
    expect(listSrc).toMatch(/sortKey === "totalValue"\) return \(contractCurrentValue\(a\) - contractCurrentValue\(b\)\)/);
  });
});

describe("contractCurrentValue helper", () => {
  it("prorates the agreed value over the activated vessels", async () => {
    const { contractCurrentValue } = await import("../client/src/pages/ops/OpsContractsList");
    expect(contractCurrentValue({ totalValue: 30_000, vesselCount: 3, activatedVesselCount: 2 })).toBe(20_000);
  });

  it("is zero when nothing has shipped or no vessels are assigned", async () => {
    const { contractCurrentValue } = await import("../client/src/pages/ops/OpsContractsList");
    expect(contractCurrentValue({ totalValue: 30_000, vesselCount: 3, activatedVesselCount: 0 })).toBe(0);
    expect(contractCurrentValue({ totalValue: 30_000, vesselCount: 0, activatedVesselCount: 0 })).toBe(0);
  });
});
