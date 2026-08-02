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

/**
 * The button sits next to Payments and Credit notes, so a collector expects it to
 * read the same way: the number is always in the label, it is disabled when the
 * scope has none, and it says so when other filters keep the rows off screen.
 */
describe("installments toggle count and disabled state", () => {
  const src = readFileSync(new URL("../client/src/components/InstallmentToggle.tsx", import.meta.url), "utf8");

  it("prints the count in the label when one is supplied", () => {
    expect(src).toContain("Installments{known ? ` (${count})` : \"\"}");
  });

  it("disables itself when the scope contains no contract installments", () => {
    expect(src).toContain("const empty = known && count === 0");
    expect(src).toContain("disabled={empty}");
    expect(src).toContain("No contract installments in this scope");
  });

  it("warns when installments exist but other filters hide them", () => {
    expect(src).toContain("const hiding = known && !active && count > 0 && hiddenCount > 0");
    expect(src).toContain("Some installments are hidden by the current filters");
    expect(src).toMatch(/hiding &&[\s\S]*?>hidden</);
  });

  it("stays a plain toggle when no count is provided", () => {
    expect(src).toContain("count?: number");
    expect(src).toContain('const known = typeof count === "number"');
  });

  it("is fed a count and a hidden count by every invoice list", () => {
    for (const page of ["Invoices", "CustomerDetail", "GroupDetail"]) {
      const pageSrc = readFileSync(new URL(`../client/src/pages/${page}.tsx`, import.meta.url), "utf8");
      const block = pageSrc.slice(pageSrc.indexOf("<InstallmentToggle"));
      expect(block).toContain("count={");
      expect(block).toContain("hiddenCount={");
    }
  });

  it("counts installments from the loaded invoices on both cards", () => {
    const group = readFileSync(new URL("../client/src/pages/GroupDetail.tsx", import.meta.url), "utf8");
    expect(group).toContain("const installmentCounts = useMemo(");
    expect(group).toContain("rows.filter(i => i.isContractInstallment)");
    const company = readFileSync(new URL("../client/src/pages/CustomerDetail.tsx", import.meta.url), "utf8");
    expect(company).toContain("const allInstallmentInvoices = invoices.filter(i => (i as any).isContractInstallment)");
    expect(company).toContain("const installmentHiddenCount");
  });

  it("leaves the exclusive credit/payment views when installments are selected", () => {
    for (const page of ["CustomerDetail", "GroupDetail"]) {
      const pageSrc = readFileSync(new URL(`../client/src/pages/${page}.tsx`, import.meta.url), "utf8");
      const start = pageSrc.indexOf("<InstallmentToggle");
      const block = pageSrc.slice(start, start + 700);
      expect(block).toContain("setCreditOnly(false)");
      expect(block).toContain("setPaymentsOnly(false)");
    }
  });
});
