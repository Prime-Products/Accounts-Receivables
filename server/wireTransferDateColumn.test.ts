import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * A remittance is read chronologically ("what came in, when"), so the Date
 * column leads the table on the Remittances page.
 */
describe("remittances table column order", () => {
  const src = readFileSync(new URL("../client/src/pages/WireTransfersPage.tsx", import.meta.url), "utf8");

  it("puts Date before Customer in the header definition", () => {
    const cols = src.slice(src.indexOf('["date", "Date"]'), src.indexOf('["status", "Status"]'));
    expect(cols).toContain('["customer", "Customer"]');
    expect(src.indexOf('["date", "Date"]')).toBeLessThan(src.indexOf('["customer", "Customer"]'));
  });

  it("renders the date cell before the customer cell in each row", () => {
    const dateCell = src.indexOf("{fmtDate(Number(t.transferDate))}");
    const customerCell = src.indexOf('<TableCell className="font-medium">');
    expect(dateCell).toBeGreaterThan(-1);
    expect(dateCell).toBeLessThan(customerCell);
  });

  it("keeps the stored column widths in the same order as the header", () => {
    const widths = src.slice(src.indexOf('useResizableColumns("remittances-page"'), src.indexOf("actions: 170"));
    expect(widths.indexOf("date: 120")).toBeLessThan(widths.indexOf("customer: 280"));
    // Method sits next to Branch, after the customer name.
    expect(widths.indexOf("customer: 280")).toBeLessThan(widths.indexOf("method: 120"));
  });
});
