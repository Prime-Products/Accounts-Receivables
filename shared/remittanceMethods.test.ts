import { describe, expect, it } from "vitest";
import {
  DEFAULT_REMITTANCE_METHOD,
  REMITTANCE_METHODS,
  normalizeRemittanceMethod,
} from "./remittanceMethods";

describe("remittance methods", () => {
  it("offers exactly Transfer, Cheque and Credit Card", () => {
    expect([...REMITTANCE_METHODS]).toEqual(["Transfer", "Cheque", "Credit Card"]);
    expect(DEFAULT_REMITTANCE_METHOD).toBe("Transfer");
  });

  it("keeps the three labels unchanged", () => {
    for (const m of REMITTANCE_METHODS) expect(normalizeRemittanceMethod(m)).toBe(m);
  });

  it("reads rows written before the rename with their current label", () => {
    expect(normalizeRemittanceMethod("Wire transfer")).toBe("Transfer");
    expect(normalizeRemittanceMethod("Credit card")).toBe("Credit Card");
    expect(normalizeRemittanceMethod("Bank Transfer")).toBe("Transfer");
    expect(normalizeRemittanceMethod("check")).toBe("Cheque");
    expect(normalizeRemittanceMethod("Card")).toBe("Credit Card");
  });

  it("falls back to Transfer for missing or unknown values", () => {
    expect(normalizeRemittanceMethod(null)).toBe("Transfer");
    expect(normalizeRemittanceMethod(undefined)).toBe("Transfer");
    expect(normalizeRemittanceMethod("   ")).toBe("Transfer");
    expect(normalizeRemittanceMethod("Bitcoin")).toBe("Transfer");
  });

  it("never shows the generic word Payment as a method", () => {
    expect((REMITTANCE_METHODS as readonly string[])).not.toContain("Payment");
    expect(normalizeRemittanceMethod("Payment")).toBe("Transfer");
  });
});
