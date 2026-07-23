import { describe, expect, it } from "vitest";
import { FX_RATES_TO_EUR, outstanding, outstandingOriginal, toEur } from "./lib/arLogic";

describe("toEur", () => {
  it("keeps EUR amounts unchanged", () => {
    expect(toEur(1000, "EUR")).toBe(1000);
    expect(toEur(1000, null)).toBe(1000);
    expect(toEur(1000, undefined)).toBe(1000);
  });

  it("converts USD, AED and SGD using the configured rates", () => {
    expect(toEur(100, "USD")).toBe(100 * FX_RATES_TO_EUR.USD);
    expect(toEur(100, "AED")).toBe(100 * FX_RATES_TO_EUR.AED);
    expect(toEur(100, "SGD")).toBe(100 * FX_RATES_TO_EUR.SGD);
  });

  it("passes unknown currencies through 1:1 and rounds to 2 decimals", () => {
    expect(toEur(99.999, "XXX")).toBe(100);
    expect(toEur(123.456, "USD")).toBe(Math.round(123.456 * 0.92 * 100) / 100);
  });
});

describe("EUR-aware outstanding", () => {
  const base = { id: 1, dueDate: Date.now(), status: "Open" as const };

  it("uses the plain amount for EUR invoices without amountEur", () => {
    const inv = { ...base, amount: "1000.00", paidAmount: "250.00" };
    expect(outstanding(inv)).toBeCloseTo(750);
    expect(outstandingOriginal(inv)).toBeCloseTo(750);
  });

  it("converts the unpaid fraction using amountEur for FX invoices", () => {
    // 1000 SGD invoice = 680 EUR; half paid → outstanding 500 SGD = 340 EUR
    const inv = { ...base, amount: "1000.00", paidAmount: "500.00", amountEur: "680.00", currency: "SGD" };
    expect(outstanding(inv)).toBeCloseTo(340);
    expect(outstandingOriginal(inv)).toBeCloseTo(500);
  });

  it("returns full EUR value when nothing is paid", () => {
    const inv = { ...base, amount: "322.00", paidAmount: "0.00", amountEur: "80.50", currency: "AED" };
    expect(outstanding(inv)).toBeCloseTo(80.5);
    expect(outstandingOriginal(inv)).toBeCloseTo(322);
  });
});
