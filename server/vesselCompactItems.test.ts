import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("vessel entitlement reads as one compact list", () => {
  const src = read("client/src/pages/VesselDetail.tsx");

  it("collapses serial detail by default so all lines fit on one screen", () => {
    expect(src).toContain("const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())");
    expect(src).toContain("item.serials.length > 0 && expandedItems.has(itemKey(item))");
  });

  it("opens the serial table by clicking the product line", () => {
    expect(src).toContain("onClick={item.serials.length > 0 ? () => toggleItem(itemKey(item)) : undefined}");
    expect(src).toContain("toggleItem");
  });

  it("shows a chevron that rotates only where serial detail exists", () => {
    expect(src).toContain("ChevronRight");
    expect(src).toContain("rotate-90");
  });

  it("keeps the contract link clickable without toggling the row", () => {
    expect(src).toContain("onClick={e => e.stopPropagation()}");
  });

  it("states the serial count on the collapsed line", () => {
    expect(src).toContain("{item.serials.length} serial(s)");
  });

  it("reads the same product description as the contract card", () => {
    expect(src).toContain("{item.notes}");
    // The old wording that replaced the description is gone.
    expect(src).not.toContain("unit(s) tracked by serial number");
  });

  it("keeps one supply badge per line", () => {
    expect(src).toContain("<SupplyBadge supplied={item.unitsSupplied} total={item.unitsExpected} />");
  });

  it("keys expansion by contract and line so two contracts never collide", () => {
    expect(src).toContain("const itemKey = (item: { contractId: number | null; id: number }) => `${item.contractId}-${item.id}`");
  });
});

describe("vessel items carry the contract's product description", () => {
  const src = read("server/routers/ar.ts");

  it("returns the library notes on each vessel contract item", () => {
    expect(src).toContain("notes: item.notes ?? null");
  });
});
