/**
 * Shared rules for the transaction lists in the group / customer cards.
 *
 * These lists are collection worklists: a fully settled invoice contributes
 * nothing to what still has to be collected, so it is hidden by default and
 * excluded from the counts and totals. The "Show paid" toggle brings it back
 * for reconciliation and history checks.
 */

export type SettleableInvoice = {
  status: string;
  amount: string | number;
  paidAmount: string | number;
};

/** Rounding tolerance: sub-cent remainders are treated as settled. */
const EPSILON = 0.005;

/** True when the invoice is fully settled — marked Paid or nothing left outstanding. */
export function isSettledInvoice(inv: SettleableInvoice): boolean {
  if (inv.status === "Paid") return true;
  return Number(inv.amount) - Number(inv.paidAmount) <= EPSILON;
}

/**
 * Whether a settled invoice should be hidden from the list.
 * Explicitly filtering by status "Paid" always wins over the toggle, otherwise
 * the filter would return an empty list and look broken.
 */
export function hideSettled(inv: SettleableInvoice, showPaid: boolean, statusFilter: string): boolean {
  if (showPaid || statusFilter === "Paid") return false;
  return isSettledInvoice(inv);
}

/** Count of settled invoices in a list — powers the "N settled hidden" hint. */
export function countSettled(list: SettleableInvoice[]): number {
  return list.filter(isSettledInvoice).length;
}
