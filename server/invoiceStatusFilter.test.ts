/**
 * The invoice lists let the user filter by status. "Overdue" is not a stored
 * status any more — it is derived from the due date — so the filter has to treat
 * it separately, and an Open / Partially Paid / Disputed invoice must still be
 * reachable through it.
 */
import { describe, expect, it } from "vitest";
import { matchesStatusFilter } from "../client/src/lib/invoiceFilters";

const open = { status: "Open", daysOverdue: 0 };
const openLate = { status: "Open", daysOverdue: 6 }; // the Danaos case
const partialLate = { status: "Partially Paid", daysOverdue: 14 };
const disputedLate = { status: "Disputed", daysOverdue: 30 };
const paid = { status: "Paid", daysOverdue: 0 };

describe("invoice status filter", () => {
  it("'all' keeps every row", () => {
    for (const inv of [open, openLate, partialLate, disputedLate, paid]) {
      expect(matchesStatusFilter(inv, "all")).toBe(true);
    }
  });

  it("'Overdue' selects by days overdue, across every settlement status", () => {
    expect(matchesStatusFilter(openLate, "Overdue")).toBe(true);
    expect(matchesStatusFilter(partialLate, "Overdue")).toBe(true);
    expect(matchesStatusFilter(disputedLate, "Overdue")).toBe(true);
    expect(matchesStatusFilter(open, "Overdue")).toBe(false);
    expect(matchesStatusFilter(paid, "Overdue")).toBe(false);
  });

  it("'Open' still matches an overdue open invoice — the two are orthogonal", () => {
    expect(matchesStatusFilter(openLate, "Open")).toBe(true);
    expect(matchesStatusFilter(open, "Open")).toBe(true);
    expect(matchesStatusFilter(partialLate, "Open")).toBe(false);
  });

  it("'Disputed' matches a disputed invoice whether or not it is late", () => {
    expect(matchesStatusFilter(disputedLate, "Disputed")).toBe(true);
    expect(matchesStatusFilter({ status: "Disputed", daysOverdue: 0 }, "Disputed")).toBe(true);
  });

  it("treats a missing daysOverdue as not overdue", () => {
    expect(matchesStatusFilter({ status: "Open" }, "Overdue")).toBe(false);
    expect(matchesStatusFilter({ status: "Open" }, "Open")).toBe(true);
  });
});
