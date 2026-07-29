import { describe, expect, it } from "vitest";
import {
  normalizeSoftOneCurrencyName,
  normalizeSoftOneOpenInvoiceRows,
  softOneOpenInvoiceFinancialsQuery,
} from "./lib/softoneInvoices";

const row = {
  FINDOC: 1403582,
  TRDR: 10036,
  COMPANY: 1,
  SOCURRENCY: 999,
  ISSUE_DATE: 20260717,
  DUE_DATE: 20260831,
  ORIGINAL_AMOUNT: 100,
  OPEN_AMOUNT: 85.6,
};

describe("SoftOne open invoice sync", () => {
  it("normalizes identifiers, dates, amounts, and lookup values", () => {
    const [invoice] = normalizeSoftOneOpenInvoiceRows(
      [row],
      new Map([["1403582", "ΤΔΕΕ-19076"]]),
      new Map([["1", "Prime Products LTD"]]),
      new Map([["999", "EURO"]]),
      Date.UTC(2026, 6, 29),
    );
    expect(invoice).toMatchObject({
      customerSoftoneId: "10036",
      softoneId: "1403582",
      invoiceNumber: "ΤΔΕΕ-19076",
      company: "Prime Products LTD",
      currency: "EUR",
      amount: "100.00",
      paidAmount: "14.40",
      status: "Partially Paid",
    });
    expect(new Date(invoice.dueDate).toISOString().slice(0, 10)).toBe("2026-08-31");
  });

  it("marks an unpaid past-due invoice as overdue", () => {
    const [invoice] = normalizeSoftOneOpenInvoiceRows(
      [{ ...row, DUE_DATE: 20260701, OPEN_AMOUNT: 100 }],
      new Map([["1403582", "INV-1"]]),
      new Map([["1", "Prime Products LTD"]]),
      new Map([["999", "EURO"]]),
      Date.UTC(2026, 6, 29),
    );
    expect(invoice.status).toBe("Overdue");
  });

  it("rejects incomplete lookups, duplicates, and non-positive open amounts", () => {
    const maps = [
      new Map([["1403582", "INV-1"]]),
      new Map([["1", "Prime Products LTD"]]),
      new Map([["999", "EURO"]]),
    ] as const;
    expect(() =>
      normalizeSoftOneOpenInvoiceRows([row, row], ...maps),
    ).toThrow(/duplicate FINDOC/);
    expect(() =>
      normalizeSoftOneOpenInvoiceRows(
        [{ ...row, OPEN_AMOUNT: 0 }],
        ...maps,
      ),
    ).toThrow(/invalid open amount/);
  });

  it("uses the authoritative open amount when it exceeds aggregated TAMNT", () => {
    const [invoice] = normalizeSoftOneOpenInvoiceRows(
      [{ ...row, ORIGINAL_AMOUNT: 80, OPEN_AMOUNT: 100 }],
      new Map([["1403582", "INV-1"]]),
      new Map([["1", "Prime Products LTD"]]),
      new Map([["999", "EURO"]]),
    );
    expect(invoice.amount).toBe("100.00");
    expect(invoice.paidAmount).toBe("0.00");
  });

  it("normalizes the currency names used in the supplied export", () => {
    expect(normalizeSoftOneCurrencyName("EURO")).toBe("EUR");
    expect(normalizeSoftOneCurrencyName("DIRHAM")).toBe("AED");
    expect(normalizeSoftOneCurrencyName("SGD")).toBe("SGD");
    expect(normalizeSoftOneCurrencyName("USD")).toBe("USD");
  });

  it("keeps the financial result set fixed-width and read-only", () => {
    expect(softOneOpenInvoiceFinancialsQuery).toContain("CAST(FP.[FINDOC] AS bigint)");
    expect(softOneOpenInvoiceFinancialsQuery).toContain("CAST(SUM(");
    expect(softOneOpenInvoiceFinancialsQuery).not.toMatch(
      /\b(INSERT|UPDATE|DELETE|DROP|EXEC)\b/i,
    );
  });
});
