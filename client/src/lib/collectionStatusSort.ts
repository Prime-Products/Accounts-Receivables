/**
 * Ordering used by the Collections Desk "Collection Status" column.
 *
 * The collector works by date, not by status name: whatever is due today (or is
 * already late) must come first, then what is coming up — soonest first — and
 * groups nobody has contacted yet sit at the bottom, since they carry no
 * commitment to chase on a given day.
 *
 * `collectionActionSortValue` returns a single sortable number so the table's
 * generic comparator keeps working. Smaller = more urgent, and the Desk sorts
 * this key ascending by default.
 */

/** Buckets, most urgent first. */
export const COLLECTION_ACTION_BUCKET = {
  /** A promise/follow-up date that has already passed. */
  overdue: 0,
  /** A promise/follow-up date falling today. */
  today: 1,
  /** A promise/follow-up date still ahead of us. */
  upcoming: 2,
  /** A status that carries no date (Kept, Broken with no reschedule, …). */
  noDate: 3,
  /** Never contacted — nothing was ever agreed, so it is chased last. */
  notContacted: 4,
} as const;

export type CollectionActionRow = {
  confirmationStatus?: string | null;
  /** The date the group is waiting on (open promise date or follow-up date). */
  actionDate?: number | null;
  /** Server-computed marker: the action date is today or already past. */
  actionDue?: "today" | "overdue" | null;
};

export function collectionActionBucket(row: CollectionActionRow): number {
  if ((row.confirmationStatus ?? "Not Contacted") === "Not Contacted") {
    return COLLECTION_ACTION_BUCKET.notContacted;
  }
  if (row.actionDue === "overdue") return COLLECTION_ACTION_BUCKET.overdue;
  if (row.actionDue === "today") return COLLECTION_ACTION_BUCKET.today;
  if (row.actionDate != null) return COLLECTION_ACTION_BUCKET.upcoming;
  return COLLECTION_ACTION_BUCKET.noDate;
}

/**
 * Collapse bucket + date into one ascending sort key.
 *
 * Inside the dated buckets the earliest date wins (the oldest late promise and
 * the nearest upcoming one come first). Dates are milliseconds, so they are
 * scaled down to days to stay well inside safe integer range once offset by the
 * bucket.
 */
export function collectionActionSortValue(row: CollectionActionRow): number {
  const bucket = collectionActionBucket(row);
  const DAY = 86_400_000;
  const bucketOffset = bucket * 1_000_000;
  if (bucket === COLLECTION_ACTION_BUCKET.noDate || bucket === COLLECTION_ACTION_BUCKET.notContacted) {
    return bucketOffset;
  }
  const days = Math.floor((row.actionDate ?? 0) / DAY);
  return bucketOffset + days;
}

/** Sort a list of Desk rows by action date. Ascending = most urgent first. */
export function sortByCollectionAction<T extends CollectionActionRow>(rows: T[], dir: "asc" | "desc" = "asc"): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => sign * (collectionActionSortValue(a) - collectionActionSortValue(b)));
}
