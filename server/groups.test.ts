import { describe, expect, it } from "vitest";
import { computeAging, isOpenInvoice, outstanding, outstandingOriginal, type InvoiceLike } from "./lib/arLogic";

type Inv = InvoiceLike & { customerId: number };

const now = Date.UTC(2026, 6, 23);
const day = 24 * 60 * 60 * 1000;

const invoices: Inv[] = [
  { customerId: 1, dueDate: now - 40 * day, amount: "1000", paidAmount: "0", status: "Open", currency: "EUR", amountEur: null, company: "Prime Products LTD" },
  { customerId: 1, dueDate: now + 10 * day, amount: "500", paidAmount: "0", status: "Open", currency: "USD", amountEur: "460", company: "Prime Products USA INC" },
  { customerId: 2, dueDate: now - 5 * day, amount: "2000", paidAmount: "500", status: "Partially Paid", currency: "EUR", amountEur: null, company: "Prime Products LTD" },
  { customerId: 3, dueDate: now - 100 * day, amount: "300", paidAmount: "300", status: "Paid", currency: "EUR", amountEur: null, company: "Prime Products LTD" },
];

/** Mirror of the groupDetail scoping filter. */
function scope(list: Inv[], customerId?: number, branch?: string) {
  return list.filter(
    i => (customerId === undefined || i.customerId === customerId) && (branch === undefined || i.company === branch),
  );
}

describe("group scoping", () => {
  it("whole group aggregates across all member companies", () => {
    const open = scope(invoices).filter(isOpenInvoice);
    expect(open).toHaveLength(3);
    const total = open.reduce((s, i) => s + outstanding(i), 0);
    expect(total).toBeCloseTo(1000 + 460 + 1500, 2);
  });

  it("company filter re-scopes totals to that company only", () => {
    const open = scope(invoices, 2).filter(isOpenInvoice);
    expect(open).toHaveLength(1);
    expect(open.reduce((s, i) => s + outstanding(i), 0)).toBeCloseTo(1500, 2);
  });

  it("branch filter re-scopes to that branch only", () => {
    const open = scope(invoices, undefined, "Prime Products USA INC").filter(isOpenInvoice);
    expect(open).toHaveLength(1);
    expect(open[0].currency).toBe("USD");
    expect(outstandingOriginal(open[0])).toBe(500);
  });

  it("company + branch filters combine (AND)", () => {
    const open = scope(invoices, 1, "Prime Products LTD").filter(isOpenInvoice);
    expect(open).toHaveLength(1);
    expect(outstanding(open[0])).toBe(1000);
  });

  it("aging of scoped invoices matches the scope", () => {
    const aging = computeAging(scope(invoices, 1), now);
    expect(aging.buckets["31-60"].amount).toBeCloseTo(1000, 2);
    expect(aging.current).toBeCloseTo(460, 2);
  });
});
