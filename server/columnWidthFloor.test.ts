import { describe, expect, it } from "vitest";

/**
 * Column widths are persisted per user in localStorage. A width saved before a
 * column's content grew (the Status cell now carries a primary badge plus the
 * Disputed badge) would clip or squeeze that content, so `useResizableColumns`
 * accepts a per-column floor that a saved value can never undercut.
 *
 * The hook itself is React/DOM bound; the arithmetic it applies is reproduced
 * here so the rule is pinned by a test.
 */
function effectiveWidth(
  saved: Record<string, number>,
  defaults: Record<string, number>,
  minWidths: Record<string, number>,
  col: string,
): number {
  const widths = { ...defaults, ...saved };
  const floor = minWidths[col];
  return floor != null ? Math.max(widths[col] ?? floor, floor) : widths[col];
}

const defaults = { invoiceNumber: 110, status: 175, amount: 110 };
const mins = { status: 150 };

describe("resizable column width floor", () => {
  it("raises a stale narrow saved width up to the floor", () => {
    expect(effectiveWidth({ status: 70 }, defaults, mins, "status")).toBe(150);
  });

  it("keeps a saved width that is wider than the floor", () => {
    expect(effectiveWidth({ status: 240 }, defaults, mins, "status")).toBe(240);
  });

  it("uses the default when nothing was saved", () => {
    expect(effectiveWidth({}, defaults, mins, "status")).toBe(175);
  });

  it("leaves columns without a floor untouched", () => {
    expect(effectiveWidth({ amount: 60 }, defaults, mins, "amount")).toBe(60);
  });
});
