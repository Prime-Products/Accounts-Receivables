import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isSuppliedStatus, supplyState, supplyStateLabels } from "../shared/supplyState";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("supply state helper", () => {
  it("counts a unit as supplied once it has left the warehouse", () => {
    expect(isSuppliedStatus("Not Supplied")).toBe(false);
    for (const s of ["In Transit", "Active", "Pending Return", "Returned"]) {
      expect(isSuppliedStatus(s)).toBe(true);
    }
  });

  it("reads a line as supplied, partial or not supplied", () => {
    expect(supplyState(4, 4)).toBe("supplied");
    expect(supplyState(1, 4)).toBe("partial");
    expect(supplyState(0, 4)).toBe("not-supplied");
  });

  it("has no state when the line tracks nothing", () => {
    expect(supplyState(0, 0)).toBeNull();
  });

  it("labels every state", () => {
    expect(supplyStateLabels.supplied).toBe("Supplied");
    expect(supplyStateLabels.partial).toBe("Partially supplied");
    expect(supplyStateLabels["not-supplied"]).toBe("Not supplied");
  });
});

describe("SupplyBadge component", () => {
  const page = read("client/src/components/SupplyBadge.tsx");

  it("derives its wording and colour from the shared helper", () => {
    expect(page).toContain('from "@shared/supplyState"');
    expect(page).toContain("supplyState(supplied, total)");
    expect(page).toContain("supplyStateLabels[state]");
    expect(page).toContain("supplyStateClasses[state]");
  });

  it("renders a dash when there is nothing to track", () => {
    expect(page).toContain('if (!state) return <span className="text-muted-foreground text-sm">—</span>');
  });

  it("appends the count only while the line is incomplete", () => {
    expect(page).toContain('showCount && state !== "supplied"');
  });

  it("explains what is still owed in the tooltip", () => {
    expect(page).toContain("still to deliver");
  });
});

describe("vessel page badges every item line", () => {
  const page = read("client/src/pages/VesselDetail.tsx");

  it("uses the shared badge instead of inline badge markup", () => {
    expect(page).toContain('import { SupplyBadge } from "@/components/SupplyBadge"');
    expect(page).toContain("<SupplyBadge supplied={item.unitsSupplied} total={item.unitsExpected} />");
    expect(page).not.toContain("Not Supplied</Badge>");
  });

  it("summarises the vessel's outstanding units in the card header", () => {
    expect(page).toContain("of {unitsTotal} unit(s) supplied");
    expect(page).toContain("line(s) still to deliver");
  });

  it("counts units from the expected quantity, so consumables are included", () => {
    expect(page).toContain("contractItems.reduce((s, i) => s + i.unitsExpected, 0)");
  });
});

describe("vessels.detail exposes an expected-unit count per line", () => {
  const router = read("server/routers/ar.ts");

  it("uses the shared supplied-status helper", () => {
    expect(router).toContain('import { isSuppliedStatus } from "../../shared/supplyState"');
    expect(router).toContain("units.filter(u => isSuppliedStatus(String(u.status)))");
  });

  it("falls back to the agreed quantity for non serial-tracked lines", () => {
    expect(router).toContain("const unitsExpected = serialTracked ? units.length : item.quantity");
    expect(router).toContain("unitsExpected,");
  });
});

describe("contract exposes the fleet-wide supply picture", () => {
  const router = read("server/routers/operations.ts");

  it("builds one supply line per product with fleet entitlement", () => {
    expect(router).toContain("const supplyLines = library.map(item =>");
    expect(router).toContain("item.quantity * Math.max(vesselCount, 1)");
    expect(router).toContain("outstanding: Math.max(expected - supplied, 0)");
  });

  it("breaks each line down per vessel", () => {
    expect(router).toContain("byVessel: assignments.map(a =>");
    expect(router).toContain("vesselName: vessels.find(v => v.id === a.vesselId)?.name");
  });

  it("totals what is still to deliver across the fleet", () => {
    expect(router).toContain("unitsOutstanding: supplyLines.reduce((s, l) => s + l.outstanding, 0)");
    expect(router).toContain("linesOutstanding: supplyLines.filter(l => l.outstanding > 0).length");
    expect(router).toContain("vesselsOutstanding:");
  });

  it("returns both the lines and the summary", () => {
    expect(router).toMatch(/supplyLines,\s*\n\s*supplySummary,/);
  });
});

describe("contract Supply tab", () => {
  const page = read("client/src/pages/ops/OpsContractDetail.tsx");

  it("adds a Supply tab showing how much is left", () => {
    expect(page).toContain('<TabsTrigger value="supply">');
    expect(page).toContain("supplySummary.unitsOutstanding > 0 ? ` (${supplySummary.unitsOutstanding} left)` : \"\"");
    expect(page).toContain('<TabsContent value="supply"');
  });

  it("reads the supply data from the contract query", () => {
    expect(page).toContain("supplyLines, supplySummary } = data");
  });

  it("groups supply lines with the same nature ordering as the product list", () => {
    expect(page).toContain("groupContractProducts(supplyLines)");
    expect(page).toContain("supplyLines.filter(l => l.outstanding > 0)");
  });

  it("shows fleet totals for supplied and outstanding units", () => {
    expect(page).toContain("Still to deliver");
    expect(page).toContain("Units supplied");
    expect(page).toContain("Vessels awaiting delivery");
  });

  it("can narrow the list to open lines only", () => {
    expect(page).toContain("const [onlyOutstanding, setOnlyOutstanding] = useState(false)");
    expect(page).toContain("Show only outstanding");
  });

  it("expands a line into its per-vessel breakdown", () => {
    expect(page).toContain("const [expandedLine, setExpandedLine] = useState<number | null>(null)");
    expect(page).toContain("line.byVessel.map(v =>");
    expect(page).toContain("<SupplyBadge supplied={v.supplied} total={v.expected} showCount={false} />");
  });
});
