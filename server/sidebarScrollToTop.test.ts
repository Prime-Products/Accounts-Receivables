import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

/*
 * User request: "when I scroll down on Collections Desk, clicking Collections Desk
 * in the menu again should take me back to the top" — and the same for every menu
 * button. Wouter keeps the window scroll position on navigation, so both cases
 * (same route, different route) need an explicit reset.
 */
describe("sidebar menu — every entry returns you to the top of the page", () => {
  const layout = read("client/src/components/DashboardLayout.tsx");

  it("scrolls to the top on every menu click, not only when the route changes", () => {
    const handler = layout.slice(
      layout.indexOf("const handleClick = () => {"),
      layout.indexOf("return ("
        , layout.indexOf("const handleClick = () => {")),
    );
    expect(handler).toContain("scrollPageToTop()");
    // The navigation itself is skipped when we are already on that page…
    expect(handler).toMatch(/if \(!isActive\) setLocation\(item\.path\)/);
    // …but the scroll reset is unconditional, so it also applies to the active item.
    expect(handler).not.toMatch(/if \([^)]*\)\s*scrollPageToTop/);
  });

  it("wires the single shared handler into the menu button (so it covers all entries)", () => {
    // One handler used by the .map over every section item = all menu buttons.
    expect(layout).toMatch(/onClick=\{handleClick\}/);
    expect(layout).toMatch(/section\.items\.map\(item =>/);
    expect(layout.match(/onClick=\{\(\) => setLocation\(item\.path\)\}/g)).toBeNull();
  });

  it("closes the mobile drawer so the page is visible after the jump", () => {
    expect(layout).toContain("if (sidebarIsMobile) setOpenMobile(false)");
  });

  it("resets the window and any inner scroll container, respecting reduced motion", () => {
    const helper = read("client/src/lib/scrollToTop.ts");
    expect(helper).toContain("window.scrollTo({ top: 0, behavior })");
    expect(helper).toContain("document.documentElement.scrollTop = 0");
    expect(helper).toMatch(/prefers-reduced-motion: reduce/);
    expect(helper).toMatch(/querySelector\("main/);
  });

  it("also resets the scroll for the other in-app jumps (global search, mentions)", () => {
    expect(read("client/src/components/GlobalSearch.tsx")).toContain("scrollPageToTop()");
    expect(read("client/src/components/MentionsInbox.tsx")).toContain("scrollPageToTop()");
  });
});
