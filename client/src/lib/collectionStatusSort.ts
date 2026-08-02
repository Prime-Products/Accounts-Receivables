/**
 * Ranking used by the Collections Desk "Collection Status" column.
 *
 * Statuses are ordered by how much attention the group needs, so a descending
 * sort (the table's default direction) puts broken promises at the top and
 * settled groups at the bottom. Alphabetical order would be meaningless here.
 */
export const COLLECTION_STATUS_RANK: Record<string, number> = {
  Broken: 6,
  Escalated: 5,
  "Pending Follow-up": 4,
  Confirmed: 3,
  "Not Contacted": 2,
  Kept: 1,
};

/** Most urgent → least urgent. */
export const COLLECTION_STATUS_ORDER = [
  "Broken",
  "Escalated",
  "Pending Follow-up",
  "Confirmed",
  "Not Contacted",
  "Kept",
] as const;

export function collectionStatusRank(status?: string | null): number {
  if (!status) return 0;
  return COLLECTION_STATUS_RANK[status] ?? 0;
}

