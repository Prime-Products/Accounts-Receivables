const RECEIVABLE_EPSILON = 0.005;

export type ReceivableGroupAmounts = {
  openBalance: number;
  overdueBalance: number;
  overdueEomBalance: number;
};

/**
 * The Groups workspace is an accounts-receivable view, not a directory of
 * every active SoftOne group. Keep only groups with a positive receivable.
 */
export function hasReceivableActivity(group: ReceivableGroupAmounts) {
  return (
    group.openBalance > RECEIVABLE_EPSILON ||
    group.overdueBalance > RECEIVABLE_EPSILON ||
    group.overdueEomBalance > RECEIVABLE_EPSILON
  );
}
