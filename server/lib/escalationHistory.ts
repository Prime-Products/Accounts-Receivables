/**
 * Case history for an escalated task.
 *
 * Management does not want to read KPI tiles on an escalation — they want to know
 * what actually happened: who was called, what the customer answered, which
 * promises were made and broken, how many times the follow-up slipped, and what
 * finally made the collector hand the case over.
 *
 * This module gathers that raw material in one place (chronologically ordered) so
 * the narrative generator has a single, well-shaped input.
 */

/** One thing that happened, in plain chronological order. */
export type CaseEvent = {
  /** Unix ms — used only for ordering and for the date the story quotes. */
  at: number;
  /** What kind of event this was, so the writer can weigh it. */
  kind: "call" | "promise" | "note" | "email" | "task" | "status" | "escalation" | "decision" | "payment";
  /** Short headline, e.g. "Call — Reached" or "Promise €66,666 due 06/08/2026". */
  what: string;
  /** Free text captured at the time (call notes, note body, completion notes). */
  detail?: string | null;
  /** Who did it, when known. */
  who?: string | null;
};

const DAY = 86400000;

export function daysBetween(from: number, to: number): number {
  return Math.floor((to - from) / DAY);
}

/** dd/mm/yyyy — the format the rest of the app already shows. */
export function shortDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-GB", { timeZone: "UTC" });
}

const money = (n: number, currency = "EUR") =>
  `${currency === "EUR" ? "€" : currency + " "}${Math.round(n).toLocaleString("en-US")}`;

/**
 * Activity-log rows are the spine of the history: calls, notes, emails and
 * status changes all land there. Titles carry the outcome ("Call logged —
 * Reached"), descriptions carry the contact name and the collector's notes.
 */
export function eventsFromActivity(
  rows: Array<{
    activityType: string;
    title: string;
    description?: string | null;
    createdAt: Date | number;
    createdBy?: number | null;
  }>,
  nameOf?: (id: number | null | undefined) => string | null
): CaseEvent[] {
  return rows.map(r => {
    const at = r.createdAt instanceof Date ? r.createdAt.getTime() : Number(r.createdAt);
    const kind: CaseEvent["kind"] =
      r.activityType === "call"
        ? "call"
        : r.activityType === "promise"
          ? "promise"
          : r.activityType === "email"
            ? "email"
            : r.activityType === "task"
              ? "task"
              : r.activityType === "status_change"
                ? "status"
                : "note";
    return {
      at,
      kind,
      what: r.title,
      detail: r.description ?? null,
      who: nameOf?.(r.createdBy) ?? null,
    };
  });
}

/**
 * Promises are the backbone of the "why escalate" argument: a promise that was
 * rescheduled twice and then broken is the strongest signal in the file.
 */
export function eventsFromPromises(
  rows: Array<{
    amount: string | number;
    promisedDate: number;
    status: string;
    notes?: string | null;
    rescheduleCount?: number | null;
    createdAt: Date | number;
    customerId: number;
  }>,
  companyOf?: (id: number) => string | null
): CaseEvent[] {
  return rows.map(p => {
    const at = p.createdAt instanceof Date ? p.createdAt.getTime() : Number(p.createdAt);
    const resched = p.rescheduleCount ?? 0;
    const company = companyOf?.(p.customerId);
    const bits = [
      `Promise ${money(Number(p.amount))} for ${shortDate(Number(p.promisedDate))}`,
      `status ${p.status}`,
      resched > 0 ? `rescheduled ${resched}x` : null,
      company ? `(${company})` : null,
    ].filter(Boolean);
    return { at, kind: "promise", what: bits.join(" · "), detail: p.notes ?? null };
  });
}

/**
 * The task chain shows the effort spent: each follow-up task, how often its due
 * date was pushed back, and how it was closed.
 */
export function eventsFromTasks(
  rows: Array<{
    title: string;
    type?: string | null;
    status: string;
    dueDate?: number | null;
    rescheduleCount?: number | null;
    completionNotes?: string | null;
    createdAt: Date | number;
  }>
): CaseEvent[] {
  return rows.map(t => {
    const at = t.createdAt instanceof Date ? t.createdAt.getTime() : Number(t.createdAt);
    const resched = t.rescheduleCount ?? 0;
    const bits = [
      `Task "${t.title}"`,
      `status ${t.status}`,
      t.dueDate ? `due ${shortDate(Number(t.dueDate))}` : null,
      resched > 0 ? `postponed ${resched}x` : null,
    ].filter(Boolean);
    return { at, kind: "task", what: bits.join(" · "), detail: t.completionNotes ?? null };
  });
}

/** Payments received are the counter-evidence: they prove partial good faith. */
export function eventsFromReceipts(
  rows: Array<{ amount: string | number; receiptDate: number; currency?: string | null; notes?: string | null }>
): CaseEvent[] {
  return rows.map(r => ({
    at: Number(r.receiptDate),
    kind: "payment" as const,
    what: `Payment received ${money(Number(r.amount), r.currency ?? "EUR")}`,
    detail: r.notes ?? null,
  }));
}

/** Group notes written by the collector — often the most explicit context. */
export function eventsFromNotes(
  rows: Array<{ content: string; createdAt: number | Date }>
): CaseEvent[] {
  return rows.map(n => ({
    at: n.createdAt instanceof Date ? n.createdAt.getTime() : Number(n.createdAt),
    kind: "note" as const,
    what: "Note",
    detail: n.content,
  }));
}

/**
 * Merge every source into a single timeline, oldest first, and cap it so the
 * prompt stays bounded. When the history is longer than the cap we keep the most
 * recent events, because that is where the escalation reasoning lives.
 */
export function buildTimeline(sources: CaseEvent[][], limit = 60): CaseEvent[] {
  const all = sources.flat().filter(e => Number.isFinite(e.at));
  all.sort((a, b) => a.at - b.at);
  return all.length > limit ? all.slice(all.length - limit) : all;
}

/**
 * Narrow a group-wide timeline down to the escalated TASK's own story.
 *
 * Management asked for a short read about this task only — not the whole group
 * relationship. The task's story starts when the work that led to it started
 * (the original follow-up/promise task was created) and ends at the escalation.
 * Everything older than that window belongs to the group card, not here.
 *
 * `startedAt` is the creation date of the original task; `escalatedAt` the moment
 * it was handed over. A small grace window before the start keeps the triggering
 * call/promise in scope when it was logged minutes earlier.
 */
export function scopeToTask(
  events: CaseEvent[],
  opts: { startedAt: number | null; escalatedAt: number | null; graceDays?: number; limit?: number }
): CaseEvent[] {
  const grace = (opts.graceDays ?? 3) * DAY;
  const from = opts.startedAt != null ? opts.startedAt - grace : null;
  const to = opts.escalatedAt != null ? opts.escalatedAt + DAY : null;
  const inWindow = events.filter(e => {
    if (from != null && e.at < from) return false;
    if (to != null && e.at > to) return false;
    return true;
  });
  const limit = opts.limit ?? 25;
  return inWindow.length > limit ? inWindow.slice(inWindow.length - limit) : inWindow;
}

/** Counters the narrative can lean on without the writer having to recount. */
export function timelineStats(events: CaseEvent[]) {
  const calls = events.filter(e => e.kind === "call");
  const reached = calls.filter(e => /reached/i.test(e.what) && !/no answer/i.test(e.what)).length;
  const noAnswer = calls.filter(e => /no answer/i.test(e.what)).length;
  const first = events[0]?.at ?? null;
  const last = events[events.length - 1]?.at ?? null;
  return {
    events: events.length,
    calls: calls.length,
    callsReached: reached,
    callsNoAnswer: noAnswer,
    emails: events.filter(e => e.kind === "email").length,
    notes: events.filter(e => e.kind === "note").length,
    payments: events.filter(e => e.kind === "payment").length,
    firstContactAt: first,
    lastContactAt: last,
    /** How long the collector has been working this case, in days. */
    caseAgeDays: first != null && last != null ? daysBetween(first, last) : 0,
  };
}

/**
 * Deterministic fallback story, used when the LLM is unavailable. It is written
 * as prose (not tiles) so the panel never falls back to the layout the story is
 * meant to replace.
 */
export function fallbackStory(input: {
  group: string;
  overdueEur: number;
  overdueCount: number;
  oldestOverdueDays: number;
  promisesTotal: number;
  promisesBroken: number;
  stats: ReturnType<typeof timelineStats>;
  escalatedBy?: string | null;
}): string {
  const s = input.stats;
  const parts: string[] = [];
  if (s.calls > 0) {
    parts.push(
      `Καταγράφηκαν ${s.calls} τηλεφωνικές προσπάθειες` +
        (s.callsReached > 0 ? `, από τις οποίες ${s.callsReached} με επικοινωνία` : "") +
        (s.callsNoAnswer > 0 ? ` και ${s.callsNoAnswer} χωρίς απάντηση` : "") +
        "."
    );
  }
  if (input.promisesTotal > 0) {
    parts.push(
      `Δόθηκαν ${input.promisesTotal} υποσχέσεις πληρωμής` +
        (input.promisesBroken > 0 ? `, από τις οποίες ${input.promisesBroken} αθετήθηκαν` : "") +
        "."
    );
  }
  if (s.payments > 0) parts.push(`Στο διάστημα αυτό εισπράχθηκαν ${s.payments} πληρωμές.`);
  if (parts.length === 0) {
    parts.push("Δεν καταγράφηκαν ενέργειες πάνω σε αυτό το task πριν την κλιμάκωση.");
  }
  parts.push(
    input.escalatedBy
      ? `Η υπόθεση διαβιβάστηκε από ${input.escalatedBy} επειδή οι ενέργειες είσπραξης δεν απέδωσαν.`
      : "Η υπόθεση διαβιβάστηκε στη διοίκηση επειδή οι ενέργειες είσπραξης δεν απέδωσαν."
  );
  return parts.join(" ");
}
