/**
 * Unified group status workflow: Normal → Problematic → Critical → Legal / Resolved.
 *
 * - The forecast rule flags a group Problematic automatically (Expected < 80% of
 *   Overdue EOM). A manual status overrides the rule; "Normal" clears the flag,
 *   "Auto" means "follow the rule".
 * - A group that stays Problematic for 30 consecutive days escalates to Critical
 *   automatically (candidate for legal / write-off discussion).
 * - Legal and Resolved are always manual decisions.
 */
export const GROUP_STATUSES = ["Normal", "Problematic", "Critical", "Legal", "Resolved"] as const;
export type GroupStatus = (typeof GROUP_STATUSES)[number];

export const CRITICAL_AFTER_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface StatusRowLike {
  status: string;
  problematicSince: number | null;
}

/**
 * Resolve the effective workflow status of a group.
 *
 * @param row          the group_watch_status row (or null when none exists)
 * @param autoProblematic whether the forecast rule currently flags the group
 * @param now          current epoch ms (injectable for tests)
 * @returns effective status, or null for "Normal" (no badge shown)
 */
export function resolveGroupStatus(
  row: StatusRowLike | null | undefined,
  autoProblematic: boolean,
  now = Date.now(),
): { status: GroupStatus | null; problematicSince: number | null; escalated: boolean } {
  const raw = row?.status ?? "Auto";
  // Legacy value maps to Problematic
  const manual = raw === "On Watch" ? "Problematic" : raw;
  const since = row?.problematicSince ?? null;

  // Hard manual states win outright
  if (manual === "Legal" || manual === "Resolved" || manual === "Critical") {
    return { status: manual, problematicSince: since, escalated: false };
  }
  if (manual === "Normal") return { status: null, problematicSince: null, escalated: false };

  // Problematic (manual) or Auto+rule-flagged → check the 30-day escalation clock
  const isProblematic = manual === "Problematic" || (manual === "Auto" && autoProblematic);
  if (!isProblematic) return { status: null, problematicSince: null, escalated: false };
  if (since != null && now - since >= CRITICAL_AFTER_DAYS * DAY_MS) {
    return { status: "Critical", problematicSince: since, escalated: true };
  }
  return { status: "Problematic", problematicSince: since, escalated: false };
}
