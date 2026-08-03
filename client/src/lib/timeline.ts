import type { TimelineEntry } from "@/components/CommunicationTimeline";

/** Coerce Date | number | string | null into epoch milliseconds (0 when unknown). */
function ms(v: Date | number | string | null | undefined): number {
  if (v == null) return 0;
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** activity_log.activityType → timeline kind. */
function kindFromActivityType(t: string): TimelineEntry["kind"] {
  switch (t) {
    case "call":
      return "call";
    case "promise":
      return "promise";
    case "email":
      return "email";
    case "task":
      return "task";
    case "status_change":
      return "status";
    default:
      return "note";
  }
}

export interface TimelineSources {
  /** Rows from customers.groupDetail.activityLogs (already author-resolved). */
  activityLogs?: Array<{
    id: number;
    activityType: string;
    title: string;
    description?: string | null;
    createdAt: Date | number | string;
    authorName?: string | null;
  }> | null;
  /** Rows from customers.groupActivity.emails. */
  emails?: Array<{
    id: number;
    subject?: string | null;
    body?: string | null;
    status?: string | null;
    sentAt?: number | null;
    createdAt?: Date | number | string | null;
    customerName?: string | null;
  }> | null;
  /** Rows from customers.groupActivity.tasks. */
  tasks?: Array<{
    id: number;
    title: string;
    description?: string | null;
    status: string;
    createdAt?: Date | number | string | null;
    dueDate?: number | null;
    customerName?: string | null;
  }> | null;
  /** Rows from customers.groupActivity.receipts (payments actually received). */
  receipts?: Array<{
    id: number;
    receiptDate: number;
    amount?: string | number | null;
    receiptNumber?: string | null;
    method?: string | null;
    customerName?: string | null;
  }> | null;
  /** Rows from customers.groupNotes. */
  notes?: Array<{
    id: number;
    content?: string | null;
    createdAt?: Date | number | string | null;
    authorName?: string | null;
  }> | null;
}

/**
 * Merge every communication source into one chronological list.
 *
 * The activity log already records calls, promises and status changes, so emails
 * and tasks that are also logged there would appear twice; they are de-duplicated
 * by (kind, timestamp-to-the-minute, title).
 */
export function buildTimeline(sources: TimelineSources): TimelineEntry[] {
  const out: TimelineEntry[] = [];

  for (const a of sources.activityLogs ?? []) {
    out.push({
      id: `log-${a.id}`,
      at: ms(a.createdAt),
      kind: kindFromActivityType(a.activityType),
      title: a.title,
      body: a.description ?? null,
      author: a.authorName ?? null,
    });
  }

  for (const n of sources.notes ?? []) {
    out.push({
      id: `note-${n.id}`,
      at: ms(n.createdAt),
      kind: "note",
      title: "Note",
      body: n.content ?? null,
      author: n.authorName ?? null,
      // Row id travels with the entry so the timeline can edit/delete in place.
      noteId: n.id,
    });
  }

  for (const e of sources.emails ?? []) {
    out.push({
      id: `email-${e.id}`,
      at: e.sentAt ?? ms(e.createdAt),
      kind: "email",
      title: e.subject?.trim() || (e.status === "Failed" ? "Email failed" : "Email sent"),
      body: e.body ?? null,
      author: null,
      company: e.customerName ?? null,
    });
  }

  for (const t of sources.tasks ?? []) {
    out.push({
      id: `task-${t.id}`,
      at: ms(t.createdAt) || (t.dueDate ?? 0),
      kind: "task",
      title: `${t.title} · ${t.status}`,
      body: t.description ?? null,
      company: t.customerName ?? null,
    });
  }

  for (const r of sources.receipts ?? []) {
    out.push({
      id: `receipt-${r.id}`,
      at: r.receiptDate,
      kind: "payment",
      title: r.receiptNumber?.trim() ? `Payment received · ${r.receiptNumber}` : "Payment received",
      author: null,
      company: r.customerName ?? null,
      amount: num(r.amount),
    });
  }

  // Drop entries with no usable timestamp, then de-duplicate.
  const seen = new Set<string>();
  return out
    .filter(e => e.at > 0)
    .sort((a, b) => b.at - a.at)
    .filter(e => {
      const key = `${e.kind}|${Math.floor(e.at / 60000)}|${e.title.slice(0, 60)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
