/**
 * Contract expiry urgency — single source of truth.
 *
 * A Prime 247 agreement runs for a fixed period (3, 4 or 5 years). Renewal talks
 * have to start well before the end date, otherwise the fleet drops out of cover
 * and the recurring revenue with it. The thresholds below define how urgent an
 * approaching end date is, and every place that colours an end date — the
 * contract header, the Commercial Terms card, the contracts list — MUST read
 * them from here so the same date never reads as two different urgencies.
 */
export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Days before the end date at which the indicator escalates, widest window first.
 *
 * 180 days is roughly the lead time needed to agree a renewal and plan the
 * equipment swap; 90 days means the renewal should already be on the table;
 * 30 days is the last call before cover lapses.
 */
export const CONTRACT_RENEWAL_DAYS = [180, 90, 30] as const;

/** Urgency buckets, ordered from worst to mildest. */
export type ContractExpiryUrgency = "expired" | "critical" | "urgent" | "upcoming" | "ok";

/**
 * Whole days from `now` until `endDate`.
 *
 * Rounded up, so a contract ending in a few hours reads as "1 day left" — cover
 * runs to the end of the final day.
 */
export function daysUntilContractEnd(endDate: number, now = Date.now()): number {
  return Math.ceil((endDate - now) / DAY_MS);
}

/**
 * Urgency bucket for a contract end date.
 *
 * - `expired`  — the period has run out; the fleet is out of cover.
 * - `critical` — 30 days or less; last call to sign the renewal.
 * - `urgent`   — 90 days or less; the renewal should be on the table.
 * - `upcoming` — 180 days or less; start the renewal conversation.
 * - `ok`       — more than 180 days of the period left.
 */
export function contractExpiryUrgency(endDate: number, now = Date.now()): ContractExpiryUrgency {
  const days = daysUntilContractEnd(endDate, now);
  if (days <= 0) return "expired";
  if (days <= 30) return "critical";
  if (days <= 90) return "urgent";
  if (days <= 180) return "upcoming";
  return "ok";
}

/** Short wording for the indicator, e.g. "expires in 45 days" or "expired 12 days ago". */
export function contractExpiryLabel(endDate: number, now = Date.now()): string {
  const days = daysUntilContractEnd(endDate, now);
  if (days <= 0) {
    const past = Math.abs(days);
    if (past === 0) return "expires today";
    return `expired ${past} day${past === 1 ? "" : "s"} ago`;
  }
  if (days === 1) return "expires tomorrow";
  if (days <= 60) return `expires in ${days} days`;
  const months = Math.round(days / 30);
  if (months < 24) return `expires in ${months} month${months === 1 ? "" : "s"}`;
  const years = Math.floor(days / 365);
  const rest = Math.round((days - years * 365) / 30);
  return rest > 0
    ? `expires in ${years}y ${rest}m`
    : `expires in ${years} year${years === 1 ? "" : "s"}`;
}

/** Tailwind classes for the indicator pill, by urgency. */
export function contractExpiryPillClass(urgency: ContractExpiryUrgency): string {
  switch (urgency) {
    case "expired": return "bg-red-100 text-red-800 border-red-200";
    case "critical": return "bg-red-100 text-red-800 border-red-200";
    case "urgent": return "bg-amber-100 text-amber-800 border-amber-200";
    case "upcoming": return "bg-yellow-50 text-yellow-800 border-yellow-200";
    default: return "bg-emerald-50 text-emerald-800 border-emerald-200";
  }
}

/** Colour of the dot shown next to the end date, by urgency. */
export function contractExpiryDotClass(urgency: ContractExpiryUrgency): string {
  switch (urgency) {
    case "expired": return "bg-red-600";
    case "critical": return "bg-red-500";
    case "urgent": return "bg-amber-500";
    case "upcoming": return "bg-yellow-400";
    default: return "bg-emerald-500";
  }
}
