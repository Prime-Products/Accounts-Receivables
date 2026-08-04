/**
 * Presentation order for contract item natures.
 *
 * A contract is read top-down: first the serial-tracked equipment that must be
 * certified and returned, then the consumables that feed it, then everything
 * else supplied under the agreement.
 */
export const productGroupOrder = ["Equipment", "Consumable", "Other"] as const;

export type ProductGroup = (typeof productGroupOrder)[number];

/** Plural, human-readable heading for each nature. */
export const productGroupLabels: Record<ProductGroup, string> = {
  Equipment: "Equipment",
  Consumable: "Consumables",
  Other: "Other Items",
};

/** Rank used for sorting; unknown natures fall to the end of the list. */
export function productGroupRank(itemType: string): number {
  const i = productGroupOrder.indexOf(itemType as ProductGroup);
  return i === -1 ? productGroupOrder.length : i;
}

/**
 * Split a contract's product list into ordered groups, keeping only the groups
 * that actually contain items so empty headings never reach the UI.
 */
export function groupContractProducts<T extends { itemType: string }>(
  items: readonly T[],
): { group: string; label: string; items: T[] }[] {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const key = productGroupRank(item.itemType) === productGroupOrder.length ? "Other" : item.itemType;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }
  return productGroupOrder
    .filter(group => (buckets.get(group)?.length ?? 0) > 0)
    .map(group => ({
      group,
      label: productGroupLabels[group],
      items: buckets.get(group)!,
    }));
}
