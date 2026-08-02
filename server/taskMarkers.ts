/**
 * Auto-created call tasks carry their link to the collections workflow as markers
 * inside `task.description`:
 *
 *   `(Follow-up: <group name>)`  → the group's "Pending Follow-up" call task
 *   `(Promise #<id>)`            → the check task of promise #id
 *
 * Parsing these by hand caused a real production bug: `/\(Follow-up: (.+?)\)/`
 * is non-greedy, so a group whose own name contains a closing parenthesis —
 * `EVALEND (TANKERS)`, `MINERVA (MARTINOS)`, `TMS GROUP (TANKERS & BULKERS)` —
 * was captured as `EVALEND (TANKERS`, i.e. the name minus its last character.
 * The confirmation status was then written to that phantom key, so the account
 * card kept showing "Not Contacted" while an escalated task was live.
 *
 * The marker is always the LAST thing appended to the description, so anchoring
 * the capture to the final `)` of the marker recovers the full name. Everything
 * that reads or writes these markers must go through this module.
 */

/** Build the follow-up marker for a group — the single place that defines its shape. */
export function followUpMarker(group: string): string {
  return `(Follow-up: ${group})`;
}

/** Build the promise-check marker for a promise id. */
export function promiseMarker(promiseId: number): string {
  return `(Promise #${promiseId})`;
}

/**
 * Group name carried by a follow-up marker, or null when the description has none.
 *
 * Greedy up to the last `)` on the marker's own line, so parenthesised group
 * names survive. Matching per line keeps later appended lines (escalation notes,
 * `(Escalated-by: N)`) from being swallowed into the name.
 */
export function parseFollowUpGroup(description: string | null | undefined): string | null {
  if (!description) return null;
  for (const line of description.split("\n")) {
    const m = line.match(/\(Follow-up: (.*)\)/);
    if (m) {
      const g = m[1].trim();
      if (g.length > 0) return g;
    }
  }
  return null;
}

/** Promise id carried by a promise-check marker, or null. */
export function parsePromiseId(description: string | null | undefined): number | null {
  if (!description) return null;
  const m = description.match(/\(Promise #(\d+)\)/);
  return m ? Number(m[1]) : null;
}

/** True when the description carries the follow-up marker of exactly this group. */
export function hasFollowUpMarker(description: string | null | undefined, group: string): boolean {
  return parseFollowUpGroup(description) === group;
}

/** True when the description carries any follow-up marker. */
export function hasAnyFollowUpMarker(description: string | null | undefined): boolean {
  return parseFollowUpGroup(description) !== null;
}

/** True when the description carries the check marker of exactly this promise. */
export function hasPromiseMarker(description: string | null | undefined, promiseId: number): boolean {
  return parsePromiseId(description) === promiseId;
}

/**
 * Human-readable confirmation status, matching the labels the UI shows.
 * Kept next to the marker helpers so audit lines, activity logs and task titles
 * all speak the same language as the badge the user is looking at.
 */
const CONFIRMATION_STATUS_LABELS: Record<string, string> = {
  "Not Contacted": "Not Contacted",
  Confirmed: "Promise to Pay",
  "Pending Follow-up": "Pending Follow-up",
  Broken: "Did not confirm",
  Kept: "Paid — Promise Kept",
  Escalated: "Escalated",
};

export function confirmationStatusLabel(status: string): string {
  return CONFIRMATION_STATUS_LABELS[status] ?? status;
}
