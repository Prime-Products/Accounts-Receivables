import { describe, expect, it } from "vitest";
import {
  aggregateSoftOneOpenInvoiceParts,
  buildSoftOneInvoiceCustomerLookupQuery,
  buildSoftOneOpenInvoiceDocumentsQuery,
  buildSoftOneOpenInvoiceFinancialsQuery,
  normalizeSoftOneCurrencyName,
  normalizeSoftOneOpenInvoiceRows,
  softOneOpenInvoiceAmountSummaryQuery,
  softOneOpenInvoiceFinancialsQuery,
  softOneOpenInvoiceTypeBreakdownQuery,
  softOneInvoiceAmountSamplesQuery,
} from "./lib/softoneInvoices";

const row = {
  FINDOC: 1403582,
  SOFTONE_ID: "1403582",
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

  it("keeps overdue as a derived property instead of a stored status", () => {
    const [invoice] = normalizeSoftOneOpenInvoiceRows(
      [{ ...row, DUE_DATE: 20260701, OPEN_AMOUNT: 100 }],
      new Map([["1403582", "INV-1"]]),
      new Map([["1", "Prime Products LTD"]]),
      new Map([["999", "EURO"]]),
      Date.UTC(2026, 6, 29),
    );
    expect(invoice.status).toBe("Open");
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

  it("aggregates payment-term parts in Node and keeps positive balances", () => {
    const result = aggregateSoftOneOpenInvoiceParts([
      {
        ...row,
        DUE_DATE: 20260731,
        ORIGINAL_AMOUNT_PART: 60,
        OPEN_AMOUNT_PART: 50,
      },
      {
        ...row,
        DUE_DATE: 20260831,
        ORIGINAL_AMOUNT_PART: 40,
        OPEN_AMOUNT_PART: 35.6,
      },
      {
        ...row,
        FINDOC: 2,
        ORIGINAL_AMOUNT_PART: 10,
        OPEN_AMOUNT_PART: -10,
      },
    ]);
    expect(result).toEqual([
      expect.objectContaining({
        FINDOC: row.FINDOC,
        DUE_DATE: 20260831,
        ORIGINAL_AMOUNT: 100,
        OPEN_AMOUNT: 85.6,
      }),
    ]);
  });

  it("keeps separate customer balances for a shared FINDOC", () => {
    const result = aggregateSoftOneOpenInvoiceParts([
      { ...row, TRDR: 10036, ORIGINAL_AMOUNT_PART: 100, OPEN_AMOUNT_PART: 80 },
      { ...row, TRDR: 10037, ORIGINAL_AMOUNT_PART: 50, OPEN_AMOUNT_PART: 40 },
    ]);
    expect(result).toEqual([
      expect.objectContaining({ TRDR: 10036, SOFTONE_ID: "1403582", OPEN_AMOUNT: 80 }),
      expect.objectContaining({ TRDR: 10037, SOFTONE_ID: "1403582:10037", OPEN_AMOUNT: 40 }),
    ]);
  });

  it("keeps the payment-term result set fixed-width and read-only", () => {
    expect(softOneOpenInvoiceFinancialsQuery).toContain("CAST(FP.[FINDOC] AS bigint)");
    expect(softOneOpenInvoiceFinancialsQuery).toContain(
      "CAST(FP.[TAMNT] AS float)",
    );
    expect(softOneOpenInvoiceFinancialsQuery).toContain(
      "CAST(FIN.[SOCURRENCY] AS int) AS [SOCURRENCY]",
    );
    expect(softOneOpenInvoiceFinancialsQuery).not.toMatch(
      /\b(INSERT|UPDATE|DELETE|DROP|EXEC)\b/i,
    );
    expect(softOneOpenInvoiceFinancialsQuery).not.toContain("HAVING");
    expect(softOneOpenInvoiceFinancialsQuery).toContain("TOP (100)");
    expect(softOneOpenInvoiceFinancialsQuery).toContain(
      "FP_PAGE.[FINDOC] > 0",
    );
    expect(softOneOpenInvoiceFinancialsQuery).not.toContain(
      "FIN.[SOSOURCE] = 1351",
    );
    expect(softOneOpenInvoiceFinancialsQuery).not.toContain("FIN.[SOREDIR] = 0");
    expect(softOneOpenInvoiceFinancialsQuery).toContain(
      "AR_CUSTOMER.[SODTYPE] = 13",
    );
    expect(softOneOpenInvoiceFinancialsQuery).toContain(
      "AR_CUSTOMER.[ISACTIVE] = 1",
    );
    expect(softOneOpenInvoiceFinancialsQuery).toContain(
      "AR_CUSTOMER.[TRDGROUP] IS NOT NULL",
    );
    expect(softOneOpenInvoiceFinancialsQuery).toContain(
      "AR_CUSTOMER.[TRDGROUP] <> 473",
    );
    expect(softOneOpenInvoiceFinancialsQuery).toContain(
      "CAST(FP.[OPNTAMNT] AS float)",
    );
    expect(softOneOpenInvoiceFinancialsQuery).toContain(
      "* CAST(FP.[PAYDEMANDMD] AS float) AS [OPEN_AMOUNT_PART]",
    );
    expect(softOneOpenInvoiceAmountSummaryQuery).toContain(
      "CAST(COUNT(*) AS bigint)",
    );
    expect(softOneOpenInvoiceAmountSummaryQuery).toContain(
      "FP.[OPNTAMNT] * FP.[PAYDEMANDMD]",
    );
    expect(softOneOpenInvoiceAmountSummaryQuery).not.toMatch(
      /\b(INSERT|UPDATE|DELETE|DROP|EXEC)\b/i,
    );
    expect(softOneOpenInvoiceTypeBreakdownQuery).toContain(
      "GROUP BY [SOSOURCE], [SOREDIR]",
    );
    expect(softOneOpenInvoiceTypeBreakdownQuery).not.toMatch(
      /\b(INSERT|UPDATE|DELETE|DROP|EXEC)\b/i,
    );
    expect(softOneInvoiceAmountSamplesQuery).toContain(
      "(FP.[TAMNT] - FP.[OPNTAMNT]) * FP.[PAYDEMANDMD]",
    );
    expect(softOneInvoiceAmountSamplesQuery).not.toMatch(
      /\b(INSERT|UPDATE|DELETE|DROP|EXEC)\b/i,
    );
  });

  it("builds numeric keyset pages without accepting an unsafe cursor", () => {
    expect(buildSoftOneOpenInvoiceFinancialsQuery(1400000)).toContain(
      "FP_PAGE.[FINDOC] > 1400000",
    );
    expect(() => buildSoftOneOpenInvoiceFinancialsQuery(-1)).toThrow(
      /invalid.*cursor/i,
    );
  });

  it("builds bounded numeric customer lookup queries", () => {
    const query = buildSoftOneInvoiceCustomerLookupQuery(["10036", "140"]);
    expect(query).toContain("customer.[TRDR] IN (10036, 140)");
    expect(query).toContain("customer.[TRDGROUP]");
    expect(query).toContain("customer.[COMPANY] = 1");
    expect(query).toContain("customer.[SODTYPE] = 13");
    expect(query).toContain("customer.[ISACTIVE] = 1");
    expect(query).toContain("customer.[TRDGROUP] IS NOT NULL");
    expect(query).toContain("customer.[TRDGROUP] <> 473");
    expect(query).not.toContain("customer.[MASTERTRDR]");
    expect(query).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|EXEC)\b/i);
    expect(() =>
      buildSoftOneInvoiceCustomerLookupQuery(["10036); DROP TABLE TRDR"]),
    ).toThrow(/invalid.*identifiers/i);
  });

  it("builds bounded numeric document lookup queries", () => {
    const query = buildSoftOneOpenInvoiceDocumentsQuery(["1403582", "1422083"]);
    expect(query).toContain("FIN.[FINDOC] IN (1403582, 1422083)");
    expect(query).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|EXEC)\b/i);
    expect(() =>
      buildSoftOneOpenInvoiceDocumentsQuery(["1403582); DROP TABLE FINDOC"]),
    ).toThrow(/invalid.*identifiers/i);
  });
});
