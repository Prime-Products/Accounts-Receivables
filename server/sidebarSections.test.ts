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
  // Tasks sit with the daily chase: follow-ups, promises and help requests all
  // start from the Collections Desk.
  ["Collections", ["Collections Desk", "Invoices", "Remittances", "Tasks"]],
  ["CRM", ["Address Book", "Vessels", "Contracts"]],
  ["Management", ["Reports", "Team", "Settings"]],
];

describe("Sidebar sections", () => {
  it("repeats the Vessels shortcut inside Prime 247", () => {
    // The fleet is an entry point for contract work as often as the contract itself,
    // so /vessels is reachable from Prime 247 without jumping back up to CRM.
    const prime = layout.slice(layout.indexOf('label: "Prime 247"'), layout.indexOf('label: "Management"'));
    expect(prime).toMatch(/label: "Vessels", path: "\/vessels"/);
    const crm = layout.slice(layout.indexOf('label: "CRM"'), layout.indexOf('label: "Prime 247"'));
    expect(crm).toMatch(/label: "Vessels", path: "\/vessels"/);
    // A path living in two sections must not collide as a React key.
    expect(layout).toMatch(/key=\{`\$\{section\.label \?\? "root"\}-\$\{item\.path\}`\}/);
  });

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

  it("Tasks is listed once, under Collections", () => {
    const occurrences = layout.match(/label: "Tasks"/g) ?? [];
    expect(occurrences).toHaveLength(1);
    const collectionsAt = layout.indexOf('label: "Collections"');
    const crmAt = layout.indexOf('label: "CRM"');
    const tasksAt = layout.indexOf('label: "Tasks"');
    expect(tasksAt).toBeGreaterThan(collectionsAt);
    expect(tasksAt).toBeLessThan(crmAt);
  });

  it("leaves no top-level page unreachable from the sidebar", () => {
    // Routes that are intentionally not in the sidebar: detail views reached by
    // clicking a row, the catch-all, and legacy paths kept only as redirects.
    const allowedWithoutNav = ["/customers/", "/groups/", "/vessels/", "/contracts/", "/invoices/"];
    const legacyRedirects = ["/contacts", "/call-back", "/forecast", "/wire-transfers"];
    const routePaths = Array.from(app.matchAll(/<Route\s+path="([^"]+)"/g)).map(m => m[1]);
    const navPaths = Array.from(layout.matchAll(/path:\s*"([^"]+)"/g)).map(m => m[1]);
    const unreachable = routePaths.filter(p => {
      if (p === "/" || p.includes(":")) return false;
      if (navPaths.includes(p)) return false;
      if (legacyRedirects.includes(p)) return false;
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

  it("lets every section collapse, including the one holding the current page", () => {
    // Earlier the active section was force-opened, so clicking its header did
    // nothing and the control felt broken. Now the stored preference decides.
    expect(layout).toMatch(/const isOpen = !hasHeader \|\| openSections\.includes\(section\.label!\)/);
    expect(layout).not.toMatch(/isCollapsed \|\| holdsCurrentPage/);
  });

  it("keeps the active destination reachable inside a collapsed section", () => {
    // A closed section still renders its active row, and flags itself with a dot,
    // so you never lose sight of where you are.
    expect(layout).toMatch(/const hidden = !isOpen && !isActive/);
    expect(layout).toContain("!isOpen && holdsCurrentPage");
  });

  it("persists the open/closed preference across reloads", () => {
    expect(layout).toContain("SIDEBAR_SECTIONS_KEY");
    expect(layout).toMatch(/localStorage\.setItem\(SIDEBAR_SECTIONS_KEY/);
  });

  it("scrolls the nav instead of letting the footer cover the last entries", () => {
    // The footer used to sit on top of Reports/Team/Settings on a short screen.
    // Nav = the only scrolling region; footer is a shrink-0 sibling.
    expect(layout).toMatch(/<SidebarContent className="[^"]*overflow-y-auto/);
    expect(layout).toMatch(/<SidebarFooter className="[^"]*shrink-0/);
  });

  it("keeps the rows compact and separates the groups in icon-only mode", () => {
    // Rows were h-10 with loose gaps, which made the menu read as a long column.
    expect(layout).toContain('const NAV_ROW = "relative h-8');
    expect(layout).not.toMatch(/className=\{`h-10 transition-all font-normal`\}/);
    // No headers exist in the icon rail, so a hairline marks each group.
    expect(layout).toMatch(/SidebarSeparator[\s\S]{0,160}group-data-\[collapsible=icon\]:block/);
  });
});
