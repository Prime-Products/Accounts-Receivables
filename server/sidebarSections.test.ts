/**
 * Sidebar structure — the navigation is grouped into Collections / CRM /
 * Management with Dashboard standing alone. This test reads the layout source so
 * a future edit cannot silently drop a destination or orphan a page: every route
 * registered in App.tsx must be reachable from the sidebar (or be an explicitly
 * allowed detail/nested route).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const root = join(__dirname, "..");
const layout = readFileSync(join(root, "client/src/components/DashboardLayout.tsx"), "utf-8");
const app = readFileSync(join(root, "client/src/App.tsx"), "utf-8");

/** Section label -> the item labels that must sit under it, in order. */
const EXPECTED_SECTIONS: [string, string[]][] = [
  ["Collections", ["Collections Desk", "Invoices", "Wire Transfers"]],
  ["CRM", ["Address Book", "Vessels", "Contracts"]],
  ["Management", ["Reports", "Tasks", "Team", "Settings"]],
];

describe("Sidebar sections", () => {
  it("declares the three sections in order, with Dashboard ungrouped first", () => {
    const dashboardAt = layout.indexOf('label: "Dashboard"');
    expect(dashboardAt).toBeGreaterThan(-1);
    let cursor = dashboardAt;
    for (const [section] of EXPECTED_SECTIONS) {
      const at = layout.indexOf(`label: "${section}"`, cursor);
      expect(at, `section ${section} missing or out of order`).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  it("places each destination under its section", () => {
    for (const [section, items] of EXPECTED_SECTIONS) {
      const start = layout.indexOf(`label: "${section}"`);
      // The section ends where the next section label begins (or at the array end).
      const nextLabels = EXPECTED_SECTIONS.map(([s]) => layout.indexOf(`label: "${s}"`)).filter(
        i => i > start,
      );
      const end = nextLabels.length ? Math.min(...nextLabels) : layout.length;
      const block = layout.slice(start, end);
      for (const item of items) {
        expect(block, `${item} should live under ${section}`).toContain(`label: "${item}"`);
      }
    }
  });

  it("leaves no top-level page unreachable from the sidebar", () => {
    // Routes that are intentionally not in the sidebar: detail views reached by
    // clicking a row, and the catch-all.
    const allowedWithoutNav = ["/customers/", "/groups/", "/vessels/", "/contracts/", "/invoices/"];
    const routePaths = Array.from(app.matchAll(/<Route\s+path="([^"]+)"/g)).map(m => m[1]);
    const navPaths = Array.from(layout.matchAll(/path:\s*"([^"]+)"/g)).map(m => m[1]);
    const unreachable = routePaths.filter(p => {
      if (p === "/" || p.includes(":")) return false;
      if (navPaths.includes(p)) return false;
      return !allowedWithoutNav.some(prefix => p.startsWith(prefix));
    });
    expect(unreachable).toEqual([]);
  });

  it("makes each section header a real toggle control", () => {
    // A button, not a bare label — so it is clickable and keyboard reachable.
    expect(layout).toMatch(/aria-expanded=\{isOpen\}/);
    expect(layout).toContain("toggleSection(section.label!)");
    // Chevron indicating open/closed state.
    expect(layout).toContain("ChevronDown");
    expect(layout).toMatch(/-rotate-90/);
  });

  it("never hides the section holding the current page, and keeps state across reloads", () => {
    // The active section stays open regardless of the stored preference.
    expect(layout).toContain("holdsCurrentPage");
    expect(layout).toMatch(/isCollapsed \|\| holdsCurrentPage/);
    // Preference is persisted.
    expect(layout).toContain("SIDEBAR_SECTIONS_KEY");
    expect(layout).toMatch(/localStorage\.setItem\(SIDEBAR_SECTIONS_KEY/);
  });
});
