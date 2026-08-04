/**
 * Certificate expiry thresholds — single source of truth.
 *
 * Prime 247 service agreements oblige us to warn the customer before an
 * instrument's calibration certificate lapses, so the equipment can be swapped
 * in time. The contract fixes two lead times: a first heads-up 60 days out
 * (enough to plan the exchange with the vessel's schedule) and a final warning
 * 15 days out.
 *
 * Everything that reasons about "how urgent is this certificate" — the row
 * colours on the Certificates page, the Prime 247 dashboard KPI, and the
 * reminder engine that creates tasks — MUST read these values from here.
 * Duplicating the numbers is what let the dashboard drift to 30/60 while the
 * contract said 60/15.
 */
export const DAY_MS = 24 * 60 * 60 * 1000;

/** Days before expiry at which a reminder is raised, earliest first. */
export const CERT_REMINDER_DAYS = [60, 15] as const;

export type CertReminderDay = (typeof CERT_REMINDER_DAYS)[number];

/** Urgency buckets, ordered from worst to mildest. */
export type CertUrgency = "expired" | "final" | "warning" | "ok";

/**
 * Whole days from `now` until `expiryDate`.
 *
 * Rounded up, so a certificate expiring in 6 hours reads as "1 day left"
 * rather than "0" — a certificate is valid until the end of its expiry day.
 */
export function daysUntilExpiry(expiryDate: number, now = Date.now()): number {
  return Math.ceil((expiryDate - now) / DAY_MS);
}

/**
 * Urgency bucket for a certificate.
 *
 * - `expired` — the date has passed; the instrument is no longer compliant.
 * - `final`   — inside the 15-day final warning window.
 * - `warning` — inside the 60-day planning window.
 * - `ok`      — more than 60 days of life left.
 */
export function certUrgency(expiryDate: number, now = Date.now()): CertUrgency {
  const days = daysUntilExpiry(expiryDate, now);
  if (days <= 0) return "expired";
  if (days <= 15) return "final";
  if (days <= 60) return "warning";
  return "ok";
}

/**
 * The reminder threshold a certificate has crossed but not yet outrun, or null
 * when it sits outside every window.
 *
 * Returns the *tightest* threshold reached: a certificate 10 days from expiry
 * has crossed both 60 and 15, and the 15-day reminder is the one that matters.
 * Expired certificates return the tightest threshold too, so a certificate that
 * lapsed while nobody was looking still produces its final reminder.
 */
export function reachedReminderThreshold(expiryDate: number, now = Date.now()): CertReminderDay | null {
  const days = daysUntilExpiry(expiryDate, now);
  const ordered = [...CERT_REMINDER_DAYS].sort((a, b) => a - b); // 15, 60
  for (const t of ordered) {
    if (days <= t) return t as CertReminderDay;
  }
  return null;
}

/** Tailwind classes for the days-left cell, by urgency. */
export function certUrgencyClass(expiryDate: number, now = Date.now()): string {
  switch (certUrgency(expiryDate, now)) {
    case "expired": return "text-red-700 font-bold";
    case "final": return "text-red-700 font-semibold";
    case "warning": return "text-amber-700 font-semibold";
    default: return "";
  }
}
