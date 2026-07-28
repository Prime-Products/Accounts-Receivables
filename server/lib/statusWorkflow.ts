/**
 * Unified group Account Status workflow:
 *   Normal → Problematic → Under Review → On Hold → Legal
 *
 * - "Problematic" is flagged automatically by the forecast rule (Expected < 80%
 *   of Overdue EOM) or set manually. A manual status always overrides the rule;
 *   picking "Normal" clears the flag, "Auto" means "follow the rule".
 * - "Under Review", "On Hold" and "Legal" are manual decisions (Under Review is
 *   the step before deciding to put a group On Hold).
 * - There is no automatic escalation between statuses.
 *
 * Legacy values stored in older rows are mapped: "On Watch" and "Critical" →
 * Problematic, "Resolved" → Normal (flag cleared), "Eligible for On Hold" → On Hold.
 */
export const GROUP_STATUSES = ["Normal", "Problematic", "Under Review", "On Hold", "Legal"] as const;
export type GroupStatus = (typeof GROUP_STATUSES)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

export interface StatusRowLike {
  status: string;
  problematicSince: number | null;
}

/** Map legacy stored values onto the unified 5-status set (or "Auto"/"Normal"). */
export function normalizeStoredStatus(raw: string): string {
  if (raw === "On Watch" || raw === "Critical") return "Problematic";
  if (raw === "Resolved") return "Normal";
  if (raw === "Eligible for On Hold") return "On Hold";
  return raw;
}

/**
 * Resolve the effective Account Status of a group.
 *
 * @param row             the group_watch_status row (or null when none exists)
 * @param autoProblematic whether the forecast rule currently flags the group
 * @param now             current epoch ms (kept for call-site compatibility)
 * @returns effective status, or null for "Normal" (no badge shown)
 */
export function resolveGroupStatus(
  row: StatusRowLike | null | undefined,
  autoProblematic: boolean,
  now = Date.now(),
): { status: GroupStatus | null; problematicSince: number | null; escalated: boolean } {
  void now;
  const manual = normalizeStoredStatus(row?.status ?? "Auto");
  const since = row?.problematicSince ?? null;
  // Hard manual states win outright
  if (manual === "Under Review" || manual === "On Hold" || manual === "Legal") {
    return { status: manual as GroupStatus, problematicSince: since, escalated: false };
  }
  if (manual === "Normal") return { status: null, problematicSince: null, escalated: false };
  // Problematic (manual) or Auto + rule-flagged
  const isProblematic = manual === "Problematic" || (manual === "Auto" && autoProblematic);
  if (!isProblematic) return { status: null, problematicSince: null, escalated: false };
  return { status: "Problematic", problematicSince: since, escalated: false };
}

/** Days a group has been Problematic (display only). */
export function problematicDays(problematicSince: number | null, now = Date.now()): number | null {
  if (problematicSince == null) return null;
  return Math.floor((now - problematicSince) / DAY_MS);
}
