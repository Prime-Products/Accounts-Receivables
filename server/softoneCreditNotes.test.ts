import { describe, expect, it } from "vitest";
import { buildSoftOneCreditNoteCustomerQuery, buildSoftOneCreditNotesQuery, normalizeSoftOneCreditNotes } from "./lib/softoneCreditNotes";

describe("SoftOne credit-note synchronization", () => {
  it("covers the full configured year and every approved standard/special series", () => {
    const query = buildSoftOneCreditNotesQuery(0, 2026);
    expect(query).toContain("SELECT TOP (25)");
    expect(query).toContain("document.[TRNDATE] >= '20260101'");
    expect(query).toContain("document.[TRNDATE] < '20270101'");
    expect(query).toContain("7062, 7063, 7064, 7066");
    expect(query).toContain("4301, 4302, 4303, 4304, 4308, 6651");
    expect(query).toContain("document.[ISCANCEL] = 0");
    expect(query).toContain("document.[FINCODE] NOT LIKE N'ΔΑΤ-%'");
    expect(query).toContain("HAVING ABS(SUM(open_terms.[OPNTAMNT] * open_terms.[PAYDEMANDMD])) > 0.005");
    expect(query).toContain("internal_customer.[TRDGROUP] = 473");
  });

  it("allows one approved active customer without a group but rejects Prime's internal group", () => {
    const query = buildSoftOneCreditNoteCustomerQuery(39078);
    expect(query).toContain("customer.[TRDR] = 39078");
    expect(query).toContain("customer.[SODTYPE] = 13");
    expect(query).toContain("customer.[ISACTIVE] = 1");
    expect(query).toContain("customer.[TRDGROUP] IS NULL OR customer.[TRDGROUP] <> 473");
  });

  it("can limit a read-only inspection query to one calendar month", () => {
    const query = buildSoftOneCreditNotesQuery(0, 2026, 8);
    expect(query).toContain("document.[TRNDATE] >= '20260801'");
    expect(query).toContain("document.[TRNDATE] < '20260901'");
    const december = buildSoftOneCreditNotesQuery(0, 2026, 12);
    expect(december).toContain("document.[TRNDATE] < '20270101'");
  });

  it("keeps only open credit notes and rejects ordinary ΔΑΤ invoices", () => {
    const base = { TRDR: 10, COMPANY: 1, VESSEL_ID: 0, SOCURRENCY: 999, DOC_DATE: 20260110, SERIES: 7063 };
    const records = normalizeSoftOneCreditNotes(
      [
        { ...base, FINDOC: 1, AMOUNT: 100, OPEN_AMOUNT: 100 },
        { ...base, FINDOC: 2, AMOUNT: 100, OPEN_AMOUNT: 40 },
        { ...base, FINDOC: 3, AMOUNT: 100, OPEN_AMOUNT: 0 },
        { ...base, FINDOC: 4, AMOUNT: 100, OPEN_AMOUNT: 100 },
      ],
      new Map([["1", "CN-1"], ["2", "CN-2"], ["3", "CN-3"], ["4", "ΔΑΤ-100"]]),
      new Map([["1", "Prime Products LTD"]]),
      new Map([["999", "EUR"]]),
    );
    expect(records.map(record => record.openAmount)).toEqual(["100.00", "40.00"]);
    expect(records.map(record => record.softoneId)).toEqual(["1", "2"]);
  });
});
