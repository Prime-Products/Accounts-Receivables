import { describe, it, expect } from "vitest";
import {
  COLLECTION_ACTION_BUCKET,
  collectionActionBucket,
  collectionActionSortValue,
  sortByCollectionAction,
} from "./collectionStatusSort";

/**
 * The Collections Desk is worked by date: what is due today or already late has
 * to be at the top, what is promised for later comes next (soonest first), and
 * groups nobody ever contacted are chased last.
 */
const DAY = 86_400_000;
const today = Date.UTC(2026, 7, 2);

describe("collection action ordering", () => {
  it("puts an overdue promise above one due today", () => {
    const overdue = { confirmationStatus: "Confirmed", actionDate: today - 3 * DAY, actionDue: "overdue" as const };
    const dueToday = { confirmationStatus: "Confirmed", actionDate: today, actionDue: "today" as const };
    expect(collectionActionSortValue(overdue)).toBeLessThan(collectionActionSortValue(dueToday));
  });

  it("puts today's date above any future date", () => {
    const dueToday = { confirmationStatus: "Pending Follow-up", actionDate: today, actionDue: "today" as const };
    const future = { confirmationStatus: "Pending Follow-up", actionDate: today + 5 * DAY, actionDue: null };
    expect(collectionActionSortValue(dueToday)).toBeLessThan(collectionActionSortValue(future));
  });

  it("orders future dates soonest first", () => {
    const soon = { confirmationStatus: "Confirmed", actionDate: today + 2 * DAY, actionDue: null };
    const later = { confirmationStatus: "Confirmed", actionDate: today + 30 * DAY, actionDue: null };
    expect(collectionActionSortValue(soon)).toBeLessThan(collectionActionSortValue(later));
  });

  it("orders overdue dates oldest first", () => {
    const older = { confirmationStatus: "Confirmed", actionDate: today - 30 * DAY, actionDue: "overdue" as const };
    const newer = { confirmationStatus: "Confirmed", actionDate: today - 2 * DAY, actionDue: "overdue" as const };
    expect(collectionActionSortValue(older)).toBeLessThan(collectionActionSortValue(newer));
  });

  it("places Not Contacted last, after every dated group", () => {
    const notContacted = { confirmationStatus: "Not Contacted", actionDate: null, actionDue: null };
    const future = { confirmationStatus: "Confirmed", actionDate: today + 90 * DAY, actionDue: null };
    const noDate = { confirmationStatus: "Kept", actionDate: null, actionDue: null };
    expect(collectionActionBucket(notContacted)).toBe(COLLECTION_ACTION_BUCKET.notContacted);
    expect(collectionActionSortValue(notContacted)).toBeGreaterThan(collectionActionSortValue(future));
    expect(collectionActionSortValue(notContacted)).toBeGreaterThan(collectionActionSortValue(noDate));
  });

  it("treats a missing status as Not Contacted", () => {
    expect(collectionActionBucket({})).toBe(COLLECTION_ACTION_BUCKET.notContacted);
    expect(collectionActionBucket({ confirmationStatus: null })).toBe(COLLECTION_ACTION_BUCKET.notContacted);
  });

  it("sorts a mixed Desk the way a collector reads it", () => {
    const rows = [
      { group: "never called", confirmationStatus: "Not Contacted", actionDate: null, actionDue: null },
      { group: "promised next month", confirmationStatus: "Confirmed", actionDate: today + 30 * DAY, actionDue: null },
      { group: "late 10 days", confirmationStatus: "Confirmed", actionDate: today - 10 * DAY, actionDue: "overdue" as const },
      { group: "due today", confirmationStatus: "Pending Follow-up", actionDate: today, actionDue: "today" as const },
      { group: "late 2 days", confirmationStatus: "Pending Follow-up", actionDate: today - 2 * DAY, actionDue: "overdue" as const },
      { group: "promised in 3 days", confirmationStatus: "Confirmed", actionDate: today + 3 * DAY, actionDue: null },
    ];
    expect(sortByCollectionAction(rows).map(r => r.group)).toEqual([
      "late 10 days",
      "late 2 days",
      "due today",
      "promised in 3 days",
      "promised next month",
      "never called",
    ]);
  });

  it("reverses cleanly when the header is clicked twice", () => {
    const rows = [
      { group: "due today", confirmationStatus: "Confirmed", actionDate: today, actionDue: "today" as const },
      { group: "never called", confirmationStatus: "Not Contacted", actionDate: null, actionDue: null },
    ];
    expect(sortByCollectionAction(rows, "desc").map(r => r.group)).toEqual(["never called", "due today"]);
  });
});

