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

export type AgingBucket = "0-30" | "31-60" | "61-90" | "91-120" | "120+";

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
  if (d <= 120) return "91-120";
  return "120+";
}

export interface InvoiceLike {
  id: number;
  dueDate: number;
  amount: string | number;
  paidAmount: string | number;
  status: string;
  /** EUR-converted total amount (set for non-EUR invoices). */
  amountEur?: string | number | null;
  currency?: string | null;
  /** Prime branch / issuing company. */
  company?: string | null;
}

/**
 * Outstanding amount in EUR. For non-EUR invoices, the EUR value is derived
 * from `amountEur` proportionally to the unpaid fraction of the original amount.
 */
export function outstanding(inv: InvoiceLike): number {
  const openOriginal = Number(inv.amount) - Number(inv.paidAmount);
  const eur = inv.amountEur != null ? Number(inv.amountEur) : null;
  if (eur != null && Number(inv.amount) > 0) {
    return (openOriginal / Number(inv.amount)) * eur;
  }
  return openOriginal;
}

/** Outstanding amount in the invoice's original currency. */
export function outstandingOriginal(inv: InvoiceLike): number {
  return Number(inv.amount) - Number(inv.paidAmount);
}

/**
 * Indicative FX rates to EUR used when converting invoice amounts.
 * These defaults can be overridden at runtime via `setFxRates` (Settings UI).
 */
export const FX_RATES_TO_EUR: Record<string, number> = {
  EUR: 1,
  USD: 0.92,
  AED: 0.25,
  SGD: 0.68,
};

export const DEFAULT_FX_RATES: Record<string, number> = { ...FX_RATES_TO_EUR };

/** Override the active FX rates (EUR is always pinned to 1). Invalid/non-positive values are ignored. */
export function setFxRates(rates: Partial<Record<string, number>>): void {
  for (const [cur, rate] of Object.entries(rates)) {
    const key = cur.toUpperCase();
    if (key === "EUR") continue;
    if (typeof rate === "number" && Number.isFinite(rate) && rate > 0) {
      FX_RATES_TO_EUR[key] = rate;
    }
  }
  FX_RATES_TO_EUR.EUR = 1;
}

/** Snapshot of the currently active FX rates. */
export function getFxRates(): Record<string, number> {
  return { ...FX_RATES_TO_EUR };
}

/** Convert an amount in the given currency to EUR (2 decimals). Unknown currencies pass through 1:1. */
export function toEur(amount: number, currency?: string | null): number {
  const rate = FX_RATES_TO_EUR[(currency ?? "EUR").toUpperCase()] ?? 1;
  return Math.round(amount * rate * 100) / 100;
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
    "91-120": { amount: 0, count: 0 },
    "120+": { amount: 0, count: 0 },
  };
  const emptyByCur = (): Record<string, number> => ({});
  const bucketsByCurrency: Record<AgingBucket, Record<string, number>> = {
    "0-30": emptyByCur(),
    "31-60": emptyByCur(),
    "61-90": emptyByCur(),
    "91-120": emptyByCur(),
    "120+": emptyByCur(),
  };
  const totalByCurrency: Record<string, number> = {};
  const currentByCurrency: Record<string, number> = {};
  let current = 0;
  let currentCount = 0;
  for (const inv of invoices) {
    if (!isOpenInvoice(inv)) continue;
    const out = outstanding(inv);
    const cur = (inv.currency ?? "EUR").toUpperCase();
    const outOrig = outstandingOriginal(inv);
    if (now <= inv.dueDate) {
      current += out;
      currentCount += 1;
      currentByCurrency[cur] = (currentByCurrency[cur] ?? 0) + outOrig;
      continue;
    }
    const b = agingBucket(inv.dueDate, now);
    buckets[b].amount += out;
    buckets[b].count += 1;
    bucketsByCurrency[b][cur] = (bucketsByCurrency[b][cur] ?? 0) + outOrig;
    totalByCurrency[cur] = (totalByCurrency[cur] ?? 0) + outOrig;
  }
  const totalOverdue = Object.values(buckets).reduce((s, b) => s + b.amount, 0);
  return { buckets, current, currentCount, totalOverdue, bucketsByCurrency, totalByCurrency, currentByCurrency };
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

// ---------- Customer payment behavior profiling & smart forecast ----------

export interface ReceiptLike {
  receiptDate: number;
  amount: string | number;
}

export interface PromiseLike {
  status: string; // Pending | Kept | Broken
}

export interface PaymentBehaviorProfile {
  /** Average days an invoice stays overdue before being fully paid (paid invoices only). */
  avgDelayDays: number;
  /** Share of invoiced value collected over the analysed history (0..1). */
  collectionRate: number;
  /** Share of receipts (last 6 months) vs open+due amount — recent payment intensity (0..1+). */
  recentPaymentRatio: number;
  /** Promise reliability: kept / (kept + broken); null when no resolved promises. */
  promiseReliability: number | null;
  paidInvoiceCount: number;
  openInvoiceCount: number;
  totalOpenEur: number;
  overdueEur: number;
}

/**
 * Build a payment behavior profile for one customer from historical data.
 * All monetary values in EUR.
 */
export function buildBehaviorProfile(
  invoices: InvoiceLike[] & { updatedAt?: unknown },
  receipts: ReceiptLike[],
  promises: PromiseLike[],
  now: number,
  paidDates?: Map<number, number>,
): PaymentBehaviorProfile {
  const paid = invoices.filter(i => i.status === "Paid");
  const open = invoices.filter(isOpenInvoice);

  // Average delay: for paid invoices we approximate settle date via paidDates map
  // (invoice id → settle ts) when provided; otherwise use current overdue days of open invoices.
  let delaySum = 0;
  let delayCount = 0;
  if (paidDates && paidDates.size > 0) {
    for (const inv of paid) {
      const settled = paidDates.get(inv.id);
      if (settled === undefined) continue;
      delaySum += Math.max(0, Math.floor((settled - inv.dueDate) / DAY_MS));
      delayCount += 1;
    }
  }
  if (delayCount === 0) {
    for (const inv of open) {
      if (now > inv.dueDate) {
        delaySum += daysOverdue(inv.dueDate, now);
        delayCount += 1;
      }
    }
  }
  const avgDelayDays = delayCount > 0 ? Math.round(delaySum / delayCount) : 0;

  const invoicedTotal = invoices.reduce((s, i) => s + (i.amountEur != null ? Number(i.amountEur) : Number(i.amount)), 0);
  const openTotal = open.reduce((s, i) => s + outstanding(i), 0);
  const collectionRate = invoicedTotal > 0 ? Math.min(1, (invoicedTotal - openTotal) / invoicedTotal) : 0;

  const sixMonthsAgo = now - 182 * DAY_MS;
  const recentReceipts = receipts.filter(r => r.receiptDate >= sixMonthsAgo).reduce((s, r) => s + Number(r.amount), 0);
  const recentPaymentRatio = openTotal > 0 ? recentReceipts / openTotal : recentReceipts > 0 ? 1 : 0;

  const kept = promises.filter(p => p.status === "Kept").length;
  const broken = promises.filter(p => p.status === "Broken").length;
  const promiseReliability = kept + broken > 0 ? kept / (kept + broken) : null;

  const overdueEur = open.filter(i => now > i.dueDate).reduce((s, i) => s + outstanding(i), 0);

  return {
    avgDelayDays,
    collectionRate,
    recentPaymentRatio: Math.round(recentPaymentRatio * 100) / 100,
    promiseReliability,
    paidInvoiceCount: paid.length,
    openInvoiceCount: open.length,
    totalOpenEur: Math.round(openTotal * 100) / 100,
    overdueEur: Math.round(overdueEur * 100) / 100,
  };
}

/**
 * Statistical (non-LLM) expected-collection heuristic for a month, EUR.
 * dueThisMonth: open EUR falling due within the month; overdue: already overdue EUR.
 */
export function heuristicExpectedAmount(
  dueThisMonth: number,
  overdue: number,
  profile: PaymentBehaviorProfile,
): { amount: number; reasoning: string } {
  // Probability the customer pays on time decreases with historical delay.
  const onTimeFactor = profile.avgDelayDays <= 5 ? 0.9 : profile.avgDelayDays <= 30 ? 0.65 : profile.avgDelayDays <= 60 ? 0.4 : 0.25;
  // Overdue amounts are recovered at a slower pace, boosted by recent payment activity.
  const overdueFactor = Math.min(0.6, 0.15 + 0.3 * Math.min(1, profile.recentPaymentRatio) + 0.15 * profile.collectionRate);
  const reliability = profile.promiseReliability ?? profile.collectionRate;
  const blend = 0.7 + 0.3 * reliability;

  const expected = (dueThisMonth * onTimeFactor + overdue * overdueFactor) * blend;
  const amount = Math.round(Math.min(expected, dueThisMonth + overdue) * 100) / 100;
  const reasoning =
    `Heuristic: avg delay ${profile.avgDelayDays}d → on-time factor ${onTimeFactor}; ` +
    `overdue recovery factor ${overdueFactor.toFixed(2)} (recent payment ratio ${profile.recentPaymentRatio}, ` +
    `collection rate ${(profile.collectionRate * 100).toFixed(0)}%); reliability blend ${(blend).toFixed(2)}.`;
  return { amount, reasoning };
}

// ---------- Historical payment behavior (from imported payment allocations) ----------

export interface BehaviorRow {
  customerId: number;
  payments: number;
  totalPaid: number;
  avgDaysLate: number;
  medianDaysLate: number;
  avgDaysFromInvoice: number;
  medianDaysFromInvoice: number;
  customerGroup?: string | null;
  customerName?: string | null;
}

export interface GroupBehavior {
  group: string;
  companies: number;
  payments: number;
  totalPaid: number;
  avgDaysLate: number;
  medianDaysLate: number;
  avgDaysFromInvoice: number;
  medianDaysFromInvoice: number;
}

/** Weighted median: values weighted by payment counts. */
export function weightedMedian(pairs: Array<[value: number, weight: number]>): number {
  const valid = pairs.filter(([, w]) => w > 0).sort((a, b) => a[0] - b[0]);
  if (valid.length === 0) return 0;
  const total = valid.reduce((s, [, w]) => s + w, 0);
  let acc = 0;
  for (const [v, w] of valid) {
    acc += w;
    if (acc >= total / 2) return v;
  }
  return valid[valid.length - 1][0];
}

/**
 * Aggregate per-customer behavior stats into group-level stats.
 * Averages weighted by payment count; medians via weighted median of
 * per-company medians (payments as weights).
 */
export function aggregateGroupBehavior(rows: BehaviorRow[]): Map<string, GroupBehavior> {
  const byGroup = new Map<string, BehaviorRow[]>();
  for (const r of rows) {
    const g = (r.customerGroup || r.customerName || `#${r.customerId}`).trim();
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g)!.push(r);
  }
  const out = new Map<string, GroupBehavior>();
  for (const [g, items] of Array.from(byGroup.entries())) {
    const payments = items.reduce((s, r) => s + r.payments, 0);
    const totalPaid = items.reduce((s, r) => s + r.totalPaid, 0);
    const w = payments || 1;
    out.set(g, {
      group: g,
      companies: items.length,
      payments,
      totalPaid: Math.round(totalPaid * 100) / 100,
      avgDaysLate: Math.round((items.reduce((s, r) => s + r.avgDaysLate * r.payments, 0) / w) * 10) / 10,
      medianDaysLate: weightedMedian(items.map(r => [r.medianDaysLate, r.payments])),
      avgDaysFromInvoice: Math.round((items.reduce((s, r) => s + r.avgDaysFromInvoice * r.payments, 0) / w) * 10) / 10,
      medianDaysFromInvoice: weightedMedian(items.map(r => [r.medianDaysFromInvoice, r.payments])),
    });
  }
  return out;
}

/**
 * Refine the heuristic using real historical behavior (median days late from
 * last-year payment allocations). Falls back to the base heuristic when no
 * history exists for the customer or its group.
 */
export function heuristicWithHistory(
  dueThisMonth: number,
  overdue: number,
  profile: PaymentBehaviorProfile,
  history?: { avgDaysLate: number; medianDaysLate: number; payments: number } | null,
): { amount: number; reasoning: string } {
  const base = heuristicExpectedAmount(dueThisMonth, overdue, profile);
  if (!history || history.payments < 2) return base;
  const med = history.medianDaysLate;
  // Median days late → on-time factor from real behavior.
  const onTimeFactor = med <= 0 ? 0.95 : med <= 7 ? 0.85 : med <= 30 ? 0.6 : med <= 60 ? 0.4 : 0.2;
  // Overdue recovery: customers who historically settle (even late) recover more.
  const overdueFactor = med <= 30 ? 0.5 : med <= 60 ? 0.35 : 0.2;
  const histExpected = Math.min(dueThisMonth * onTimeFactor + overdue * overdueFactor, dueThisMonth + overdue);
  // Blend: history dominates (70%) when we have enough payments.
  const weight = Math.min(0.7, 0.3 + history.payments / 100);
  const amount = Math.round((histExpected * weight + base.amount * (1 - weight)) * 100) / 100;
  const reasoning =
    `History: median ${med}d late, avg ${history.avgDaysLate}d over ${history.payments} payments (last year) → ` +
    `on-time ${onTimeFactor}, overdue recovery ${overdueFactor}, blend ${(weight * 100).toFixed(0)}% history. ` +
    base.reasoning;
  return { amount, reasoning };
}
