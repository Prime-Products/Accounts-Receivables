import { describe, it, expect } from "vitest";
import { isSettledInvoice, hideSettled, countSettled } from "../client/src/lib/invoiceFilters";

const open = { status: "Open", amount: "1000", paidAmount: "0" };
const partial = { status: "Partially Paid", amount: "2000", paidAmount: "500" };
const paid = { status: "Paid", amount: "300", paidAmount: "300" };
// Marked Open in the ERP but fully covered by receipts — still settled in practice.
const fullyReceipted = { status: "Open", amount: "800", paidAmount: "800" };
const roundingRemainder = { status: "Open", amount: "100.00", paidAmount: "99.999" };

describe("isSettledInvoice", () => {
  it("treats status Paid as settled", () => {
    expect(isSettledInvoice(paid)).toBe(true);
  });
  it("treats a fully receipted invoice as settled even if the status lags behind", () => {
    expect(isSettledInvoice(fullyReceipted)).toBe(true);
  });
  it("treats sub-cent remainders as settled", () => {
    expect(isSettledInvoice(roundingRemainder)).toBe(true);
  });
  it("keeps open and partially paid invoices unsettled", () => {
    expect(isSettledInvoice(open)).toBe(false);
    expect(isSettledInvoice(partial)).toBe(false);
  });
});

describe("hideSettled", () => {
  it("hides settled invoices by default", () => {
    expect(hideSettled(paid, false, "all")).toBe(true);
    expect(hideSettled(fullyReceipted, false, "all")).toBe(true);
  });
  it("never hides invoices that still owe money", () => {
    expect(hideSettled(open, false, "all")).toBe(false);
    expect(hideSettled(partial, false, "all")).toBe(false);
  });
  it("shows settled invoices when the toggle is on", () => {
    expect(hideSettled(paid, true, "all")).toBe(false);
  });
  it("shows settled invoices when the status filter explicitly asks for Paid", () => {
    expect(hideSettled(paid, false, "Paid")).toBe(false);
  });
});

describe("countSettled", () => {
  it("counts only the settled rows", () => {
    expect(countSettled([open, partial, paid, fullyReceipted, roundingRemainder])).toBe(3);
  });
  it("returns zero for an all-open list", () => {
    expect(countSettled([open, partial])).toBe(0);
  });
});

describe("list totals with settled rows hidden", () => {
  const list = [open, partial, paid, fullyReceipted];
  it("the visible list only contains what is still collectable", () => {
    const visible = list.filter(i => !hideSettled(i, false, "all"));
    expect(visible).toHaveLength(2);
    const outstanding = visible.reduce((s, i) => s + (Number(i.amount) - Number(i.paidAmount)), 0);
    expect(outstanding).toBeCloseTo(1000 + 1500, 2);
  });
  it("turning the toggle on restores every row but not the outstanding total", () => {
    const visible = list.filter(i => !hideSettled(i, true, "all"));
    expect(visible).toHaveLength(4);
    const outstanding = visible.reduce((s, i) => {
      const raw = Number(i.amount) - Number(i.paidAmount);
      return s + (raw > 0.005 ? raw : 0);
    }, 0);
    expect(outstanding).toBeCloseTo(2500, 2);
  });
});
