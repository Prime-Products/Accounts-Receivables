/**
 * Two modules were retired on 4 Aug 2026 at the user's request:
 *   1. The legacy CRM "Contracts" page (/contracts) — superseded by Prime 247 contracts.
 *   2. The standalone "Returns" page (/ops/returns) — serial-tracked instruments are
 *      now managed entirely from Equipment.
 * These tests exist so neither page creeps back in as a dead link or an orphan route,
 * and so the return workflow that moved into Equipment stays intact.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("legacy CRM Contracts is fully retired", () => {
  it("the page file no longer exists", () => {
    expect(existsSync(join(root, "client/src/pages/Contracts.tsx"))).toBe(false);
  });

  it("App.tsx has no /contracts route and no lazy import for it", () => {
    const src = read("client/src/App.tsx");
    expect(src).not.toContain('path={"/contracts"}');
    expect(src).not.toContain('import("./pages/Contracts")');
  });

  it("the CRM sidebar section no longer links to /contracts", () => {
    const src = read("client/src/components/DashboardLayout.tsx");
    expect(src).not.toContain('path: "/contracts"');
  });

  it("the Prime 247 contracts entry survives, so contracts are still reachable", () => {
    const src = read("client/src/components/DashboardLayout.tsx");
    expect(src).toContain('path: "/ops/contracts"');
  });
});

describe("Returns is retired into Equipment", () => {
  it("the Returns page file no longer exists", () => {
    expect(existsSync(join(root, "client/src/pages/ops/OpsReturns.tsx"))).toBe(false);
  });

  it("App.tsx has no /ops/returns route and no lazy import for it", () => {
    const src = read("client/src/App.tsx");
    expect(src).not.toContain('path={"/ops/returns"}');
    expect(src).not.toContain('import("./pages/ops/OpsReturns")');
  });

  it("the Prime 247 sidebar no longer lists Returns", () => {
    const src = read("client/src/components/DashboardLayout.tsx");
    expect(src).not.toContain('label: "Returns"');
    expect(src).not.toContain('path: "/ops/returns"');
  });

  it("the Overview Pending Returns card links to Equipment filtered by Pending Return", () => {
    const src = read("client/src/pages/ops/OpsDashboard.tsx");
    expect(src).not.toContain('navigate("/ops/returns")');
    expect(src).toContain('navigate("/ops/assets?status=Pending+Return")');
  });
});

describe("Equipment carries the return workflow", () => {
  const src = read("client/src/pages/ops/OpsAssets.tsx");

  it("seeds its status filter from the ?status= query param", () => {
    expect(src).toContain("useSearch");
    expect(src).toContain('new URLSearchParams(window.location.search).get("status")');
  });

  it("only accepts status values that exist in the asset status enum", () => {
    expect(src).toContain("(ASSET_STATUSES as readonly string[]).includes(p)");
  });

  it("offers a Mark Returned action for units pending return", () => {
    expect(src).toContain('status: "Returned"');
    expect(src).toContain('a.status === "Pending Return"');
  });

  it("lets an active unit be moved into Pending Return", () => {
    expect(src).toContain('status: "Pending Return"');
    expect(src).toContain("Request return");
  });

  it("allows the collection port to be edited inline", () => {
    expect(src).toContain("portDraft");
    expect(src).toContain("targetReturnPort: portDraft.value.trim() || null");
  });

  it("shows a returns-specific empty state when filtered to Pending Return", () => {
    expect(src).toContain("Nothing awaiting collection");
  });
});
