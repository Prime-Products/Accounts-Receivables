import { describe, expect, it } from "vitest";
import { invoiceDisplayStatus } from "../client/src/lib/invoiceFilters";

/**
 * The Status column shows exactly one primary badge, plus "Disputed" as the
 * only possible second badge. Overdue is derived from the due date, so the
 * primary badge flips from Open to Overdue the day the invoice becomes late —
 * the user must never have to read two badges to learn that.
 */
describe("invoiceDisplayStatus", () => {
  it("shows Open while the invoice is not yet due", () => {
    const d = invoiceDisplayStatus({ status: "Open", daysOverdue: 0 });
    expect(d.primary).toBe("Open");
    expect(d.secondary).toBeNull();
  });

  it("flips the primary badge to Overdue once the due date has passed", () => {
    const d = invoiceDisplayStatus({ status: "Open", daysOverdue: 6 });
    expect(d.primary).toBe("Overdue");
    expect(d.daysOverdue).toBe(6);
    expect(d.secondary).toBeNull();
  });

  it("never emits Open and Overdue at the same time", () => {
    for (const days of [1, 6, 45, 400]) {
      const d = invoiceDisplayStatus({ status: "Open", daysOverdue: days });
      expect(d.primary).not.toBe("Open");
      expect(d.primary).toBe("Overdue");
    }
  });

  it("keeps Partially Paid while in term and switches to Overdue when late", () => {
    expect(invoiceDisplayStatus({ status: "Partially Paid", daysOverdue: 0 }).primary).toBe("Partially Paid");
    expect(invoiceDisplayStatus({ status: "Partially Paid", daysOverdue: 14 }).primary).toBe("Overdue");
  });

  it("renders Disputed as a second badge on top of the settlement stage", () => {
    const inTerm = invoiceDisplayStatus({ status: "Disputed", daysOverdue: 0 });
    expect(inTerm.primary).toBe("Open");
    expect(inTerm.secondary).toBe("Disputed");

    const late = invoiceDisplayStatus({ status: "Disputed", daysOverdue: 30 });
    expect(late.primary).toBe("Overdue");
    expect(late.daysOverdue).toBe(30);
    expect(late.secondary).toBe("Disputed");
  });

  it("keeps Paid as the primary badge and never marks it overdue", () => {
    const d = invoiceDisplayStatus({ status: "Paid", daysOverdue: 12 });
    expect(d.primary).toBe("Paid");
    expect(d.secondary).toBeNull();
  });

  it("treats a missing daysOverdue as not overdue", () => {
    expect(invoiceDisplayStatus({ status: "Open" }).primary).toBe("Open");
  });

  it("Disputed is the only value that can appear as a secondary badge", () => {
    const statuses = ["Open", "Partially Paid", "Paid", "Disputed"];
    for (const status of statuses) {
      for (const daysOverdue of [0, 9]) {
        const d = invoiceDisplayStatus({ status, daysOverdue });
        expect(d.secondary === null || d.secondary === "Disputed").toBe(true);
      }
    }
  });
});
