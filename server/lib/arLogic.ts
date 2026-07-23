/**
 * Pure business logic for the AR application.
 * Kept free of DB access so it can be unit-tested in isolation.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

/** SOP follow-up offsets (days after invoice due date) — exact values per SOP. */
export const SOP_OFFSETS = [
  { days: 2, type: "Follow-up +2" as const, label: "1st Follow-up" },
  { days: 15, type: "Follow-up +15" as const, label: "Intermediate Follow-up" },
  { days: 20, type: "Follow-up +20 SOA" as const, label: "2nd Follow-up + SOA" },
  { days: 30, type: "Escalation +30" as const, label: "Escalation" },
];

/** Contract expiry notification lead time: 2 months before end date. */
export const CONTRACT_EXPIRY_LEAD_MS = 60 * DAY_MS;

export type AgingBucket = "0-30" | "31-60" | "61-90" | "90+";

/** Days overdue (0 if not yet due). */
export function daysOverdue(dueDate: number, now: number): number {
  if (now <= dueDate) return 0;
  return Math.floor((now - dueDate) / DAY_MS);
}

/** Classify an overdue invoice into an aging bucket by days overdue (1..30 → 0-30). */
export function agingBucket(dueDate: number, now: number): AgingBucket {
  const d = daysOverdue(dueDate, now);
  if (d <= 30) return "0-30";
  if (d <= 60) return "31-60";
  if (d <= 90) return "61-90";
  return "90+";
}

export interface InvoiceLike {
  id: number;
  dueDate: number;
  amount: string | number;
  paidAmount: string | number;
  status: string;
}

export function outstanding(inv: InvoiceLike): number {
  return Number(inv.amount) - Number(inv.paidAmount);
}

export function isOpenInvoice(inv: InvoiceLike): boolean {
  return inv.status !== "Paid" && outstanding(inv) > 0.005;
}

/** Compute aging report totals from a list of invoices. */
export function computeAging(invoices: InvoiceLike[], now: number) {
  const buckets: Record<AgingBucket, { amount: number; count: number }> = {
    "0-30": { amount: 0, count: 0 },
    "31-60": { amount: 0, count: 0 },
    "61-90": { amount: 0, count: 0 },
    "90+": { amount: 0, count: 0 },
  };
  let current = 0;
  let currentCount = 0;
  for (const inv of invoices) {
    if (!isOpenInvoice(inv)) continue;
    const out = outstanding(inv);
    if (now <= inv.dueDate) {
      current += out;
      currentCount += 1;
      continue;
    }
    const b = agingBucket(inv.dueDate, now);
    buckets[b].amount += out;
    buckets[b].count += 1;
  }
  const totalOverdue = Object.values(buckets).reduce((s, b) => s + b.amount, 0);
  return { buckets, current, currentCount, totalOverdue };
}

/**
 * Determine which SOP tasks should exist for an open overdue invoice.
 * Returns the offsets whose trigger date (dueDate + offset) has been reached.
 */
export function dueSopOffsets(dueDate: number, now: number) {
  return SOP_OFFSETS.filter(o => now >= dueDate + o.days * DAY_MS);
}

/** Valid transitions of the On-Hold workflow. */
export const ON_HOLD_TRANSITIONS: Record<string, string[]> = {
  "Under Review": ["Eligible for On Hold", "Rejected"],
  "Eligible for On Hold": ["On Hold", "Rejected"],
  "On Hold": ["Legal", "Resolved"],
  Legal: ["Resolved"],
  Rejected: [],
  Resolved: [],
};

export function canTransitionOnHold(from: string, to: string): boolean {
  return (ON_HOLD_TRANSITIONS[from] ?? []).includes(to);
}

/** DSO (Days Sales Outstanding), simple method: (AR balance / total credit sales in period) × days. */
export function computeDso(arBalance: number, creditSales: number, periodDays: number): number {
  if (creditSales <= 0) return 0;
  return Math.round((arBalance / creditSales) * periodDays);
}

/** Month key helper: returns { year, month } for a timestamp (UTC). */
export function monthOf(ts: number): { year: number; month: number } {
  const d = new Date(ts);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

/** Start/end timestamps (UTC) of a given year-month. */
export function monthRange(year: number, month: number): { start: number; end: number } {
  const start = Date.UTC(year, month - 1, 1);
  const end = Date.UTC(year, month, 1);
  return { start, end };
}

export interface InstallmentLike {
  dueDate: number;
  amount: string | number;
  status: string;
}

/**
 * Build a 6-month cash collection forecast from open invoices and upcoming installments.
 * Overdue amounts are included in the first (current) month.
 */
export function buildForecast(
  invoices: InvoiceLike[],
  installments: InstallmentLike[],
  now: number,
  months = 6,
) {
  const result: {
    year: number;
    month: number;
    fromInvoices: number;
    fromContracts: number;
    total: number;
  }[] = [];
  const startMonth = monthOf(now);
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(startMonth.year, startMonth.month - 1 + i, 1));
    result.push({
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      fromInvoices: 0,
      fromContracts: 0,
      total: 0,
    });
  }
  const horizonEnd = Date.UTC(startMonth.year, startMonth.month - 1 + months, 1);

  const slotFor = (ts: number): number => {
    if (ts < Date.UTC(startMonth.year, startMonth.month - 1, 1)) return 0; // overdue → current month
    if (ts >= horizonEnd) return -1;
    const m = monthOf(ts);
    return (m.year - startMonth.year) * 12 + (m.month - startMonth.month);
  };

  for (const inv of invoices) {
    if (!isOpenInvoice(inv)) continue;
    const slot = slotFor(inv.dueDate);
    if (slot < 0) continue;
    result[slot].fromInvoices += outstanding(inv);
  }
  for (const inst of installments) {
    if (inst.status === "Paid") continue;
    if (inst.status === "Invoiced") continue; // already counted via its invoice
    const slot = slotFor(inst.dueDate);
    if (slot < 0) continue;
    result[slot].fromContracts += Number(inst.amount);
  }
  for (const r of result) r.total = r.fromInvoices + r.fromContracts;
  return result;
}

/** Derive invoice status after allocations. */
export function deriveInvoiceStatus(amount: number, paidAmount: number, dueDate: number, now: number, current: string): string {
  if (current === "Disputed") return "Disputed";
  if (paidAmount >= amount - 0.005) return "Paid";
  if (paidAmount > 0.005) return "Partially Paid";
  if (now > dueDate) return "Overdue";
  return "Open";
}
