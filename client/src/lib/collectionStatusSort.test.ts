import { describe, it, expect } from "vitest";
import { collectionStatusRank, COLLECTION_STATUS_ORDER } from "./collectionStatusSort";

/**
 * The Collection Status column is sorted by urgency, not alphabetically: a
 * descending sort must surface broken promises first and settled groups last.
 */
describe("collection status sort ranking", () => {
  it("ranks broken promises above every other status", () => {
    for (const s of ["Escalated", "Pending Follow-up", "Confirmed", "Not Contacted", "Kept"]) {
      expect(collectionStatusRank("Broken")).toBeGreaterThan(collectionStatusRank(s));
    }
  });

  it("ranks an active promise above an untouched group and a settled one", () => {
    expect(collectionStatusRank("Confirmed")).toBeGreaterThan(collectionStatusRank("Not Contacted"));
    expect(collectionStatusRank("Not Contacted")).toBeGreaterThan(collectionStatusRank("Kept"));
  });

  it("orders the whole ladder from most to least urgent", () => {
    const ranks = COLLECTION_STATUS_ORDER.map(collectionStatusRank);
    expect(ranks).toEqual([...ranks].sort((a, b) => b - a));
  });

  it("treats a missing status as the lowest rank", () => {
    expect(collectionStatusRank(null)).toBe(0);
    expect(collectionStatusRank(undefined)).toBe(0);
    expect(collectionStatusRank("Something else")).toBe(0);
  });

  it("sorting descending puts work-needing groups on top", () => {
    const rows = [
      { group: "A", confirmationStatus: "Kept" },
      { group: "B", confirmationStatus: "Broken" },
      { group: "C", confirmationStatus: "Confirmed" },
      { group: "D", confirmationStatus: "Pending Follow-up" },
    ];
    const sorted = [...rows].sort(
      (a, b) => collectionStatusRank(b.confirmationStatus) - collectionStatusRank(a.confirmationStatus)
    );
    expect(sorted.map(r => r.group)).toEqual(["B", "D", "C", "A"]);
  });
});
