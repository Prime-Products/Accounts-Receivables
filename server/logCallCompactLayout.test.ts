import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const dialog = readFileSync(join(root, "client/src/components/LogCallDialog.tsx"), "utf8");
const launcher = readFileSync(join(root, "client/src/components/LogCallLauncher.tsx"), "utf8");
const groupDetail = readFileSync(join(root, "client/src/pages/GroupDetail.tsx"), "utf8");

describe("Log Call dialog compact layout", () => {
  it("bounds the dialog height and lays it out as a flex column", () => {
    expect(dialog).toMatch(/max-h-\[88vh\]/);
    expect(dialog).toMatch(/flex flex-col/);
    expect(dialog).toMatch(/overflow-hidden/);
  });

  it("scrolls only the body so the footer stays pinned", () => {
    expect(dialog).toMatch(/flex-1 overflow-y-auto/);
    // header and footer must not scroll away
    const shrinkCount = (dialog.match(/shrink-0/g) ?? []).length;
    expect(shrinkCount).toBeGreaterThanOrEqual(2);
  });

  it("uses a two-column field grid to reduce height", () => {
    expect(dialog).toMatch(/sm:grid-cols-2/);
    // expanded response panels lay their fields out in three columns
    expect(dialog).toMatch(/sm:grid-cols-3/);
  });

  it("supports deep-linking the dialog and a preselected response", () => {
    expect(groupDetail).toMatch(/logCall/);
    expect(dialog).toMatch(/URLSearchParams\(window\.location\.search\)/);
    expect(dialog).toMatch(/get\("response"\)/);
    expect(launcher).toMatch(/has\("response"\)/);
  });

  it("does not render a duplicate notes textarea for the broken state", () => {
    const boundToNotes = (dialog.match(/value=\{notes\}/g) ?? []).length;
    expect(boundToNotes).toBe(1);
  });
});
