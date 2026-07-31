import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The invoice scope selector is a single "Installments" button that toggles:
 * click → installments only, click again → all invoices.
 */
describe("installments toggle", () => {
  const src = readFileSync(new URL("../client/src/components/InstallmentToggle.tsx", import.meta.url), "utf8");

  it("renders one button, not a two-tab selector", () => {
    expect(src).toContain("<Button");
    expect(src).not.toContain("TabsTrigger");
    expect(src).not.toContain("All invoices<");
  });

  it("uses a single-word label", () => {
    expect(src).toContain("Installments");
    expect(src).not.toContain("Installments only");
  });

  it("flips the value on click in both directions", () => {
    expect(src).toContain('onChange(active ? "all" : "installments")');
    expect(src).toContain('const active = value === "installments"');
  });

  it("exposes the pressed state for accessibility and styles the active state", () => {
    expect(src).toContain("aria-pressed={active}");
    expect(src).toMatch(/active\s*\n?\s*\?\s*"bg-violet-50/);
  });

  it("keeps the same props so every invoice list can use it unchanged", () => {
    for (const page of ["Invoices", "CustomerDetail", "GroupDetail"]) {
      const pageSrc = readFileSync(new URL(`../client/src/pages/${page}.tsx`, import.meta.url), "utf8");
      expect(pageSrc).toContain("InstallmentToggle");
    }
    expect(src).toContain('value: "all" | "installments"');
  });
});
