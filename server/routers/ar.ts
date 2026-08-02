import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  appRoles,
  confirmationStatuses,
  contactTypes,
  customerTiers,
  invoiceStatuses,
  receiptMethods,
  taskStatuses,
  taskTypes,
} from "../../drizzle/schema";
import { matchScore, matchesAllTokens } from "../../shared/textMatch";
import { parseMentions } from "../../shared/mentions";
import * as db from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { resolveGroupStatus, normalizeStoredStatus } from "../lib/statusWorkflow";
import {
  confirmationStatusLabel,
  followUpMarker,
  promiseMarker,
  taskGroup,
  taskPromiseId,
  isTaskOfGroup,
} from "../taskMarkers";
import {
  buildForecast,
  computeAging,
  computeDso,
  computeCreditRating,
  computeCallPriority,
  daysOverdue,
  DEFAULT_FX_RATES,
  deriveInvoiceStatus,
  aggregateGroupBehavior,
  BehaviorRow,
  getFxRates,
  isOpenInvoice,
  monthRange,
  outstanding,
  outstandingOriginal,
  setFxRates,
  toEur,
} from "../lib/arLogic";
import { buildExcel, buildPdf, TableSpec } from "../lib/exports";
import {
  DEFAULT_TEMPLATES,
  EDITABLE_TEMPLATES,
  mergeTemplates,
  renderTemplate,
  TEMPLATE_PLACEHOLDERS,
} from "../lib/emailTemplates";
import { buildGroupStatement } from "../lib/statement";
import { buildStatementPdf } from "../lib/statementPdf";
import { generateMonthlyForecast } from "../lib/smartForecast";
import { runTaskEngine } from "../lib/taskEngine";
import * as softone from "../lib/softone";
import { invokeLLM } from "../_core/llm";


async function audit(ctx: { user: { id: number; name: string | null } }, action: string, entityType: string, entityId?: string | number, details?: string) {
  try {
    await db.addAudit({
      userId: ctx.user.id,
      userName: ctx.user.name ?? undefined,
      action,
      entityType,
      entityId: entityId !== undefined ? String(entityId) : undefined,
      details,
    });
  } catch (e) {
    console.warn("[Audit] failed", e);
  }
}

async function getAppRole(userId: number): Promise<string> {
  const profile = await db.getOrCreateProfile(userId);
  return profile.appRole;
}

function requireRole(role: string, allowed: string[]) {
  if (!allowed.includes(role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: `This action requires one of the following roles: ${allowed.join(", ")}` });
  }
}

const eur = (n: number) => n.toFixed(2);

function getOrdinalSuffix(num: number): string {
  const j = num % 10;
  const k = num % 100;
  if (j === 1 && k !== 11) return num + "st";
  if (j === 2 && k !== 12) return num + "nd";
  if (j === 3 && k !== 13) return num + "rd";
  return num + "th";
}

/** Timestamp of the last millisecond of the current month (UTC). Invoices due on or before this are "overdue by end of month". */
function endOfCurrentMonth(now = new Date()): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) - 1;
}

/**
 * Confirmation statuses are tracked with a target date (followUpDate).
 * A "Promise to Pay" or "Pending Follow-up" NEVER expires automatically: it stays
 * active until a human logs a new call / changes the status. When the followUpDate
 * passes and the linked auto-task is still open, the badge turns red (taskOverdue)
 * instead of resetting the status.
 *
 * Rolling flow (no full monthly reset): only CLOSED outcomes — "Kept" and
 * "Broken" — reset back to "Not Contacted" at the start of a new month.
 * Active statuses ("Confirmed" / "Pending Follow-up") carry over across months
 * together with their open tasks, so the collector never restarts from zero.
 */
function isConfirmationStale(
  status: string | null | undefined,
  _followUpDate?: number | null | undefined,
  now = new Date(),
  updatedAt?: Date | number | null,
): boolean {
  // "Not Contacted" is always stale (no active follow-up).
  if (!status || status === "Not Contacted") return true;
  // Closed outcomes ("Kept" / "Broken") show for the rest of the month, then
  // reset to Not Contacted when a new month starts.
  if (status === "Kept" || status === "Broken") return isFromPreviousMonth(updatedAt ?? null, now);
  // Active statuses (Confirmed, Pending Follow-up) persist until explicitly
  // changed by a human — no date-based auto-reset, no monthly reset.
  return false;
}

/** True when the row was last updated in a previous calendar month (used for the "carried over" hint). */
function isFromPreviousMonth(updatedAt: Date | number | null | undefined, now = new Date()): boolean {
  if (!updatedAt) return false;
  const d = new Date(updatedAt);
  return d.getUTCFullYear() !== now.getUTCFullYear() || d.getUTCMonth() !== now.getUTCMonth();
}

/** True when a linked auto-task is still open (Pending/In Progress) and past its due date → red badge. */
function isTaskOverdue(task: { status: string; dueDate: number | null } | null | undefined, now = Date.now()): boolean {
  if (!task) return false;
  if (task.status !== "Pending" && task.status !== "In Progress") return false;
  if (!task.dueDate) return false;
  return task.dueDate < now;
}

/** Effective view of a confirmation row: stale → Not Contacted / €0. carriedOver = active status recorded in a previous month. */
function effectiveConfirmation<T extends { status: string; amount: string | null; followUpDate: number | null | undefined; updatedAt?: Date | number | null } | null | undefined>(
  row: T,
): { status: string; amount: number; stale: boolean; carriedOver: boolean } {
  if (!row) return { status: "Not Contacted", amount: 0, stale: false, carriedOver: false };
  if (isConfirmationStale(row.status || null, row.followUpDate, new Date(), row.updatedAt ?? null)) return { status: "Not Contacted", amount: 0, stale: true, carriedOver: false };
  return {
    status: row.status,
    amount: row.amount ? Number(row.amount) : 0,
    stale: false,
    carriedOver: isFromPreviousMonth(row.updatedAt ?? null),
  };
}

/**
 * Create a Promise-to-Pay record for a group (used when a Confirmed status is logged).
 * Resolves the target customer (given id or the group's primary member), creates the promise,
 * logs the activity, and creates a follow-up task on the promised date — same behavior as addPromise.
 */
async function createGroupPromise(
  ctx: { user: { id: number; name: string | null } },
  input: {
    group: string;
    customerId?: number;
    amount?: number;
    promisedDate: number;
    notes?: string;
    contactName?: string;
    /** Team member who owns the promise-check task; falls back to the caller's own member record. */
    assigneeId?: number | null;
  }
) {
  let cust = input.customerId ? await db.getCustomer(input.customerId) : null;
  if (!cust) {
    const customers = await db.listCustomers();
    const members = customers.filter(c => ((c.customerGroup ?? "").trim() || c.name) === input.group);
    if (members.length === 0) return null;
    cust = members[0];
  }
  const amt = input.amount && input.amount > 0 ? input.amount : 0;
  const amtLabel = amt > 0 ? `€${Number(eur(amt)).toLocaleString()}` : "";
  const id = await db.createPromise({
    customerId: cust.id,
    promisedDate: input.promisedDate,
    amount: eur(amt),
    notes: input.notes,
    createdBy: ctx.user.id,
  });
  await audit(ctx, "Record Promise-to-Pay", "promiseToPay", id, `Customer #${cust.id} promised ${amt > 0 ? `€${eur(amt)}` : "payment (no amount)"} by ${new Date(input.promisedDate).toISOString().slice(0, 10)} (from confirmed call)`);
  const groupKey = cust.customerGroup?.trim() ? cust.customerGroup.trim() : cust.name;
  const dateStr = new Date(input.promisedDate).toLocaleDateString("en-GB");
  await db.addActivityLog({
    groupName: groupKey,
    customerId: cust.id,
    activityType: "promise",
    title: amt > 0 ? `Promise-to-Pay: ${amtLabel} by ${dateStr}` : `Promise-to-Pay by ${dateStr}`,
    description: `${cust.name} — confirmed by phone${input.notes ? ` — ${input.notes}` : ""}`,
    createdBy: ctx.user.id,
    createdAt: new Date(),
  }).catch(() => {});
  const taskId = await db.createTask({
    customerId: cust.id,
    type: "Manual",
    title: amt > 0 ? `Promise to Pay — ${amtLabel}` : `Promise to Pay — ${groupKey}`,
    description: `Verify that ${cust.name} paid ${amt > 0 ? `the promised amount of ${amtLabel}` : "the promised payment"} due ${dateStr}.${input.contactName ? ` Contact: ${input.contactName}.` : ""}${input.notes ? ` Notes: ${input.notes}` : ""} (Promise #${id})`,
    dueDate: input.promisedDate,
    status: "Pending",
    assignedTo: ctx.user.id,
    assigneeId: await resolveTaskAssignee(ctx, input.assigneeId),
    // Real columns: the description marker above is only kept so the text still
    // reads well in the task list and for rows written before these columns.
    customerGroup: groupKey,
    promiseId: id,
  } as any);
  await audit(ctx, "Create Task", "task", taskId, `Auto follow-up for promise #${id} (${cust.name})`);
  return id;
}

/**
 * Team member who should own an auto-created call task. An explicitly picked
 * assignee always wins; otherwise the task stays with the colleague who logged
 * the call (their own team-member record), so nothing is silently unassigned.
 */
/**
 * Record a Promise-to-Pay WITHOUT touching the task list.
 *
 * Logging a call must never create work items (user requirement 2/8), but the
 * promise itself is part of what was said on the phone, so it is still stored and
 * written to the timeline. Any follow-up task is created by the user, if wanted.
 */
async function createPromiseRecord(
  ctx: { user: { id: number; name: string | null } },
  input: {
    group: string;
    customerId?: number;
    amount?: number;
    promisedDate: number;
    notes?: string;
    contactName?: string;
    /** Skip the promise activity-log line (the caller already logs the same event). */
    skipActivityLog?: boolean;
  }
) {
  let cust = input.customerId ? await db.getCustomer(input.customerId) : null;
  if (!cust) {
    const customers = await db.listCustomers();
    const members = customers.filter(c => ((c.customerGroup ?? "").trim() || c.name) === input.group);
    if (members.length === 0) return null;
    cust = members[0];
  }
  const amt = input.amount && input.amount > 0 ? input.amount : 0;
  const amtLabel = amt > 0 ? `€${Number(eur(amt)).toLocaleString()}` : "";
  const id = await db.createPromise({
    customerId: cust.id,
    promisedDate: input.promisedDate,
    amount: eur(amt),
    notes: input.notes,
    createdBy: ctx.user.id,
  });
  await audit(
    ctx,
    "Record Promise-to-Pay",
    "promiseToPay",
    id,
    `Customer #${cust.id} promised ${amt > 0 ? `€${eur(amt)}` : "payment (no amount)"} by ${new Date(input.promisedDate).toISOString().slice(0, 10)} (from logged call, no task created)`
  );
  const groupKey = cust.customerGroup?.trim() ? cust.customerGroup.trim() : cust.name;
  const dateStr = new Date(input.promisedDate).toLocaleDateString("en-GB");
  // A promise recorded during a call is already described by that call's own log
  // line, so a second entry here would show the same event twice in the timeline.
  if (!input.skipActivityLog) {
    await db.addActivityLog({
      groupName: groupKey,
      customerId: cust.id,
      activityType: "promise",
      title: amt > 0 ? `Promise-to-Pay: ${amtLabel} by ${dateStr}` : `Promise-to-Pay by ${dateStr}`,
      description: `${cust.name} — confirmed by phone${input.contactName ? ` (${input.contactName})` : ""}${input.notes ? ` — ${input.notes}` : ""}`,
      createdBy: ctx.user.id,
      createdAt: new Date(),
    }).catch(() => {});
  }
  return id;
}

/**
 * Move an existing open promise to a new date/amount, again without touching any
 * task: the customer rescheduled, which is a fact about the promise, not work.
 */
async function reschedulePromiseRecord(
  ctx: { user: { id: number; name: string | null } },
  input: {
    group: string;
    promiseId: number;
    amount: number;
    promisedDate: number;
    notes?: string;
    /** Skip the reschedule activity-log line (the caller already logs the same event). */
    skipActivityLog?: boolean;
  }
) {
  const promise = await db.getPromise(input.promiseId);
  if (!promise || promise.status !== "Pending") return null;
  const cust = await db.getCustomer(promise.customerId);
  const effAmount = input.amount > 0 ? input.amount : Number(promise.amount ?? 0);
  const rLabel = effAmount > 0 ? `€${Number(eur(effAmount)).toLocaleString()}` : "payment";
  const oldDateStr = new Date(promise.promisedDate).toLocaleDateString("en-GB");
  const newDateStr = new Date(input.promisedDate).toLocaleDateString("en-GB");
  const newRescheduleCount = (promise.rescheduleCount ?? 0) + 1;
  const attemptOrdinal = getOrdinalSuffix(newRescheduleCount + 1);
  await db.updatePromise(input.promiseId, {
    promisedDate: input.promisedDate,
    amount: eur(effAmount),
    notes: input.notes ?? promise.notes,
    rescheduleCount: newRescheduleCount,
  });
  await audit(
    ctx,
    "Reschedule Promise-to-Pay",
    "promiseToPay",
    input.promiseId,
    `${input.group}: ${rLabel} moved ${oldDateStr} → ${newDateStr} (${attemptOrdinal} attempt, no task touched)`
  );
  if (!input.skipActivityLog) {
    await db.addActivityLog({
      groupName: input.group,
      customerId: promise.customerId,
      activityType: "promise",
      title: `Payment rescheduled: ${rLabel} — ${oldDateStr} → ${newDateStr} (${attemptOrdinal} attempt)`,
      description: `${cust?.name ?? "—"} moved the promised payment${input.notes ? ` — ${input.notes}` : ""}`,
      createdBy: ctx.user.id,
      createdAt: new Date(),
    }).catch(() => {});
  }
  return input.promiseId;
}

async function resolveTaskAssignee(
  ctx: { user: { id: number } },
  assigneeId?: number | null
): Promise<number | null> {
  if (assigneeId != null) {
    const member = await db.getTeamMemberById(assigneeId).catch(() => null);
    if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Team member not found" });
    return member.id;
  }
  const own = await db.getTeamMemberByUserId(ctx.user.id).catch(() => null);
  return own ? own.id : null;
}

/**
 * When a task changes hands, the previous owner keeps following it as a watcher
 * so they still see whether the payment came in.
 */
async function handOverTask(taskId: number, previousAssigneeId: number | null, nextAssigneeId: number | null) {
  if (nextAssigneeId == null || previousAssigneeId === nextAssigneeId) return;
  await db.updateTask(taskId, { assigneeId: nextAssigneeId } as any);
  if (previousAssigneeId != null) {
    await db.addTaskWatcher(taskId, previousAssigneeId).catch(() => {});
  }
}

/**
 * Find the most recent genuinely open promise for any customer of a group.
 *
 * A promise counts as open only while it still has a live check task. Closing or
 * escalating that task used to leave the promise row `Pending` forever, which made
 * the Log Call dialog claim "an open promise exists" for a group the collector had
 * already dealt with. Promises whose every linked task is Completed/Cancelled are
 * therefore treated as settled, and the stale row is repaired in the background.
 */
async function findOpenGroupPromise(group: string) {
  const customers = await db.listCustomers();
  const members = customers.filter(c => ((c.customerGroup ?? "").trim() || c.name) === group);
  if (members.length === 0) return null;
  const memberIds = new Set(members.map(m => m.id));
  const byId = new Map(members.map(m => [m.id, m]));
  const all = await db.listPromises();
  const pending = all
    .filter(p => p.status === "Pending" && memberIds.has(p.customerId))
    .sort((a, b) => b.id - a.id);
  if (pending.length === 0) return null;

  // Promises created before the check-task era have no linked task at all; those stay
  // open on their own. Only promises that HAD a task and lost it are considered stale.
  const allTasks = await db.listTasks().catch(() => [] as any[]);
  const isLive = (t: { status: string }) => t.status !== "Completed" && t.status !== "Cancelled";

  for (const p of pending) {
    const linked = allTasks.filter(t => taskPromiseId(t) === p.id);
    if (linked.length === 0 || linked.some(isLive)) {
      return { ...p, customerName: byId.get(p.customerId)?.name ?? "—" };
    }
    // Stale: the check task was closed/escalated but the promise was never settled.
    await db.updatePromise(p.id, { status: "Broken" }).catch(() => {});
  }
  return null;
}

/**
 * Open (not fully allocated) wire transfers for a set of customers — the
 * "payments on account" rows of the transactions list. Fully allocated
 * transfers are hidden (like paid invoices); internal inter-office transfers
 * are excluded. Remaining = amount − sum(allocations).
 */
async function listOpenWireTransfers(customerIds: Set<number>, customerNames: Map<number, string>) {
  const all = await db.listAllWireTransfers().catch(() => []);
  const mine = all.filter(t => customerIds.has(t.customerId) && !t.isInternal);
  if (mine.length === 0) return [];
  const allocated = await db.sumAllocationsByWireTransferIds(mine.map(t => t.id)).catch(() => new Map<number, number>());
  return mine
    .map(t => {
      const alloc = allocated.get(t.id) ?? 0;
      const unallocated = Number(t.amount) - alloc;
      return {
        id: t.id,
        customerId: t.customerId,
        customerName: customerNames.get(t.customerId) ?? "—",
        amount: Number(t.amount),
        allocated: alloc,
        unallocated,
        unallocatedEur: toEur(unallocated, t.currency ?? "EUR"),
        currency: t.currency ?? "EUR",
        transferDate: t.transferDate,
        status: t.status,
        referenceNumber: t.referenceNumber ?? null,
        branch: t.branch ?? null,
        notes: t.notes ?? null,
      };
    })
    .filter(t => t.unallocated > 0.005)
    .sort((a, b) => b.transferDate - a.transferDate);
}

/**
 * Open (not yet matched) credit notes for a set of customers — the "credit notes"
 * rows of the transactions list. Like payments on account they reduce what the
 * customer owes, and they are NEVER matched to invoices automatically: `openAmount`
 * comes from the ERP and manual allocations are subtracted from it. Fully matched
 * credit notes disappear from the list (like paid invoices).
 */
async function listOpenCreditNotes(customerIds: Set<number>, customerNames: Map<number, string>) {
  const ids = Array.from(customerIds);
  if (ids.length === 0) return [];
  const rows = await db.listCreditNotesByCustomerIds(ids).catch(() => []);
  if (rows.length === 0) return [];
  const allocated = await db
    .sumAllocationsByCreditNoteIds(rows.map(r => r.id))
    .catch(() => new Map<number, number>());
  const vesselRows = await db.listVessels().catch(() => []);
  const vesselName = new Map(vesselRows.map(v => [v.id, v.name]));
  return rows
    .map(r => {
      const alloc = allocated.get(r.id) ?? 0;
      const open = Number(r.openAmount) - alloc;
      return {
        id: r.id,
        customerId: r.customerId,
        customerName: customerNames.get(r.customerId) ?? "—",
        docNumber: r.docNumber,
        docDate: r.docDate,
        currency: r.currency ?? "EUR",
        amount: Number(r.amount),
        allocated: alloc,
        open,
        openEur: toEur(open, r.currency ?? "EUR"),
        branch: r.branch ?? null,
        vesselId: r.vesselId ?? null,
        vesselName: r.vesselId ? (vesselName.get(r.vesselId) ?? null) : null,
        contractNo: r.contractNo ?? null,
        notes: r.notes ?? null,
      };
    })
    .filter(r => r.open > 0.005)
    .sort((a, b) => b.docDate - a.docDate);
}

/**
 * Reschedule an existing open promise to a new date/amount (customer moved the payment).
 * Updates the promise row, moves the linked follow-up task's due date, and logs the change.
 */
async function rescheduleGroupPromise(
  ctx: { user: { id: number; name: string | null } },
  input: {
    group: string;
    promiseId: number;
    amount: number;
    promisedDate: number;
    notes?: string;
    /** Reassign the linked promise-check task when a different colleague is picked. */
    assigneeId?: number | null;
  }
) {
  const promise = await db.getPromise(input.promiseId);
  if (!promise || promise.status !== "Pending") return null;
  const cust = await db.getCustomer(promise.customerId);
  // If no new amount is provided (0), keep the existing promise amount.
  const effAmount = input.amount > 0 ? input.amount : Number(promise.amount ?? 0);
  const rLabel = effAmount > 0 ? `€${Number(eur(effAmount)).toLocaleString()}` : "payment";
  const oldDateStr = new Date(promise.promisedDate).toLocaleDateString("en-GB");
  const newDateStr = new Date(input.promisedDate).toLocaleDateString("en-GB");
  
  // Increment rescheduleCount
  const newRescheduleCount = (promise.rescheduleCount ?? 0) + 1;
  const attemptOrdinal = getOrdinalSuffix(newRescheduleCount + 1); // +1 because count starts at 0
  
  await db.updatePromise(input.promiseId, {
    promisedDate: input.promisedDate,
    amount: eur(effAmount),
    notes: input.notes ?? promise.notes,
    rescheduleCount: newRescheduleCount,
  });
  await audit(ctx, "Reschedule Promise-to-Pay", "promiseToPay", input.promiseId, `${input.group}: ${rLabel} moved ${oldDateStr} → ${newDateStr} (${attemptOrdinal} attempt)`);
  await db.addActivityLog({
    groupName: input.group,
    customerId: promise.customerId,
    activityType: "promise",
    title: `Payment rescheduled: ${rLabel} — ${oldDateStr} → ${newDateStr} (${attemptOrdinal} attempt)`,
    description: `${cust?.name ?? "—"} moved the promised payment${input.notes ? ` — ${input.notes}` : ""}`,
    createdBy: ctx.user.id,
    createdAt: new Date(),
  }).catch(() => {});
  // Move the linked follow-up task (identified by "(Promise #id)" marker) to the new date.
  const marker = promiseMarker(input.promiseId);
  const openTasks = await db.listTasks({ statuses: ["Pending", "In Progress"] });
  const linked = openTasks.find(t => taskPromiseId(t) === input.promiseId);
  if (linked) {
    await db.updateTask(linked.id, {
      title: effAmount > 0 ? `Promise to Pay — ${rLabel}` : `Promise to Pay — ${input.group}`,
      description: `Verify that ${cust?.name ?? "the customer"} paid ${effAmount > 0 ? `the promised amount of ${rLabel}` : "the promised payment"} due ${newDateStr}.${input.notes ? ` Notes: ${input.notes}` : ""} ${marker}`,
      dueDate: input.promisedDate,
    });
    if (input.assigneeId != null) {
      await handOverTask(linked.id, (linked as any).assigneeId ?? null, await resolveTaskAssignee(ctx, input.assigneeId));
    }
    await audit(ctx, "Update Task", "task", linked.id, `Follow-up moved to ${newDateStr} (promise #${input.promiseId} rescheduled)`);
  }
  return input.promiseId;
}

/**
 * Create (or reschedule) a follow-up-call task when a group's confirmation status
 * is set to "Pending Follow-up" with a follow-up date. Reuses an existing open
 * follow-up task for the same group instead of creating duplicates.
 */
async function upsertFollowUpTask(
  ctx: { user: { id: number; name: string | null } },
  input: {
    group: string;
    customerId?: number;
    followUpDate: number;
    amount?: number;
    notes?: string;
    contactName?: string;
    /** Team member who owns the follow-up call; falls back to the caller. */
    assigneeId?: number | null;
  }
) {
  let cust = input.customerId ? await db.getCustomer(input.customerId) : null;
  if (!cust) {
    const customers = await db.listCustomers();
    const members = customers.filter(c => ((c.customerGroup ?? "").trim() || c.name) === input.group);
    if (members.length === 0) return null;
    cust = members[0];
  }
  const marker = followUpMarker(input.group);
  const dateStr = new Date(input.followUpDate).toLocaleDateString("en-GB");
  const amountStr = input.amount && input.amount > 0 ? ` — expected €${Number(eur(input.amount)).toLocaleString()}` : "";
  const title = `Follow-up call — ${input.group}${amountStr}`;
  const contactStr = input.contactName ? ` Contact: ${input.contactName}.` : "";
  const description = `Call ${input.group} on ${dateStr} to confirm the expected payment${amountStr}.${contactStr}${input.notes ? ` Notes: ${input.notes}` : ""} ${marker}`;

  // Reuse an existing open follow-up task for this group (avoid duplicates)
  const openTasks = await db.listTasks({ statuses: ["Pending", "In Progress"] });
  const existing = openTasks.find(t => isTaskOfGroup(t, input.group));
  if (existing) {
    // Only count it as a reschedule when the date actually moved.
    const dateChanged = existing.dueDate !== input.followUpDate;
    await db.updateTask(existing.id, {
      title,
      description,
      dueDate: input.followUpDate,
      ...(dateChanged ? { rescheduleCount: (existing.rescheduleCount ?? 0) + 1 } : {}),
    });
    if (input.assigneeId != null) {
      await handOverTask(existing.id, (existing as any).assigneeId ?? null, await resolveTaskAssignee(ctx, input.assigneeId));
    }
    await audit(
      ctx,
      "Update Task",
      "task",
      existing.id,
      dateChanged
        ? `Follow-up rescheduled to ${dateStr} (${input.group}) — reschedule #${(existing.rescheduleCount ?? 0) + 1}`
        : `Follow-up updated (${input.group})`
    );
    return existing.id;
  }
  const taskId = await db.createTask({
    customerId: cust.id,
    type: "Manual",
    title,
    description,
    dueDate: input.followUpDate,
    status: "Pending",
    assignedTo: ctx.user.id,
    assigneeId: await resolveTaskAssignee(ctx, input.assigneeId),
    customerGroup: input.group,
  } as any);
  await audit(ctx, "Create Task", "task", taskId, `Auto follow-up call task for ${input.group} on ${dateStr}`);
  return taskId;
}

/**
 * Cancel auto-created artifacts that no longer match the group's new confirmation status:
 * - leaving "Pending Follow-up" → cancel the open "Follow-up call" task
 * - leaving "Confirmed" (Promise to Pay) → cancel the open promise-check task and mark the open promise Broken? No —
 *   we only cancel the task and leave the promise history intact unless the new status is Broken/Not Contacted,
 *   in which case the open promise is cancelled too (customer withdrew the promise).
 */
async function cleanupStatusArtifacts(
  ctx: { user: { id: number; name: string | null } },
  input: { group: string; previousStatus: string | null; newStatus: string }
) {
  // Same-status re-saves are normally handled by the upsert helpers (e.g. Pending →
  // Pending reschedule) — but "Not Contacted" / "Broken" re-saves must still sweep
  // stale open promises (promises can be created directly from the Promises page,
  // leaving them orphaned from the confirmation-status workflow).
  const sweepStatuses = ["Not Contacted", "Broken"];
  if (input.previousStatus === input.newStatus && !sweepStatuses.includes(input.newStatus)) return;
  const openTasks = await db.listTasks({ statuses: ["Pending", "In Progress"] });

  // Any status other than "Pending Follow-up" makes an open follow-up call task obsolete —
  // regardless of what the recorded previous status was (covers Confirmed→Broken sequences
  // where a follow-up task from an earlier Pending state was left open).
  if (input.newStatus !== "Pending Follow-up") {
    const linked = openTasks.filter(t => isTaskOfGroup(t, input.group));
    for (const t of linked) {
      await db.updateTask(t.id, {
        status: "Cancelled",
        completionNotes: `Status changed to ${input.newStatus} — follow-up task auto-cancelled`,
      });
      await audit(ctx, "Cancel Task", "task", t.id, `Follow-up task cancelled (status → ${input.newStatus})`);
    }
  }

  // "Not Contacted" and "Broken" mean "there is no active promise" — cancel ALL open
  // promises of the group and their linked check tasks, regardless of the previous
  // status (promises can also be created directly from the Promises page, so the
  // confirmation status row may never have been "Confirmed").
  // Leaving "Confirmed" to any other status also cancels the open promise(s).
  const promisesObsolete =
    input.newStatus === "Not Contacted" ||
    input.newStatus === "Broken" ||
    (input.previousStatus === "Confirmed" && input.newStatus !== "Confirmed");
  if (promisesObsolete) {
    // Cancel every open promise (not just the newest) so nothing stale lingers.
    for (let guard = 0; guard < 20; guard++) {
      const open = await findOpenGroupPromise(input.group);
      if (!open) break;
      await db.updatePromise(open.id, { status: "Broken" });
      await audit(ctx, "Cancel Promise-to-Pay", "promiseToPay", open.id, `${input.group}: promise cancelled (status → ${input.newStatus})`);
      const linked = openTasks.filter(t => taskPromiseId(t) === open.id);
      for (const t of linked) {
        await db.updateTask(t.id, {
          status: "Cancelled",
          completionNotes: `Status changed to ${input.newStatus} — promise check task auto-cancelled`,
        });
        await audit(ctx, "Cancel Task", "task", t.id, `Promise check task cancelled (status → ${input.newStatus})`);
      }
      await db.addActivityLog({
        groupName: input.group,
        customerId: open.customerId,
        activityType: "promise",
        title: `Promise cancelled — status changed to ${input.newStatus}`,
        description: `Open promise of €${Number(open.amount).toLocaleString()} was cancelled because the confirmation status changed.`,
        createdBy: ctx.user.id,
        createdAt: new Date(),
      }).catch(() => {});
    }
  }
}

export const customersRouter = router({
  /** Global search across groups, companies, invoices, notes, and tasks. */
  search: protectedProcedure
    .input(z.object({ query: z.string().min(2).max(100) }))
    .query(async ({ input }) => {
      const q = input.query.trim();
      const [res, allCustomers] = await Promise.all([db.globalSearch(q), db.listCustomers()]);
      const custById = new Map(allCustomers.map(c => [c.id, c]));
      const groupKeyOf = (c: { customerGroup: string | null; name: string }) => (c.customerGroup ?? "").trim() || c.name;
      // SQL prefiltered on one word only, so drop rows where not every typed word
      // is present. Greek/Latin spellings and word order are handled by the helper.
      const matchedCustomers = res.customers.filter(c =>
        matchesAllTokens(q, [c.name, c.code, c.customerGroup]),
      );
      const matchedContacts = (res.contacts ?? [])
        .filter(c => matchesAllTokens(q, [c.name, c.email, c.title, c.customerName, c.customerGroup]))
        .sort(
          (a, b) =>
            matchScore(q, [b.name, b.email]) - matchScore(q, [a.name, a.email]) ||
            a.name.localeCompare(b.name),
        );
      const matchedVessels = (res.vessels ?? [])
        .filter(v => matchesAllTokens(q, [v.name, v.imo, v.customerName, v.customerGroup]))
        .sort((a, b) => matchScore(q, [b.name]) - matchScore(q, [a.name]) || a.name.localeCompare(b.name));
      // Distinct groups matched via customer name/group, plus groups reached
      // through a matching contact or vessel, so searching a person's name also
      // surfaces the group they belong to.
      const groups = new Map<string, number>();
      for (const c of matchedCustomers) {
        const key = (c.customerGroup ?? "").trim() || c.name;
        groups.set(key, (groups.get(key) ?? 0) + 1);
      }
      for (const extra of [...matchedContacts, ...matchedVessels]) {
        const cust = extra.customerId ? custById.get(extra.customerId) : undefined;
        if (!cust) continue;
        const key = groupKeyOf(cust);
        if (!groups.has(key)) groups.set(key, 1);
      }
      const lower = q.toLowerCase();
      return {
        groups: Array.from(groups.entries())
          .sort((a, b) => Number(b[0].toLowerCase().includes(lower)) - Number(a[0].toLowerCase().includes(lower)))
          .slice(0, 8)
          .map(([name, members]) => ({ name, members })),
        companies: matchedCustomers.slice(0, 8).map(c => ({
          id: c.id,
          name: c.name,
          code: c.code,
          group: (c.customerGroup ?? "").trim() || c.name,
        })),
        contacts: matchedContacts.slice(0, 8).map(c => ({
          id: c.id,
          name: c.name,
          email: c.email,
          phone: c.phone,
          title: c.title,
          contactType: c.contactType,
          customerId: c.customerId,
          companyName: c.customerName ?? null,
          group: c.customerGroup?.trim() || c.customerName || null,
        })),
        vessels: matchedVessels.slice(0, 8).map(v => ({
          id: v.id,
          name: v.name,
          imo: v.imo,
          vesselType: v.vesselType,
          flag: v.flag,
          customerId: v.customerId,
          companyName: v.customerName ?? null,
          group: v.customerGroup?.trim() || v.customerName || null,
        })),
        invoices: res.invoices.map(i => {
          const cust = custById.get(i.customerId);
          return {
            id: i.id,
            invoiceNumber: i.invoiceNumber,
            amount: Number(i.amount),
            status: i.status,
            dueDate: i.dueDate,
            customerName: cust?.name ?? "",
            group: cust ? groupKeyOf(cust) : "",
            vesselName: (i as any).vesselName ?? null,
          };
        }),
        notes: res.notes.map(n => ({
          id: n.id,
          group: n.groupName,
          excerpt: n.content.length > 120 ? `${n.content.slice(0, 120)}…` : n.content,
          createdAt: n.createdAt,
        })),
        tasks: res.tasks.map(t => {
          const cust = t.customerId ? custById.get(t.customerId) : undefined;
          return {
            id: t.id,
            title: t.title,
            status: t.status,
            dueDate: t.dueDate,
            group: cust ? groupKeyOf(cust) : null,
          };
        }),
        transfers: (res.transfers ?? []).map(t => ({
          id: t.id,
          customerName: t.customerName,
          amount: Number(t.amount),
          currency: t.currency,
          transferDate: t.transferDate,
          status: t.status,
          branch: t.branch,
          referenceNumber: t.referenceNumber,
          isInternal: !!t.isInternal,
        })),
        payments: (res.allocations ?? []).map(a => ({
          id: a.id,
          wireTransferId: a.wireTransferId,
          amount: Number(a.amount),
          currency: a.transferCurrency,
          invoiceNumber: a.invoiceNumber,
          invoiceId: a.invoiceId,
          payerName: a.payerName,
          creditedName: a.creditedName,
          transferAmount: Number(a.transferAmount),
          transferDate: a.transferDate,
          transferReference: a.transferReference,
        })),
      };
    }),
  list: protectedProcedure.query(async () => {
    const [customers, invoices, behavior, allPromises] = await Promise.all([
      db.listCustomers(),
      db.listInvoices(),
      db.listPaymentBehaviorWithGroup().catch(() => []),
      db.listPromises(),
    ]);
    const now = Date.now();
    const eom = endOfCurrentMonth();
    const behaviorById = new Map(behavior.map(b => [b.customerId, b]));
    const promisesById = new Map<number, { kept: number; broken: number }>();
    for (const p of allPromises) {
      const e = promisesById.get(p.customerId) ?? { kept: 0, broken: 0 };
      if (p.status === "Kept") e.kept++;
      else if (p.status === "Broken") e.broken++;
      promisesById.set(p.customerId, e);
    }
    const day90 = 90 * 24 * 60 * 60 * 1000;
    return customers.map(c => {
      const custInvoices = invoices.filter(i => i.customerId === c.id);
      const open = custInvoices.filter(isOpenInvoice);
      const overdue = open.filter(i => now > i.dueDate);
      const overdueEom = open.filter(i => i.dueDate <= eom);
      const openBalance = open.reduce((s, i) => s + outstanding(i), 0);
      const overdueBalance = overdue.reduce((s, i) => s + outstanding(i), 0);
      const overdue90Plus = overdue.filter(i => now - i.dueDate > day90).reduce((s, i) => s + outstanding(i), 0);
      const beh = behaviorById.get(c.id);
      const prom = promisesById.get(c.id) ?? { kept: 0, broken: 0 };
      const ratingResult = computeCreditRating({
        daysLate: beh?.medianDaysLate ?? beh?.avgDaysLate ?? null,
        openBalance,
        overdueBalance,
        overdue90Plus,
        promisesKept: prom.kept,
        promisesBroken: prom.broken,
        // Per-company view: status lives at group level; neutral here.
        onHoldStatus: "Normal",
        turnoverYtd: c.turnoverYtd != null ? Number(c.turnoverYtd) : null,
        turnoverLastYear: c.turnoverLastYear != null ? Number(c.turnoverLastYear) : null,
      });
      return {
        ...c,
        openBalance,
        overdueBalance,
        overdueEomBalance: overdueEom.reduce((s, i) => s + outstanding(i), 0),
        overdueCount: overdue.length,
        /**
         * False for companies imported from the CRM purely so their contacts exist
         * — they have never been invoiced and must stay out of the collections views.
         */
        hasLedger: custInvoices.length > 0,
        rating: ratingResult.rating,
        ratingScore: ratingResult.score,
        /**
         * Compact score breakdown for the Companies-tab tooltip: "label points/max"
         * per factor, one string per row. The structured objects with per-factor
         * detail sentences added ~2 MB to this response; the full explanation
         * stays on the group detail page.
         */
        ratingBreakdown: ratingResult.factors.map(f => `${f.label} ${f.points}/${f.max}`).join(" · "),
      };
    });
  }),
  /**
   * Minimal customer list for dropdown pickers (contract, report, receipt, task
   * dialogs). `list` computes balances and a credit-score breakdown for every
   * company — several megabytes — which a picker never reads.
   */
  options: protectedProcedure.query(async () => {
    const customers = await db.listCustomers();
    return customers
      .map(c => ({
        id: c.id,
        code: c.code,
        name: c.name,
        customerGroup: c.customerGroup,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }),
  /**
   * The companies of one group with their open balance — what the Log Call
   * dialog needs to pick which entity a call is about. Scoped to the group so
   * the dialog never pulls the whole customer ledger.
   */
  groupMembers: protectedProcedure.input(z.object({ group: z.string().min(1) })).query(async ({ input }) => {
    const [customers, invoices] = await Promise.all([db.listCustomers(), db.listInvoices()]);
    const members = customers.filter(c => ((c.customerGroup ?? "").trim() || c.name) === input.group);
    const ids = new Set(members.map(c => c.id));
    const openByCustomer = new Map<number, number>();
    for (const i of invoices) {
      if (!ids.has(i.customerId) || !isOpenInvoice(i)) continue;
      openByCustomer.set(i.customerId, (openByCustomer.get(i.customerId) ?? 0) + outstanding(i));
    }
    return members
      .map(c => ({ id: c.id, name: c.name, openBalance: openByCustomer.get(c.id) ?? 0 }))
      .sort((a, b) => b.openBalance - a.openBalance);
  }),
  /** Group-level view: aggregated totals per customer group. */
  groups: protectedProcedure.query(async () => {
    const now = Date.now();
    const today = new Date();
    const monthStart = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1);
    const monthEnd = Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1);
    // Day boundaries for "due today" detection (dates are stored at UTC midnight).
    const startOfToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const endOfToday = startOfToday + 24 * 60 * 60 * 1000 - 1;
    const [customers, invoices, forecastRows, behavior, allPromises, watchRows, receipts, confirmationStatuses, monthWires] = await Promise.all([
      db.listCustomers(),
      db.listInvoices(),
      db.listForecastEntries(today.getUTCFullYear(), today.getUTCMonth() + 1),
      db.listPaymentBehaviorWithGroup().catch(() => []),
      db.listPromises(),
      db.listGroupWatchStatuses().catch(() => []),
      db.listReceiptsInRange(monthStart, monthEnd),
      db.listGroupConfirmationStatuses().catch(() => []),
      db.listReceivedWireTransfersInRange(monthStart, monthEnd).catch(() => []),
    ]);
    // Open auto-created tasks — used to link the confirmation badge to its task:
    // "Pending Follow-up" → task with "(Follow-up: <group>)" marker;
    // "Promise to Pay" → promise-check task with "(Promise #<id>)" marker.
    const openAutoTasks = (await db.listTasks({ statuses: ["Pending", "In Progress"] })).filter(
      t => taskGroup(t) !== null || taskPromiseId(t) !== null,
    );
    const followUpTaskByGroup = new Map<string, { id: number; status: string; dueDate: number | null }>();
    const promiseTaskByPromiseId = new Map<number, { id: number; status: string; dueDate: number | null }>();
    for (const t of openAutoTasks) {
      const fg = taskGroup(t);
      if (fg && !followUpTaskByGroup.has(fg)) followUpTaskByGroup.set(fg, { id: t.id, status: t.status, dueDate: t.dueDate ?? null });
      const pm = t.description?.match(/\(Promise #(\d+)\)/);
      if (pm && !promiseTaskByPromiseId.has(Number(pm[1]))) promiseTaskByPromiseId.set(Number(pm[1]), { id: t.id, status: t.status, dueDate: t.dueDate ?? null });
    }
    const eom = endOfCurrentMonth();
    const collectedByCustomer = new Map<number, number>();
    for (const r of receipts) {
      if (r.receiptDate >= monthStart && r.receiptDate < monthEnd) {
        collectedByCustomer.set(r.customerId, (collectedByCustomer.get(r.customerId) ?? 0) + Number(r.amount));
      }
    }
    // Received wire transfers count as collected within the month (manual invoice matching happens separately)
    for (const w of monthWires) {
      collectedByCustomer.set(w.customerId, (collectedByCustomer.get(w.customerId) ?? 0) + Number(w.amount));
    }
    const watchByGroup = new Map<string, { status: string; problematicSince: number | null }>();
    for (const w of watchRows) {
      watchByGroup.set(w.groupName, { status: w.status, problematicSince: w.problematicSince ?? null });
    }
    const confirmationByGroup = new Map<string, any>();
    for (const c of confirmationStatuses) {
      confirmationByGroup.set(c.groupName, c);
    }
   const forecastByGroup = new Map<string, number>();
    for (const f of forecastRows) {
      const key = (f.customerGroup ?? "").trim();
      if (!key) continue;
      forecastByGroup.set(key, (forecastByGroup.get(key) ?? 0) + Number(f.expectedAmount));
    }
    const forecastInitialByGroup = new Map<string, number>();
    for (const f of forecastRows) {
      const key = (f.customerGroup ?? "").trim();
      if (!key) continue;
      forecastInitialByGroup.set(key, (forecastInitialByGroup.get(key) ?? 0) + Number((f as any).initialForecast ?? 0));
    }
    const byCustomer = new Map<number, typeof invoices>();
    for (const inv of invoices) {
      const arr = byCustomer.get(inv.customerId);
      if (arr) arr.push(inv);
      else byCustomer.set(inv.customerId, [inv]);
    }
    // Per-group behavior (weighted) and promise tallies for ratings
    const groupBehavior = aggregateGroupBehavior(behavior as BehaviorRow[]);
    const promisesByCustomer = new Map<number, { kept: number; broken: number }>();
    // Earliest open (Pending) promise date per customer — surfaced under the
    // "Promise to Pay" badge in the groups table (mirrors the follow-up date).
    const openPromiseDateByCustomer = new Map<number, number>();
    // Matching promise id (earliest open promise) — used to find its check task.
    const openPromiseIdByCustomer = new Map<number, number>();
    for (const p of allPromises) {
      const e = promisesByCustomer.get(p.customerId) ?? { kept: 0, broken: 0 };
      if (p.status === "Kept") e.kept++;
      else if (p.status === "Broken") e.broken++;
      else if (p.status === "Pending") {
        const cur = openPromiseDateByCustomer.get(p.customerId);
        if (cur === undefined || p.promisedDate < cur) {
          openPromiseDateByCustomer.set(p.customerId, p.promisedDate);
          openPromiseIdByCustomer.set(p.customerId, p.id);
        }
      }
      promisesByCustomer.set(p.customerId, e);
    }
    const day90 = 90 * 24 * 60 * 60 * 1000;
    const teamById = new Map((await db.listTeamMembers(true)).map(m => [m.id, m]));
    // Who last touched each confirmation status — shown in the list so a stale
    // review is visible without opening the card. Team members are matched by
    // their linked user account; unmatched updaters fall back to the user table.
    const teamByUserId = new Map(
      Array.from(teamById.values())
        .filter(m => (m as any).userId != null)
        .map(m => [(m as any).userId as number, m])
    );
    const userNameById = new Map(
      (await db.listUsers().catch(() => [] as any[])).map((u: any) => [u.id as number, (u.name ?? u.email ?? null) as string | null])
    );
    const reviewerName = (userId: number | null | undefined): string | null => {
      if (userId == null) return null;
      const member = teamByUserId.get(userId);
      if (member) return member.name;
      return userNameById.get(userId) ?? null;
    };
    // Contact activity per group: last call, who made it, how many attempts went
    // unanswered. This is what makes "who has been called" answerable from the list.
    const callSummary = await db.callSummaryByGroup().catch(() => new Map());
    const managerByGroup = new Map<string, { id: number; name: string } | null>();
    const collectorByGroup = new Map<string, { id: number; name: string } | null>();
    const groups = new Map<
      string,
      {
        group: string;
        companyCount: number;
        openBalance: number;
        overdueBalance: number;
        overdueEomBalance: number;
        overdueCount: number;
        openByCurrency: Record<string, number>;
        branches: Set<string>;
        overdue90Plus: number;
        promisesKept: number;
        promisesBroken: number;
        turnoverYtd: number;
        turnoverLastYear: number;
        collected: number;
        openPromiseDate: number | null;
        openPromiseId: number | null;
      }
    >();
    const groupInvoices = new Map<string, typeof invoices>();
    /**
     * Groups that have at least one invoice ever. Contacts-only companies (imported
     * from the CRM so their people are reachable before they owe anything) must not
     * appear in the collections worklist.
     */
    const groupsWithLedger = new Set<string>();
    for (const c of customers) {
      const key = (c.customerGroup ?? "").trim() || c.name;
      if ((byCustomer.get(c.id) ?? []).length > 0) groupsWithLedger.add(key);
      let g = groups.get(key);
      if (!g) {
        g = { group: key, companyCount: 0, openBalance: 0, overdueBalance: 0, overdueEomBalance: 0, overdueCount: 0, openByCurrency: {}, branches: new Set(), overdue90Plus: 0, promisesKept: 0, promisesBroken: 0, turnoverYtd: 0, turnoverLastYear: 0, collected: 0, openPromiseDate: null, openPromiseId: null };
        groups.set(key, g);
      }
      let gInv = groupInvoices.get(key);
      if (!gInv) {
        gInv = [];
        groupInvoices.set(key, gInv);
      }
      g.companyCount += 1;
      if (!managerByGroup.get(key) && c.accountManagerId && teamById.has(c.accountManagerId)) {
        managerByGroup.set(key, { id: c.accountManagerId, name: teamById.get(c.accountManagerId)!.name });
      }
      if (!collectorByGroup.get(key) && (c as any).collectorId && teamById.has((c as any).collectorId)) {
        collectorByGroup.set(key, { id: (c as any).collectorId as number, name: teamById.get((c as any).collectorId)!.name });
      }
      g.turnoverYtd += c.turnoverYtd ? Number(c.turnoverYtd) : 0;
      g.turnoverLastYear += c.turnoverLastYear ? Number(c.turnoverLastYear) : 0;
      g.collected += collectedByCustomer.get(c.id) ?? 0;
      const prom = promisesByCustomer.get(c.id);
      if (prom) {
        g.promisesKept += prom.kept;
        g.promisesBroken += prom.broken;
      }
      const opd = openPromiseDateByCustomer.get(c.id);
      if (opd !== undefined && (g.openPromiseDate === null || opd < g.openPromiseDate)) {
        g.openPromiseDate = opd;
        g.openPromiseId = openPromiseIdByCustomer.get(c.id) ?? null;
      }
      for (const inv of byCustomer.get(c.id) ?? []) {
        if (!isOpenInvoice(inv)) continue;
        gInv.push(inv);
        g.openBalance += outstanding(inv);
        const cur = inv.currency ?? "EUR";
        g.openByCurrency[cur] = (g.openByCurrency[cur] ?? 0) + outstandingOriginal(inv);
        if (inv.company) g.branches.add(inv.company);
        if (now > inv.dueDate) {
          g.overdueBalance += outstanding(inv);
          g.overdueCount += 1;
          if (now - inv.dueDate > day90) g.overdue90Plus += outstanding(inv);
        }
        if (inv.dueDate <= eom) g.overdueEomBalance += outstanding(inv);
      }
    }
    return Array.from(groups.values())
      .filter(g => groupsWithLedger.has(g.group))
      .map(g => {
        const beh = groupBehavior.get(g.group);
        const forecastExpected = forecastByGroup.get(g.group) ?? 0;
        // Business rule: problematic when the month's forecast covers < 80% of what will be overdue by EOM.
        const hasForecast = forecastByGroup.has(g.group);
        const forecastForRule = hasForecast ? forecastExpected : 0;
        const autoProblematic = g.overdueEomBalance > 0 && forecastForRule < 0.8 * g.overdueEomBalance;
        // Unified workflow: Normal → Problematic → Critical → On Hold → Legal.
        const row = watchByGroup.get(g.group) ?? null;
        const resolved = resolveGroupStatus(row, autoProblematic);
        const watchStatus = resolved.status;
        const watchOverride = row && row.status !== "Auto" ? normalizeStoredStatus(row.status) : null;
        const problematic = watchStatus === "Problematic";
        // Rating uses the group's unified account status (companies inherit it).
        const ratingResult = computeCreditRating({
          daysLate: beh?.medianDaysLate ?? beh?.avgDaysLate ?? null,
          openBalance: g.openBalance,
          overdueBalance: g.overdueBalance,
          overdue90Plus: g.overdue90Plus,
          promisesKept: g.promisesKept,
          promisesBroken: g.promisesBroken,
          onHoldStatus: watchStatus,
          turnoverYtd: g.turnoverYtd,
          turnoverLastYear: g.turnoverLastYear,
        });
        const { overdue90Plus, promisesKept, promisesBroken, turnoverYtd, turnoverLastYear, collected, openPromiseDate, openPromiseId, ...rest } = g;
        const confirmation = confirmationByGroup.get(g.group);
        const aging = computeAging(groupInvoices.get(g.group) ?? [], now);
        // Expected to Collect: live estimate driven by log calls.
        // Not Contacted → forecast; Confirmed/Pending → confirmation amount; Broken → 0.
        // A status recorded in a previous month is stale → treated as Not Contacted.
        const conf = effectiveConfirmation(confirmation);
        const confStatus = conf.status;
        const confAmount = conf.amount;
        const expectedToCollect =
          confStatus === "Not Contacted"
            ? forecastExpected
            : confStatus === "Broken"
              ? 0
              : confAmount;
        // Linked task for the badge: Pending Follow-up → the group's follow-up-call
        // task; Promise to Pay → the open promise's check task.
        const confirmationTask =
          confStatus === "Pending Follow-up"
            ? (followUpTaskByGroup.get(g.group) ?? null)
            : confStatus === "Confirmed"
              ? (openPromiseId !== null ? (promiseTaskByPromiseId.get(openPromiseId) ?? null) : null)
              : null;
        const confirmationTaskId = confirmationTask?.id ?? null;
        // Red badge: the linked task is still open and past its due date.
        // Fallback: no linked open task found but the status target date has passed.
        const confirmationTaskOverdue =
          (confStatus === "Pending Follow-up" || confStatus === "Confirmed") &&
          (confirmationTask
            ? isTaskOverdue(confirmationTask, now)
            : ((confirmation?.followUpDate ?? null) !== null && (confirmation!.followUpDate as number) < now));
        // The date this group is waiting on: an open promise date (Promise to Pay)
        // or the status follow-up date. Used by the Desk to say "act on this today"
        // without any task involved.
        const actionDate =
          confStatus === "Confirmed"
            ? openPromiseDate
            : (confirmation?.followUpDate ?? null);
        const actionDue =
          actionDate !== null && actionDate <= endOfToday
            ? (actionDate < startOfToday ? "overdue" : "today")
            : null;
        return {
          ...rest,
          turnoverYtd,
          turnoverLastYear,
          branches: Array.from(g.branches).sort(),
          forecastExpected,
          forecastInitial: forecastInitialByGroup.get(g.group) ?? 0,
          expectedToCollect,
          expectedVariance: expectedToCollect - forecastExpected,
          hasForecast,
          aging: { current: aging.current, currentCount: aging.currentCount, buckets: aging.buckets },
          collected,
          remaining: Math.max(0, forecastExpected - collected),
          forecastCoverage: g.overdueEomBalance > 0 ? forecastExpected / g.overdueEomBalance : null,
          problematic,
          watchStatus,
          watchOverride,
          rating: ratingResult.rating,
          ratingScore: ratingResult.score,
          ratingFactors: ratingResult.factors,
          confirmationStatus: confStatus,
          confirmationAmount: confAmount,
          confirmationFollowUpDate: confirmation?.followUpDate ?? null,
          confirmationCarriedOver: conf.carriedOver,
          confirmationTaskId,
          confirmationTaskOverdue,
          /**
           * Attention signal for the Collections Desk: the date this group is
           * waiting on (promise date or follow-up date) and whether it has come
           * due. Derived live from dates — nothing is generated or cancelled.
           */
          actionDate,
          actionDue,
          /** When this status was last set, and by whom (review freshness). */
          confirmationUpdatedAt: confirmation?.updatedAt ? new Date(confirmation.updatedAt).getTime() : null,
          confirmationUpdatedBy: reviewerName(confirmation?.updatedBy ?? null),
          /** Contact activity — last logged call, its author, and attempt counts. */
          lastCallAt: callSummary.get(g.group)?.lastCallAt ? new Date(callSummary.get(g.group)!.lastCallAt).getTime() : null,
          lastCallBy: reviewerName(callSummary.get(g.group)?.lastCallBy ?? null),
          /** Outcome and free-text note of the most recent call — context before dialling. */
          lastCallOutcome: callSummary.get(g.group)?.lastCallTitle ?? null,
          lastCallNote: callSummary.get(g.group)?.lastCallNote ?? null,
          callCount: callSummary.get(g.group)?.calls ?? 0,
          noAnswerCount: callSummary.get(g.group)?.noAnswer ?? 0,
          accountManager: managerByGroup.get(g.group) ?? null,
          collector: collectorByGroup.get(g.group) ?? null,
          // Earliest open promise date — shown under the "Promise to Pay" badge.
          confirmationPromiseDate: confStatus === "Confirmed" ? openPromiseDate : null,
        };
      })
      // Default order: highest overdue first (user request 29/7); ties → open balance.
      .sort((a, b) => (b.overdueBalance - a.overdueBalance) || (b.openBalance - a.openBalance));
  }),
  /** Group card: aggregates + invoices, scoped by optional member company and/or Prime Branch. */
  groupDetail: protectedProcedure
    .input(
      z.object({
        group: z.string().min(1),
        customerId: z.number().optional(),
        branch: z.string().optional(),
        minDaysOverdue: z.number().int().optional(),
      }),
    )
    .query(async ({ input }) => {
      const customers = await db.listCustomers();
      const members = customers.filter(c => ((c.customerGroup ?? "").trim() || c.name) === input.group);
      if (members.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Group not found" });
      const memberIds = new Set(members.map(m => m.id));
      const [allInvoices, allBehavior, confirmation] = await Promise.all([
        db.listInvoices(),
        db.listPaymentBehaviorWithGroup().catch(() => []),
        db.getGroupConfirmationStatus(input.group).catch(() => null),
      ]);
      const now = Date.now();
      // Full group scope (for the branch list and per-company summary regardless of filters)
      const groupInvoices = allInvoices.filter(i => memberIds.has(i.customerId));
      const branches = Array.from(new Set(groupInvoices.map(i => i.company).filter((b): b is string => !!b))).sort();
      // Filtered scope drives all page data
      const scoped = groupInvoices.filter(
        i =>
          (input.customerId === undefined || i.customerId === input.customerId) &&
          (input.branch === undefined || i.company === input.branch) &&
          true, // Don't filter by minDaysOverdue here; let frontend handle aging bucket filtering
      );
      const aging = computeAging(scoped, now);
      const open = scoped.filter(isOpenInvoice);
      const overdue = open.filter(i => now > i.dueDate);
      const openByCurrency: Record<string, number> = {};
      for (const inv of open) {
        const cur = inv.currency ?? "EUR";
        openByCurrency[cur] = (openByCurrency[cur] ?? 0) + outstandingOriginal(inv);
      }
      // Per-company summary within current branch/aging filter (company filter not applied so the list stays complete)
      const branchScoped = groupInvoices.filter(
        i =>
          (input.branch === undefined || i.company === input.branch) &&
          (input.minDaysOverdue === undefined || (isOpenInvoice(i) && now > i.dueDate && daysOverdue(i.dueDate, now) >= input.minDaysOverdue)),
      );
      const memberBehavior = allBehavior.filter(b => memberIds.has(b.customerId));
      const behaviorByCustomer = new Map(memberBehavior.map(b => [b.customerId, b]));
      const groupBehavior = memberBehavior.length > 0
        ? Array.from(aggregateGroupBehavior(memberBehavior.map(b => ({ ...b, customerGroup: input.group })) as BehaviorRow[]).values())[0] ?? null
        : null;
      // Group-level credit rating (full scope, not filtered)
      const day90 = 90 * 24 * 60 * 60 * 1000;
      const gOpen = groupInvoices.filter(isOpenInvoice);
      const gOverdue = gOpen.filter(i => now > i.dueDate);
     const eomTs = endOfCurrentMonth();
      const gOverdueEom = gOpen.filter(i => i.dueDate <= eomTs).reduce((s, i) => s + outstanding(i), 0);
      // Open amount falling due within the NEXT calendar month (for the Open Balance card subtitle)
      const nmStart = Date.UTC(new Date(eomTs).getUTCFullYear(), new Date(eomTs).getUTCMonth() + 1, 1);
      const nmEnd = Date.UTC(new Date(eomTs).getUTCFullYear(), new Date(eomTs).getUTCMonth() + 2, 0, 23, 59, 59, 999);
      const gDueNextMonth = gOpen.filter(i => i.dueDate > eomTs && i.dueDate >= nmStart && i.dueDate <= nmEnd).reduce((s, i) => s + outstanding(i), 0);
      const memberPromises = (await db.listPromises()).filter(p => memberIds.has(p.customerId));
      const todayD = new Date();
      const forecastRows = await db.listForecastEntries(todayD.getUTCFullYear(), todayD.getUTCMonth() + 1);
      const groupForecast = forecastRows.filter(f => (f.customerGroup ?? "").trim() === input.group).reduce((s, f) => s + Number(f.expectedAmount), 0);
      const hasForecast = forecastRows.some(f => (f.customerGroup ?? "").trim() === input.group);
      const forecastForRule = hasForecast ? groupForecast : 0;
      const problematic = gOverdueEom > 0 && forecastForRule < 0.8 * gOverdueEom;
      const watchRow = await db.getGroupWatchStatus(input.group).catch(() => null);
      const resolvedDetail = resolveGroupStatus(watchRow, problematic);
      const watchStatus = resolvedDetail.status;
      const watchOverride = watchRow && watchRow.status !== "Auto" ? normalizeStoredStatus(watchRow.status) : null;
      // Rating uses the group's unified account status (companies inherit it).
      const ratingResult = computeCreditRating({
        daysLate: groupBehavior?.medianDaysLate ?? groupBehavior?.avgDaysLate ?? null,
        openBalance: gOpen.reduce((s, i) => s + outstanding(i), 0),
        overdueBalance: gOverdue.reduce((s, i) => s + outstanding(i), 0),
        overdue90Plus: gOverdue.filter(i => now - i.dueDate > day90).reduce((s, i) => s + outstanding(i), 0),
        promisesKept: memberPromises.filter(p => p.status === "Kept").length,
        promisesBroken: memberPromises.filter(p => p.status === "Broken").length,
        onHoldStatus: watchStatus,
        turnoverYtd: members.reduce((s, m) => s + (m.turnoverYtd ? Number(m.turnoverYtd) : 0), 0),
        turnoverLastYear: members.reduce((s, m) => s + (m.turnoverLastYear ? Number(m.turnoverLastYear) : 0), 0),
      });
      const companies = members
        .map(m => {
          const mine = branchScoped.filter(i => i.customerId === m.id);
          const mOpen = mine.filter(isOpenInvoice);
          const mOverdue = mOpen.filter(i => now > i.dueDate);
          const beh = behaviorByCustomer.get(m.id);
          return {
            id: m.id,
            name: m.name,
            code: m.code,
            // Companies inherit the group's unified account status.
            onHoldStatus: watchStatus,
            openBalance: mOpen.reduce((s, i) => s + outstanding(i), 0),
            overdueBalance: mOverdue.reduce((s, i) => s + outstanding(i), 0),
            invoiceCount: mOpen.length,
            avgDaysLate: beh?.avgDaysLate ?? null,
            medianDaysLate: beh?.medianDaysLate ?? null,
            historyPayments: beh?.payments ?? 0,
          };
        })
        .sort((a, b) => b.openBalance - a.openBalance);
      // Match the Invoices page ordering: dueDate DESC (newest due first) so
      // not-yet-due invoices appear at the top instead of a wall of old overdue rows.
      const sortedInvoices = [...scoped].sort((a, b) => b.dueDate - a.dueDate);
     const customerNames = new Map(members.map(m => [m.id, m.name]));
     const allVesselRows = await db.listVessels();
     const vesselNameById = new Map(allVesselRows.map(v => [v.id, v.name]));
      // Open (unallocated) wire transfers — the transactions list's payment rows.
      const openTransfers = await listOpenWireTransfers(memberIds, customerNames);
      // Open (unmatched) credit notes — also part of the transactions list.
      const openCreditNotes = await listOpenCreditNotes(memberIds, customerNames);
      const openCreditNotesEur = openCreditNotes.reduce((s, c) => s + c.openEur, 0);
      // Unified: the group's account status IS the hold status (companies inherit it).
      const groupHoldStatus = watchStatus;
      const activityLogs = await db.listActivityLogWithAuthors(input.group, 200).catch(() => []);
      // Last contact attempt for the card header: when, who, outcome and the note.
      const gCallSummary = (await db.callSummaryByGroup().catch(() => new Map())).get(input.group) ?? null;
      /** Team member name preferred, falling back to the user account. */
      const gCallerName = await (async (): Promise<string | null> => {
        const uid = gCallSummary?.lastCallBy ?? null;
        if (uid == null) return null;
        const members = await db.listTeamMembers(true).catch(() => [] as any[]);
        const member = members.find((m: any) => m.userId === uid);
        if (member) return member.name as string;
        const users = await db.listUsers().catch(() => [] as any[]);
        const u = users.find((x: any) => x.id === uid);
        return (u?.name ?? u?.email ?? null) as string | null;
      })();
      // Statuses persist until a human changes them; the red badge flags an overdue linked task.
      const gConf = effectiveConfirmation(confirmation);
      const gConfStatus = gConf.status;
      const gConfAmount = gConf.amount;
      // Linked task for the confirmation badge (same logic as customers.groups):
      // Pending Follow-up → "(Follow-up: <group>)" task; Promise to Pay → "(Promise #<id>)" check task.
      let gConfirmationTask: { id: number; status: string; dueDate: number | null } | null = null;
      if (gConfStatus === "Pending Follow-up" || gConfStatus === "Confirmed") {
        const openAutoTasks = (await db.listTasks({ statuses: ["Pending", "In Progress"] }).catch(() => [])).filter(
          t => taskGroup(t) !== null || taskPromiseId(t) !== null,
        );
        if (gConfStatus === "Pending Follow-up") {
          const t = openAutoTasks.find(t => isTaskOfGroup(t, input.group));
          gConfirmationTask = t ? { id: t.id, status: t.status, dueDate: t.dueDate ?? null } : null;
        } else {
          const openPromise = (await db.listPromises().catch(() => []))
            .filter(p => p.status === "Pending" && memberIds.has(p.customerId))
            .sort((a, b) => b.id - a.id)[0];
          if (openPromise) {
            const t = openAutoTasks.find(t => taskPromiseId(t) === openPromise.id);
            gConfirmationTask = t ? { id: t.id, status: t.status, dueDate: t.dueDate ?? null } : null;
          }
        }
      }
      const gConfirmationTaskId = gConfirmationTask?.id ?? null;
      // Red badge: linked task still open and past due (fallback: target date passed with no open task found).
      const gConfirmationTaskOverdue =
        (gConfStatus === "Pending Follow-up" || gConfStatus === "Confirmed") &&
        (gConfirmationTask
          ? isTaskOverdue(gConfirmationTask, now)
          : ((confirmation?.followUpDate ?? null) !== null && (confirmation!.followUpDate as number) < now));
      const gExpectedToCollect =
        gConfStatus === "Not Contacted" ? groupForecast : gConfStatus === "Broken" ? 0 : gConfAmount;
      const groupForecastInitial = forecastRows
        .filter(f => (f.customerGroup ?? "").trim() === input.group)
        .reduce((s, f) => s + Number((f as any).initialForecast ?? 0), 0);
      // Group account manager: the first member company with a manager set.
      const teamAll = await db.listTeamMembers(true);
      const teamMap = new Map(teamAll.map(m => [m.id, m]));
      const managerMember = members.find(m => (m as any).accountManagerId && teamMap.has((m as any).accountManagerId));
      const accountManager = managerMember
        ? { id: (managerMember as any).accountManagerId as number, name: teamMap.get((managerMember as any).accountManagerId)!.name }
        : null;
      const collectorMember = members.find(m => (m as any).collectorId && teamMap.has((m as any).collectorId));
      const collector = collectorMember
        ? { id: (collectorMember as any).collectorId as number, name: teamMap.get((collectorMember as any).collectorId)!.name }
        : null;
      return {
        group: input.group,
        companies,
        branches,
        aging,
        accountManager,
        collector,
        behavior: groupBehavior,
        rating: ratingResult,
        holdStatus: groupHoldStatus,
        problematic: watchStatus === "Problematic",
        autoProblematic: problematic,
        watchStatus,
        watchOverride,
        forecastExpected: groupForecast,
        forecastInitial: groupForecastInitial,
        expectedToCollect: gExpectedToCollect,
        expectedVariance: gExpectedToCollect - groupForecast,
        overdueEomBalance: gOverdueEom,
        confirmationStatus: gConfStatus,
        confirmationAmount: gConfAmount,
        confirmationTaskId: gConfirmationTaskId,
        confirmationTaskOverdue: gConfirmationTaskOverdue,
        confirmationFollowUpDate: confirmation?.followUpDate ?? null,
        confirmationCarriedOver: gConf.carriedOver,
        confirmationNotes: confirmation?.notes ?? null,
        lastCallAt: gCallSummary?.lastCallAt ? new Date(gCallSummary.lastCallAt).getTime() : null,
        lastCallBy: gCallerName,
        lastCallOutcome: gCallSummary?.lastCallTitle ?? null,
        lastCallNote: gCallSummary?.lastCallNote ?? null,
        callCount: gCallSummary?.calls ?? 0,
        noAnswerCount: gCallSummary?.noAnswer ?? 0,
        totals: {
          openBalance: open.reduce((s, i) => s + outstanding(i), 0),
          overdueBalance: overdue.reduce((s, i) => s + outstanding(i), 0),
          overdueCount: overdue.length,
          openCount: open.length,
          openByCurrency,
          dueNextMonth: gDueNextMonth,
          unallocatedPayments: openTransfers.reduce((s, t) => s + t.unallocatedEur, 0),
          openCreditNotes: openCreditNotesEur,
          openCreditNotesCount: openCreditNotes.length,
          netOpenBalance:
            open.reduce((s, i) => s + outstanding(i), 0) -
            openTransfers.reduce((s, t) => s + t.unallocatedEur, 0) -
            openCreditNotesEur,
          turnoverYtd: members.reduce((s, m) => s + (m.turnoverYtd ? Number(m.turnoverYtd) : 0), 0),
          turnoverLastYear: members.reduce((s, m) => s + (m.turnoverLastYear ? Number(m.turnoverLastYear) : 0), 0),
        },
       invoices: sortedInvoices.map(i => ({
         ...i,
         customerName: customerNames.get(i.customerId) ?? "",
         vesselName: i.vesselId ? (vesselNameById.get(i.vesselId) ?? null) : null,
         outstanding: outstanding(i),
         daysOverdue: isOpenInvoice(i) ? daysOverdue(i.dueDate, Date.now()) : 0,
       })),
        openTransfers,
        openCreditNotes,
       activityLogs,
     };
   }),
  /** All promises-to-pay for the member companies of a group. */
  groupPromises: protectedProcedure.input(z.object({ group: z.string().min(1) })).query(async ({ input }) => {
    const customers = await db.listCustomers();
    const members = customers.filter(c => ((c.customerGroup ?? "").trim() || c.name) === input.group);
    const memberIds = new Set(members.map(m => m.id));
    const names = new Map(members.map(m => [m.id, m.name]));
    const all = await db.listPromises();
    return all
      .filter(p => memberIds.has(p.customerId))
      .map(p => ({ ...p, customerName: names.get(p.customerId) ?? "—" }));
  }),
  /** Payment history, contracts, and tasks aggregated across the member companies of a group (unified card tabs). */
  groupActivity: protectedProcedure.input(z.object({ group: z.string().min(1) })).query(async ({ input }) => {
    const customers = await db.listCustomers();
    const members = customers.filter(c => ((c.customerGroup ?? "").trim() || c.name) === input.group);
    const memberIds = new Set(members.map(m => m.id));
    const names = new Map(members.map(m => [m.id, m.name]));
    const [receipts, contracts, tasks, emailHistories] = await Promise.all([
      db.listReceipts().catch(() => []),
      db.listContracts().catch(() => []),
      db.listTasks({}).catch(() => []),
      Promise.all(Array.from(memberIds).map(id => db.listEmailHistory(id, 300).catch(() => []))).then(results => results.flat()),
    ]);
    return {
      receipts: receipts
        .filter(r => memberIds.has(r.customerId))
        .sort((a, b) => b.receiptDate - a.receiptDate)
        .slice(0, 300)
        .map(r => ({ ...r, customerName: names.get(r.customerId) ?? "—" })),
      contracts: contracts
        .filter(c => memberIds.has(c.customerId))
        .map(c => ({ ...c, customerName: names.get(c.customerId) ?? "—" })),
      tasks: tasks
        .filter(t => memberIds.has(t.customerId))
        .sort((a, b) => (b.dueDate ?? 0) - (a.dueDate ?? 0))
        .slice(0, 300)
        .map(t => ({ ...t, customerName: names.get(t.customerId) ?? "—" })),
      emails: emailHistories
        .sort((a, b) => (b.createdAt?.getTime?.() ?? 0) - (a.createdAt?.getTime?.() ?? 0))
        .slice(0, 300)
        .map(e => ({ ...e, customerName: names.get(e.customerId) ?? "—" })),
    };
  }),
  /** Notes attached to a group. */
  groupNotes: protectedProcedure.input(z.object({ group: z.string().min(1) })).query(async ({ input }) => {
    const notes = await db.listGroupNotes(input.group);
    const users = await db.listUsersWithProfiles().catch(() => []);
    const names = new Map(users.map(u => [u.id, u.name ?? "—"]));
    return notes.map(n => ({ ...n, authorName: names.get(n.createdBy) ?? "—" }));
  }),
  /** Per-group collection profile: call preferences & particularities, always visible on the group card. */
  getCollectionProfile: protectedProcedure.input(z.object({ group: z.string().min(1) })).query(async ({ input }) => {
    const row = await db.getGroupCollectionProfile(input.group);
    if (!row) return null;
    const users = await db.listUsersWithProfiles().catch(() => []);
    const name = users.find(u => u.id === row.updatedBy)?.name ?? null;
    return { notes: row.notes, updatedAt: row.updatedAt, updatedByName: name };
  }),
  setCollectionProfile: protectedProcedure
    .input(z.object({ group: z.string().min(1), notes: z.string().max(2000) }))
    .mutation(async ({ ctx, input }) => {
      await db.upsertGroupCollectionProfile(input.group, input.notes.trim(), ctx.user.id);
      const noteActivityId = await db.addActivityLog({
        groupName: input.group,
        activityType: "note",
        title: "Collection notes updated",
        description: input.notes.trim().slice(0, 300) || "(cleared)",
        createdBy: ctx.user.id,
      });
      // Colleagues named with @ are notified through the mentions inbox; no task is created.
      const notedMentions = parseMentions(input.notes);
      if (notedMentions.length > 0) {
        await db
          .addNoteMentions(
            notedMentions.map(m => ({
              memberId: m.memberId,
              groupName: input.group,
              source: "collectionNotes" as const,
              activityId: noteActivityId,
              excerpt: input.notes.trim().slice(0, 500),
              createdBy: ctx.user.id,
            })),
          )
          .catch(() => 0);
      }
      await audit(ctx, "Update Collection Notes", "group", input.group);
      return { success: true };
    }),
  /** Current-month Smart Forecast entry for a group, with live collected across member companies (EUR). */
  groupForecast: protectedProcedure.input(z.object({ group: z.string().min(1) })).query(async ({ input }) => {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const entries = await db.listForecastEntries(year, month);
    const entry = entries.find(e => (e.customerGroup ?? "").trim() === input.group);
    const customers = await db.listCustomers();
    const memberIds = new Set(
      customers.filter(c => ((c.customerGroup ?? "").trim() || c.name) === input.group).map(c => c.id),
    );
    const receipts = await db.listReceipts();
    const start = Date.UTC(year, month - 1, 1);
    const end = Date.UTC(year, month, 1);
    const monthWires = await db.listReceivedWireTransfersInRange(start, end).catch(() => []);
    const wireCollected = monthWires.filter(w => memberIds.has(w.customerId)).reduce((s, w) => s + Number(w.amount), 0);
    const collected = wireCollected + receipts
      .filter(r => memberIds.has(r.customerId) && r.receiptDate >= start && r.receiptDate < end)
      .reduce((s, r) => s + Number(r.amount), 0);
    if (!entry) {
      // No forecast entry this month — still report collected so the group card
      // shows receipts + received wire transfers under "Paid (this month)".
      return {
        year,
        month,
        dueAmount: 0,
        overdueAmount: 0,
        aiSuggestedAmount: 0,
        aiReasoning: null as string | null,
        expectedAmount: 0,
        initialForecast: 0,
        userAdjusted: false,
        adjustmentNote: null as string | null,
        collected,
        remaining: 0,
        hasForecast: false,
      };
    }
    return {
      year,
      month,
      dueAmount: Number(entry.dueAmount),
      overdueAmount: Number(entry.overdueAmount),
      aiSuggestedAmount: Number(entry.aiSuggestedAmount),
      aiReasoning: entry.aiReasoning,
      expectedAmount: Number(entry.expectedAmount),
      initialForecast: Number(entry.initialForecast ?? 0),
      userAdjusted: entry.userAdjusted,
      adjustmentNote: entry.adjustmentNote,
      collected,
      remaining: Math.max(0, Number(entry.expectedAmount) - collected),
      hasForecast: true,
    };
  }),
  addGroupNote: protectedProcedure
    .input(z.object({ group: z.string().min(1), content: z.string().min(1).max(5000) }))
    .mutation(async ({ ctx, input }) => {
      const id = await db.createGroupNote({
        groupName: input.group,
        content: input.content,
        createdBy: ctx.user.id,
        createdAt: Date.now(),
      });
      await audit(ctx, "Add Group Note", "groupNote", id, `Group ${input.group}`);
      const noteActivityId = await db.addActivityLog({
        groupName: input.group,
        activityType: "note",
        title: "Note added",
        description: input.content.substring(0, 200),
        createdBy: ctx.user.id,
        createdAt: new Date(),
      }).catch(() => undefined);
      // Colleagues named with @ are notified through the mentions inbox; no task is created.
      const mentioned = parseMentions(input.content);
      if (mentioned.length > 0) {
        await db
          .addNoteMentions(
            mentioned.map(m => ({
              memberId: m.memberId,
              groupName: input.group,
              source: "groupNote" as const,
              activityId: typeof noteActivityId === "number" ? noteActivityId : undefined,
              excerpt: input.content.trim().slice(0, 500),
              createdBy: ctx.user.id,
            })),
          )
          .catch(() => 0);
      }
      return { id };
    }),
  deleteGroupNote: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    await db.deleteGroupNote(input.id);
    await audit(ctx, "Delete Group Note", "groupNote", input.id);
    return { success: true };
  }),
  updateGroupNote: protectedProcedure
    .input(z.object({ id: z.number(), content: z.string().min(1).max(5000) }))
    .mutation(async ({ ctx, input }) => {
      await db.updateGroupNote(input.id, input.content);
      await audit(ctx, "Update Group Note", "groupNote", input.id);
      return { success: true };
    }),
  /** Manual watch-status override: Problematic forces the flag, Normal clears it, Auto follows the forecast rule. */
  setWatchStatus: protectedProcedure
    .input(z.object({ group: z.string().min(1), status: z.enum(["Auto", "Normal", "Problematic", "Critical", "On Hold", "Legal"]) }))
    .mutation(async ({ ctx, input }) => {
      await db.setGroupWatchStatus(input.group, input.status, ctx.user.id);
      await audit(ctx, "Set Account Status", "group", input.group, `Status → ${input.status}`);
      await db.createGroupNote({
        groupName: input.group,
        content: `Status changed to "${input.status === "Auto" ? "Auto (forecast rule)" : input.status}" by ${ctx.user.name ?? "user"}.`,
        createdBy: ctx.user.id,
        createdAt: Date.now(),
      });
      return { success: true };
    }),
  get360: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const customer = await db.getCustomer(input.id);
    if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found" });
    const [invoices, receipts, contracts, promises, tasks] = await Promise.all([
      db.listInvoices({ customerId: input.id }),
      db.listReceipts(input.id),
      db.listContracts(input.id),
      db.listPromises(input.id),
      db.listTasks({ customerId: input.id }),
    ]);
    const allInstallments = await db.listInstallments();
    const contractIds = new Set(contracts.map(c => c.id));
    const installments = allInstallments.filter(i => contractIds.has(i.contractId));
    const now = Date.now();
    const aging = computeAging(invoices, now);
    // Credit rating with factor breakdown
    const day90 = 90 * 24 * 60 * 60 * 1000;
    const openInv = invoices.filter(isOpenInvoice);
    const overdueInv = openInv.filter(i => now > i.dueDate);
    const behaviorRow = await db.getPaymentBehavior(input.id).catch(() => null);
    // Group-level watch status & forecast coverage (customer belongs to a group; watch status lives on the group)
    const groupKey = (customer.customerGroup ?? "").trim() || customer.name;
    const eomTs = endOfCurrentMonth();
    const overdueEomBalance = openInv.filter(i => i.dueDate <= eomTs).reduce((s, i) => s + outstanding(i), 0);
    const todayD = new Date();
    const [watchRow, forecastRows] = await Promise.all([
      db.getGroupWatchStatus(groupKey).catch(() => null),
      db.listForecastEntries(todayD.getUTCFullYear(), todayD.getUTCMonth() + 1).catch(() => []),
    ]);
    const groupForecast = forecastRows.filter(f => (f.customerGroup ?? "").trim() === groupKey).reduce((s, f) => s + Number(f.expectedAmount), 0);
    const hasForecast = forecastRows.some(f => (f.customerGroup ?? "").trim() === groupKey);
    // Group-level EOM for the auto rule (the rule is group-scoped)
    const groupCustomers = (await db.listCustomers()).filter(c => ((c.customerGroup ?? "").trim() || c.name) === groupKey);
    const groupIds = new Set(groupCustomers.map(c => c.id));
    const groupInvoices = (await db.listInvoices()).filter(i => groupIds.has(i.customerId) && isOpenInvoice(i));
    const groupOverdueEom = groupInvoices.filter(i => i.dueDate <= eomTs).reduce((s, i) => s + outstanding(i), 0);
    const forecastForRule = hasForecast ? groupForecast : 0;
    const autoProblematic = groupOverdueEom > 0 && forecastForRule < 0.8 * groupOverdueEom;
    const resolvedCd = resolveGroupStatus(watchRow, autoProblematic);
    const watchStatus = resolvedCd.status;
    const watchOverride = watchRow && watchRow.status !== "Auto" ? normalizeStoredStatus(watchRow.status) : null;
    // Rating uses the group's unified account status (the company inherits it).
    const ratingResult = computeCreditRating({
      daysLate: behaviorRow?.medianDaysLate ?? behaviorRow?.avgDaysLate ?? null,
      openBalance: openInv.reduce((s, i) => s + outstanding(i), 0),
      overdueBalance: overdueInv.reduce((s, i) => s + outstanding(i), 0),
      overdue90Plus: overdueInv.filter(i => now - i.dueDate > day90).reduce((s, i) => s + outstanding(i), 0),
      promisesKept: promises.filter(p => p.status === "Kept").length,
      promisesBroken: promises.filter(p => p.status === "Broken").length,
      onHoldStatus: watchStatus,
      turnoverYtd: customer.turnoverYtd != null ? Number(customer.turnoverYtd) : null,
      turnoverLastYear: customer.turnoverLastYear != null ? Number(customer.turnoverLastYear) : null,
    });
    const vesselRows360 = await db.listVessels();
    const vesselName360 = new Map(vesselRows360.map(v => [v.id, v.name]));
    const team360 = await db.listTeamMembers(true);
    const teamMap360 = new Map(team360.map(m => [m.id, m]));
    const accountManager = (customer as any).accountManagerId && teamMap360.has((customer as any).accountManagerId)
      ? { id: (customer as any).accountManagerId as number, name: teamMap360.get((customer as any).accountManagerId)!.name }
      : null;
   const collector = (customer as any).collectorId && teamMap360.has((customer as any).collectorId)
     ? { id: (customer as any).collectorId as number, name: teamMap360.get((customer as any).collectorId)!.name }
     : null;
    const openTransfers360 = await listOpenWireTransfers(new Set([input.id]), new Map([[input.id, customer.name]]));
    const unallocatedPayments360 = openTransfers360.reduce((s, t) => s + t.unallocatedEur, 0);
    const openCreditNotes360 = await listOpenCreditNotes(new Set([input.id]), new Map([[input.id, customer.name]]));
    const openCreditNotesEur360 = openCreditNotes360.reduce((s, c) => s + c.openEur, 0);
   return {
     customer,
     accountManager,
     collector,
      invoices: invoices.map(i => ({
        ...i,
        vesselName: i.vesselId ? (vesselName360.get(i.vesselId) ?? null) : null,
        outstanding: outstanding(i),
        daysOverdue: isOpenInvoice(i) ? daysOverdue(i.dueDate, Date.now()) : 0,
      })),
      receipts,
      contracts,
      installments,
      promises,
      tasks,
      openTransfers: openTransfers360,
      unallocatedPayments: unallocatedPayments360,
      openCreditNotes: openCreditNotes360,
      openCreditNotesTotal: openCreditNotesEur360,
     aging,
      rating: ratingResult,
      behavior: behaviorRow,
      groupKey,
      overdueEomBalance,
      watchStatus,
      watchOverride,
      autoProblematic,
      forecastExpected: groupForecast,
    };
  }),
  create: protectedProcedure
    .input(z.object({
      code: z.string().min(1),
      name: z.string().min(1),
      vatNumber: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      contactPerson: z.string().optional(),
      tier: z.enum(customerTiers).default("New"),
      creditLimit: z.number().default(0),
      paymentTermsDays: z.number().int().default(30),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = await db.createCustomer({ ...input, creditLimit: eur(input.creditLimit) });
      await audit(ctx, "Create Customer", "customer", id, `Created customer ${input.name} (${input.code})`);
      return { id };
    }),
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      vatNumber: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      contactPerson: z.string().optional(),
      tier: z.enum(customerTiers).optional(),
      creditLimit: z.number().optional(),
      paymentTermsDays: z.number().int().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, creditLimit, ...rest } = input;
      await db.updateCustomer(id, { ...rest, ...(creditLimit !== undefined ? { creditLimit: eur(creditLimit) } : {}) });
      await audit(ctx, "Update Customer", "customer", id);
      return { success: true };
    }),

  // Bank Details procedures
  getBankDetails: protectedProcedure
    .input(z.object({ customerId: z.number() }))
    .query(async ({ input }) => {
      return await db.getBankDetailsByCustomerId(input.customerId);
    }),

  saveBankDetails: protectedProcedure
    .input(
      z.object({
        customerId: z.number(),
        iban: z.string().optional().nullable(),
        accountNumber: z.string().optional().nullable(),
        bankName: z.string().optional().nullable(),
        swiftCode: z.string().optional().nullable(),
        beneficiaryName: z.string().optional().nullable(),
        currency: z.string().default("EUR"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { customerId, ...data } = input;
      const existing = await db.getBankDetailsByCustomerId(customerId);

      if (existing) {
        // Update existing
        await db.updateBankDetails(customerId, { ...data, updatedBy: ctx.user.id });
      } else {
        // Create new
        await db.createBankDetails({ customerId, ...data, createdBy: ctx.user.id });
      }

      await audit(ctx, "Save Bank Details", "customer", customerId);
      return { success: true };
    }),

  deleteBankDetails: protectedProcedure
    .input(z.object({ customerId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.deleteBankDetails(input.customerId);
      await audit(ctx, "Delete Bank Details", "customer", input.customerId);
      return { success: true };
    }),

  listWireTransfers: protectedProcedure
    .input(z.object({ customerId: z.number() }))
    .query(async ({ input }) => {
      return db.listWireTransfersByCustomerId(input.customerId);
    }),

  createWireTransfer: protectedProcedure
    .input(
      z.object({
        customerId: z.number(),
        amount: z.number().positive(),
        currency: z.string().default("EUR"),
        transferDate: z.number(),
        branch: z.string().optional().nullable(),
        status: z.enum(["Pending", "Received"]).default("Pending"),
        receivedDate: z.number().optional().nullable(),
        referenceNumber: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const id = await db.createWireTransfer({
        ...input,
        createdBy: ctx.user.id,
      });
      await audit(ctx, "Create Wire Transfer", "customer", input.customerId, `${input.currency ?? "EUR"} ${input.amount}${input.branch ? ` @ ${input.branch}` : ""}`);
      return { id, success: true };
    }),

  updateWireTransfer: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        customerId: z.number(),
        branch: z.string().optional().nullable(),
        status: z.enum(["Pending", "Received"]).optional(),
        receivedDate: z.number().optional().nullable(),
        referenceNumber: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, customerId, ...data } = input;
      await db.updateWireTransfer(id, { ...data, updatedBy: ctx.user.id });
      await audit(ctx, "Update Wire Transfer", "customer", customerId);
      return { success: true };
    }),

  deleteWireTransfer: protectedProcedure
    .input(z.object({ id: z.number(), customerId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // Cascade: revert allocations on invoices, delete allocations,
      // and delete internal inter-office transfers derived from this transfer.
      const allocs = await db.listAllocationsByWireTransfer(input.id);
      for (const alloc of allocs) {
        const inv = await db.getInvoice(alloc.invoiceId);
        if (inv) {
          const newPaid = Math.max(0, Number(inv.paidAmount) - Number(alloc.amount));
          const newStatus = newPaid <= 0.005 ? "Open" : newPaid >= Number(inv.amount) - 0.005 ? "Paid" : "Partially Paid";
          await db.updateInvoice(alloc.invoiceId, { paidAmount: String(newPaid) as any, status: newStatus as any });
        }
        await db.deleteInternalTransfersByAllocation(alloc.id);
        await db.deleteWireTransferAllocation(alloc.id);
      }
      await db.deleteInternalTransfersBySource(input.id);
      await db.deleteWireTransfer(input.id);
      await audit(ctx, "Delete Wire Transfer", "customer", input.customerId);
      return { success: true };
    }),

  /** Distinct branch names (invoice "company" values) for dropdowns. */
  listBranches: protectedProcedure.query(async () => {
    const invoices = await db.listInvoices();
    return Array.from(new Set(invoices.map(i => i.company).filter((b): b is string => !!b))).sort();
  }),

  getAllWireTransfers: protectedProcedure
    .query(async () => {
      const [transfers, customers] = await Promise.all([db.listAllWireTransfers(), db.listCustomers()]);
      const byId = new Map(customers.map(c => [c.id, c]));
      const ids = transfers.map(t => t.id);
      const [allocated, allocRows] = await Promise.all([
        db.sumAllocationsByWireTransferIds(ids),
        db.listAllocationsByWireTransferIds(ids),
      ]);
      const detailsByTransfer = new Map<number, any[]>();
      for (const a of allocRows) {
        const list = detailsByTransfer.get(a.wireTransferId) ?? [];
        list.push({
          id: a.id,
          invoiceId: a.invoiceId,
          invoiceNumber: a.invoiceNumber,
          amount: Number(a.amount),
          currency: a.invoiceCurrency,
          creditedCompanyName: a.invoiceCustomerId != null ? (byId.get(a.invoiceCustomerId)?.name ?? "—") : "—",
          creditedCustomerId: a.invoiceCustomerId,
          branch: a.invoiceCompany,
          createdAt: a.createdAt,
        });
        detailsByTransfer.set(a.wireTransferId, list);
      }
      const transferById = new Map(transfers.map(t => [t.id, t]));
      // Map allocation id → invoice number (for internal rows' "for invoice X" label)
      const invoiceNoByAllocId = new Map<number, string | null>();
      for (const a of allocRows) invoiceNoByAllocId.set(a.id, a.invoiceNumber ?? null);
      return transfers.map(t => {
        const src = t.sourceWireTransferId != null ? transferById.get(t.sourceWireTransferId) : undefined;
        return {
          ...t,
          customerName: byId.get(t.customerId)?.name ?? `Customer #${t.customerId}`,
          allocatedAmount: allocated.get(t.id) ?? 0,
          unallocatedAmount: Math.max(0, Number(t.amount) - (allocated.get(t.id) ?? 0)),
          allocations: detailsByTransfer.get(t.id) ?? [],
          // For internal inter-office transfers: who originally sent the money
          sourceCustomerName: src ? (byId.get(src.customerId)?.name ?? `Customer #${src.customerId}`) : null,
          settledInvoiceNumber:
            t.sourceAllocationId != null ? (invoiceNoByAllocId.get(t.sourceAllocationId) ?? null) : null,
        };
      });
    }),

  /**
   * Open / partially-paid invoices of ALL companies in the sender's group
   * (συμψηφισμός is group-level: a DYNACOM transfer can settle CREST invoices).
   */
  listGroupOpenInvoices: protectedProcedure
    .input(z.object({ customerId: z.number() }))
    .query(async ({ input }) => {
      const cust = await db.getCustomer(input.customerId);
      if (!cust) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found" });
      const groupKey = (cust.customerGroup ?? "").trim() || cust.name;
      const customers = await db.listCustomers();
      const members = customers.filter(c => (((c.customerGroup ?? "").trim() || c.name) === groupKey));
      const memberIds = new Set(members.map(c => c.id));
      const names = new Map(members.map(c => [c.id, c.name]));
      const invoices = await db.listInvoices();
      return invoices
        .filter(i => memberIds.has(i.customerId) && i.status !== "Paid" && Number(i.amount) - Number(i.paidAmount) > 0.005)
        .sort((a, b) => a.dueDate - b.dueDate)
        .map(i => ({
          id: i.id,
          invoiceNumber: i.invoiceNumber,
          customerId: i.customerId,
          customerName: names.get(i.customerId) ?? "—",
          company: i.company,
          currency: i.currency,
          amount: Number(i.amount),
          paidAmount: Number(i.paidAmount),
          outstandingOriginal: Number(i.amount) - Number(i.paidAmount),
          dueDate: i.dueDate,
          status: i.status,
        }));
    }),

  /** Existing allocations of a wire transfer (with invoice + company info). */
  listWireTransferAllocations: protectedProcedure
    .input(z.object({ wireTransferId: z.number() }))
    .query(async ({ input }) => {
      const [rows, customers] = await Promise.all([
        db.listAllocationsByWireTransfer(input.wireTransferId),
        db.listCustomers(),
      ]);
      const names = new Map(customers.map(c => [c.id, c.name]));
      return rows.map(r => ({
        ...r,
        amount: Number(r.amount),
        invoiceCustomerName: r.invoiceCustomerId != null ? (names.get(r.invoiceCustomerId) ?? "—") : "—",
      }));
    }),

  /**
   * Incoming allocations for a customer: amounts credited to their invoices
   * from wire transfers of any group member (e.g. MAGE sees "760 received via
   * DYNACOM wire transfer" against its invoice).
   */
  listIncomingAllocations: protectedProcedure
    .input(z.object({ customerId: z.number() }))
    .query(async ({ input }) => {
      const [rows, customers] = await Promise.all([
        db.listIncomingAllocationsByCustomer(input.customerId),
        db.listCustomers(),
      ]);
      const names = new Map(customers.map(c => [c.id, c.name]));
      return rows.map(r => ({
        id: r.id,
        wireTransferId: r.wireTransferId,
        invoiceId: r.invoiceId,
        invoiceNumber: r.invoiceNumber,
        invoiceStatus: r.invoiceStatus,
        invoiceBranch: r.invoiceCompany,
        amount: Number(r.amount),
        currency: r.invoiceCurrency,
        createdAt: r.createdAt,
        sourceCustomerId: r.sourceCustomerId,
        sourceCustomerName: names.get(r.sourceCustomerId) ?? `Customer #${r.sourceCustomerId}`,
        sourceAmount: Number(r.sourceAmount),
        sourceCurrency: r.sourceCurrency,
        sourceTransferDate: r.sourceTransferDate,
        sourceReference: r.sourceReference,
        sourceBranch: r.sourceBranch,
      }));
    }),

  /**
   * Allocate (συμψηφισμός) a received wire transfer against one or more invoices
   * of the same group. Validates: transfer received, invoices belong to the
   * sender's group, per-invoice amount ≤ outstanding (original currency),
   * total allocated (incl. previous allocations) ≤ transfer amount.
   * Updates invoice paidAmount and status (Open → Partially Paid → Paid).
   */
  allocateWireTransfer: protectedProcedure
    .input(
      z.object({
        wireTransferId: z.number(),
        allocations: z
          .array(z.object({ invoiceId: z.number(), amount: z.number().positive() }))
          .min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const wt = await db.getWireTransfer(input.wireTransferId);
      if (!wt) throw new TRPCError({ code: "NOT_FOUND", message: "Wire transfer not found" });
      if (wt.status !== "Received")
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Only received wire transfers can be allocated" });

      // Group scope of the sender
      const sender = await db.getCustomer(wt.customerId);
      if (!sender) throw new TRPCError({ code: "NOT_FOUND", message: "Sender customer not found" });
      const groupKey = (sender.customerGroup ?? "").trim() || sender.name;
      const customers = await db.listCustomers();
      const memberIds = new Set(
        customers.filter(c => (((c.customerGroup ?? "").trim() || c.name) === groupKey)).map(c => c.id)
      );

      // Remaining unallocated amount on the transfer
      const prior = await db.sumAllocationsByWireTransferIds([wt.id]);
      const alreadyAllocated = prior.get(wt.id) ?? 0;
      const totalNew = input.allocations.reduce((s, a) => s + a.amount, 0);
      if (alreadyAllocated + totalNew > Number(wt.amount) + 0.005) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Allocation total (${(alreadyAllocated + totalNew).toFixed(2)}) exceeds transfer amount (${Number(wt.amount).toFixed(2)})`,
        });
      }

      // Validate each invoice, then apply
      const results: { invoiceId: number; invoiceNumber: string; newStatus: string }[] = [];
      for (const a of input.allocations) {
        const inv = await db.getInvoice(a.invoiceId);
        if (!inv) throw new TRPCError({ code: "NOT_FOUND", message: `Invoice #${a.invoiceId} not found` });
        if (!memberIds.has(inv.customerId))
          throw new TRPCError({ code: "BAD_REQUEST", message: `Invoice ${inv.invoiceNumber} does not belong to group ${groupKey}` });
        if (inv.status === "Paid")
          throw new TRPCError({ code: "BAD_REQUEST", message: `Invoice ${inv.invoiceNumber} is already paid` });
        const open = Number(inv.amount) - Number(inv.paidAmount);
        if (a.amount > open + 0.005)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Amount ${a.amount.toFixed(2)} exceeds outstanding ${open.toFixed(2)} of invoice ${inv.invoiceNumber}`,
          });
      }
      for (const a of input.allocations) {
        const inv = await db.getInvoice(a.invoiceId);
        if (!inv) continue;
        const allocationId = await db.createWireTransferAllocation({
          wireTransferId: wt.id,
          invoiceId: a.invoiceId,
          amount: String(a.amount) as any,
          createdBy: ctx.user.id,
        });
        const newPaid = Number(inv.paidAmount) + a.amount;
        const fullyPaid = newPaid >= Number(inv.amount) - 0.005;
        const newStatus = fullyPaid ? "Paid" : "Partially Paid";
        await db.updateInvoice(a.invoiceId, { paidAmount: String(newPaid) as any, status: newStatus as any });
        results.push({ invoiceId: a.invoiceId, invoiceNumber: inv.invoiceNumber, newStatus });

        // Cross-branch settlement → record a separate INTERNAL wire transfer between our own offices
        // (e.g. Prime Products LTD → Prime Products Distribution B.V), referencing the original customer transfer.
        const receivingBranch = (wt.branch ?? "").trim();
        const invoiceBranch = (inv.company ?? "").trim();
        if (invoiceBranch && receivingBranch !== invoiceBranch) {
          const invoiceOwner = customers.find(c => c.id === inv.customerId);
          await db.createWireTransfer({
            customerId: inv.customerId,
            amount: String(a.amount) as any,
            currency: inv.currency ?? wt.currency,
            transferDate: Date.now(),
            branch: invoiceBranch,
            status: "Received" as any,
            receivedDate: Date.now(),
            referenceNumber: `INT-WT${wt.id}${wt.referenceNumber ? ` (${wt.referenceNumber})` : ""}`,
            notes: `Internal transfer: ${receivingBranch || "our office"} → ${invoiceBranch} to settle invoice ${inv.invoiceNumber} of ${invoiceOwner?.name ?? `customer #${inv.customerId}`}. Origin: wire transfer #${wt.id} from ${sender.name}.`,
            isInternal: true,
            sourceWireTransferId: wt.id,
            sourceAllocationId: allocationId,
            fromBranch: receivingBranch || null,
            toBranch: invoiceBranch,
            createdBy: ctx.user.id,
          } as any);
        }
        await audit(
          ctx,
          "Allocate Wire Transfer",
          "invoice",
          a.invoiceId,
          `WT#${wt.id} → ${inv.invoiceNumber} (${inv.company ?? "—"}): ${inv.currency} ${a.amount.toFixed(2)} → ${newStatus}`
        );
      }
      return { success: true, results };
    }),

  /** Remove an allocation and revert the invoice's paidAmount/status. */
  removeWireTransferAllocation: protectedProcedure
    .input(z.object({ allocationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const alloc = await db.getWireTransferAllocation(input.allocationId);
      if (!alloc) throw new TRPCError({ code: "NOT_FOUND", message: "Allocation not found" });
      const inv = await db.getInvoice(alloc.invoiceId);
      if (inv) {
        const newPaid = Math.max(0, Number(inv.paidAmount) - Number(alloc.amount));
        const newStatus = newPaid <= 0.005 ? "Open" : newPaid >= Number(inv.amount) - 0.005 ? "Paid" : "Partially Paid";
        await db.updateInvoice(alloc.invoiceId, { paidAmount: String(newPaid) as any, status: newStatus as any });
      }
      // Remove the internal inter-office transfer that was auto-created for this allocation (if any)
      await db.deleteInternalTransfersByAllocation(input.allocationId);
      await db.deleteWireTransferAllocation(input.allocationId);
      await audit(ctx, "Remove Wire Transfer Allocation", "invoice", alloc.invoiceId, `WT#${alloc.wireTransferId} allocation of ${Number(alloc.amount).toFixed(2)} removed`);
      return { success: true };
    }),

  /** Existing matches of a credit note (with invoice + company info). */
  listCreditNoteAllocations: protectedProcedure
    .input(z.object({ creditNoteId: z.number() }))
    .query(async ({ input }) => {
      const [rows, customers] = await Promise.all([
        db.listAllocationsByCreditNoteJoined(input.creditNoteId),
        db.listCustomers(),
      ]);
      const names = new Map(customers.map(c => [c.id, c.name]));
      return rows.map(r => ({
        ...r,
        amount: Number(r.amount),
        invoiceCustomerName: r.invoiceCustomerId != null ? (names.get(r.invoiceCustomerId) ?? "—") : "—",
      }));
    }),

  /**
   * Match (συμψηφισμός) an open credit note against one or more invoices of the
   * same group — the manual counterpart of `allocateWireTransfer`. Validates that
   * the invoices belong to the credit note owner's group, that each amount fits
   * the invoice outstanding, and that the total (including earlier matches) never
   * exceeds the credit note's own amount. Only same-currency invoices are allowed,
   * because a credit note settles a debt document 1:1 without an FX decision.
   */
  allocateCreditNote: protectedProcedure
    .input(
      z.object({
        creditNoteId: z.number(),
        allocations: z.array(z.object({ invoiceId: z.number(), amount: z.number().positive() })).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const cn = await db.getCreditNote(input.creditNoteId);
      if (!cn) throw new TRPCError({ code: "NOT_FOUND", message: "Credit note not found" });
      const owner = await db.getCustomer(cn.customerId);
      if (!owner) throw new TRPCError({ code: "NOT_FOUND", message: "Credit note customer not found" });
      const groupKey = (owner.customerGroup ?? "").trim() || owner.name;
      const customers = await db.listCustomers();
      const memberIds = new Set(
        customers.filter(c => (((c.customerGroup ?? "").trim() || c.name) === groupKey)).map(c => c.id)
      );

      const prior = await db.sumAllocationsByCreditNoteIds([cn.id]);
      const alreadyMatched = prior.get(cn.id) ?? 0;
      const totalNew = input.allocations.reduce((s, a) => s + a.amount, 0);
      if (alreadyMatched + totalNew > Number(cn.openAmount) + 0.005) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Match total (${(alreadyMatched + totalNew).toFixed(2)}) exceeds the credit note open amount (${Number(cn.openAmount).toFixed(2)})`,
        });
      }

      const cnCurrency = cn.currency ?? "EUR";
      for (const a of input.allocations) {
        const inv = await db.getInvoice(a.invoiceId);
        if (!inv) throw new TRPCError({ code: "NOT_FOUND", message: `Invoice #${a.invoiceId} not found` });
        if (!memberIds.has(inv.customerId))
          throw new TRPCError({ code: "BAD_REQUEST", message: `Invoice ${inv.invoiceNumber} does not belong to group ${groupKey}` });
        if (inv.status === "Paid")
          throw new TRPCError({ code: "BAD_REQUEST", message: `Invoice ${inv.invoiceNumber} is already paid` });
        if ((inv.currency ?? "EUR") !== cnCurrency)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Invoice ${inv.invoiceNumber} is in ${inv.currency ?? "EUR"} — a ${cnCurrency} credit note can only settle ${cnCurrency} invoices`,
          });
        const open = Number(inv.amount) - Number(inv.paidAmount);
        if (a.amount > open + 0.005)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Amount ${a.amount.toFixed(2)} exceeds outstanding ${open.toFixed(2)} of invoice ${inv.invoiceNumber}`,
          });
      }

      const results: { invoiceId: number; invoiceNumber: string; newStatus: string }[] = [];
      for (const a of input.allocations) {
        const inv = await db.getInvoice(a.invoiceId);
        if (!inv) continue;
        await db.createCreditNoteAllocation({
          creditNoteId: cn.id,
          invoiceId: a.invoiceId,
          amount: String(a.amount) as any,
          createdBy: ctx.user.id,
        });
        const newPaid = Number(inv.paidAmount) + a.amount;
        const fullyPaid = newPaid >= Number(inv.amount) - 0.005;
        const newStatus = fullyPaid ? "Paid" : "Partially Paid";
        await db.updateInvoice(a.invoiceId, { paidAmount: String(newPaid) as any, status: newStatus as any });
        results.push({ invoiceId: a.invoiceId, invoiceNumber: inv.invoiceNumber, newStatus });
        await audit(
          ctx,
          "Match Credit Note",
          "invoice",
          a.invoiceId,
          `${cn.docNumber} → ${inv.invoiceNumber} (${inv.company ?? "—"}): ${cnCurrency} ${a.amount.toFixed(2)} → ${newStatus}`
        );
      }
      return { success: true, results };
    }),

  /** Undo a credit-note match and revert the invoice's paidAmount/status. */
  removeCreditNoteAllocation: protectedProcedure
    .input(z.object({ allocationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const alloc = await db.getCreditNoteAllocation(input.allocationId);
      if (!alloc) throw new TRPCError({ code: "NOT_FOUND", message: "Match not found" });
      const inv = await db.getInvoice(alloc.invoiceId);
      if (inv) {
        const newPaid = Math.max(0, Number(inv.paidAmount) - Number(alloc.amount));
        const newStatus = newPaid <= 0.005 ? "Open" : newPaid >= Number(inv.amount) - 0.005 ? "Paid" : "Partially Paid";
        await db.updateInvoice(alloc.invoiceId, { paidAmount: String(newPaid) as any, status: newStatus as any });
      }
      await db.deleteCreditNoteAllocation(input.allocationId);
      await audit(
        ctx,
        "Remove Credit Note Match",
        "invoice",
        alloc.invoiceId,
        `Credit note #${alloc.creditNoteId} match of ${Number(alloc.amount).toFixed(2)} removed`
      );
      return { success: true };
    }),

  /** Lightweight list of all companies (id + name) for dropdowns. */
  listCompanies: protectedProcedure.query(async () => {
    const customers = await db.listCustomers();
    return customers
      .map(c => ({ id: c.id, name: c.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }),
  /**
   * Assign a responsible team member (account manager) either to a single
   * company or to every company of a customer group. null clears it.
   */
  setAccountManager: protectedProcedure
    .input(z.object({
      managerId: z.number().nullable(),
      customerId: z.number().optional(),
      groupName: z.string().min(1).optional(),
    }).refine(v => v.customerId !== undefined || v.groupName !== undefined, { message: "customerId or groupName required" }))
    .mutation(async ({ ctx, input }) => {
      let managerName: string | null = null;
      if (input.managerId !== null) {
        const member = await db.getTeamMemberById(input.managerId);
        if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Team member not found" });
        if (!member.active) throw new TRPCError({ code: "BAD_REQUEST", message: "Team member is inactive" });
        managerName = member.name;
      }
      if (input.groupName) {
        await db.setGroupAccountManager(input.groupName, input.managerId);
        await audit(ctx, "Set Account Manager", "customerGroup", undefined,
          `Group "${input.groupName}" → ${managerName ?? "unassigned"}`);
      } else if (input.customerId !== undefined) {
        const customer = await db.getCustomer(input.customerId);
        if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found" });
        await db.updateCustomer(input.customerId, { accountManagerId: input.managerId } as any);
        await audit(ctx, "Set Account Manager", "customer", input.customerId,
          `${customer.name} → ${managerName ?? "unassigned"}`);
      }
      return { success: true, managerName };
    }),
  /**
   * Assign a collector (credit controller responsible for chasing payment)
   * either to a single company or to every company of a customer group.
   */
  setCollector: protectedProcedure
    .input(z.object({
      collectorId: z.number().nullable(),
      customerId: z.number().optional(),
      groupName: z.string().min(1).optional(),
    }).refine(v => v.customerId !== undefined || v.groupName !== undefined, { message: "customerId or groupName required" }))
    .mutation(async ({ ctx, input }) => {
      let collectorName: string | null = null;
      if (input.collectorId !== null) {
        const member = await db.getTeamMemberById(input.collectorId);
        if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Team member not found" });
        if (!member.active) throw new TRPCError({ code: "BAD_REQUEST", message: "Team member is inactive" });
        collectorName = member.name;
      }
      if (input.groupName) {
        await db.setGroupCollector(input.groupName, input.collectorId);
        await audit(ctx, "Set Collector", "customerGroup", undefined,
          `Group "${input.groupName}" → ${collectorName ?? "unassigned"}`);
      } else if (input.customerId !== undefined) {
        const customer = await db.getCustomer(input.customerId);
        if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found" });
        await db.updateCustomer(input.customerId, { collectorId: input.collectorId } as any);
        await audit(ctx, "Set Collector", "customer", input.customerId,
          `${customer.name} → ${collectorName ?? "unassigned"}`);
      }
      return { success: true, collectorName };
    }),
});

export const invoicesRouter = router({
  list: protectedProcedure
    .input(z.object({ customerId: z.number().optional(), statuses: z.array(z.enum(invoiceStatuses)).optional() }).optional())
    .query(async ({ input }) => {
      const invoices = await db.listInvoices({ customerId: input?.customerId, statuses: input?.statuses });
      const customers = await db.listCustomers();
      const byId = new Map(customers.map(c => [c.id, c]));
      const vessels = await db.listVessels();
      const vesselById = new Map(vessels.map(v => [v.id, v]));
      const now = Date.now();
      // Trimmed payload: only the fields the UI consumes (5k+ rows, every byte counts)
      return invoices.map(i => ({
        id: i.id,
        customerId: i.customerId,
        invoiceNumber: i.invoiceNumber,
        company: i.company,
        currency: i.currency,
        amount: i.amount,
        amountEur: i.amountEur,
        paidAmount: i.paidAmount,
        status: i.status,
        issueDate: i.issueDate,
        dueDate: i.dueDate,
        vesselId: i.vesselId,
        isContractInstallment: !!i.isContractInstallment,
        customerName: byId.get(i.customerId)?.name ?? "—",
        customerTier: byId.get(i.customerId)?.tier ?? "New",
        customerGroup: (byId.get(i.customerId)?.customerGroup ?? "").trim() || (byId.get(i.customerId)?.name ?? "—"),
        vesselName: i.vesselId ? (vesselById.get(i.vesselId)?.name ?? null) : null,
        outstanding: outstanding(i),
        daysOverdue: isOpenInvoice(i) ? daysOverdue(i.dueDate, now) : 0,
      }));
    }),
  /**
   * Aging buckets for the open book. With `installmentsOnly` the buckets cover
   * ONLY contract installments, so the cards on the Invoices page match the rows
   * shown while the "Installments only" filter is active.
   */
  aging: protectedProcedure
    .input(z.object({ installmentsOnly: z.boolean().optional() }).optional())
    .query(async ({ input }) => {
      const invoices = await db.listInvoices();
      const scoped = input?.installmentsOnly
        ? invoices.filter(i => Boolean((i as any).isContractInstallment))
        : invoices;
      return computeAging(scoped, Date.now());
    }),

  /**
   * Cancel the payment of an invoice: reverts ALL wire-transfer allocations that
   * settled it — invoice returns to Open (paidAmount reduced), the amounts are
   * freed on their wire transfers, and derived internal inter-office transfers
   * are deleted. Everything is audited.
   */
  cancelPayment: protectedProcedure
    .input(z.object({ invoiceId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const inv = await db.getInvoice(input.invoiceId);
      if (!inv) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      const allocs = await db.listWtAllocationsByInvoice(input.invoiceId);
      if (allocs.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This invoice has no wire-transfer payment to cancel" });
      }
      let reverted = 0;
      for (const alloc of allocs) {
        await db.deleteInternalTransfersByAllocation(alloc.id);
        await db.deleteWireTransferAllocation(alloc.id);
        reverted += Number(alloc.amount);
      }
      const newPaid = Math.max(0, Number(inv.paidAmount) - reverted);
      const newStatus = newPaid <= 0.005 ? "Open" : newPaid >= Number(inv.amount) - 0.005 ? "Paid" : "Partially Paid";
      await db.updateInvoice(input.invoiceId, { paidAmount: String(newPaid) as any, status: newStatus as any });
      await audit(
        ctx,
        "Cancel Invoice Payment",
        "invoice",
        input.invoiceId,
        `Payment of ${inv.currency ?? "EUR"} ${reverted.toFixed(2)} cancelled on ${inv.invoiceNumber} — ${allocs.length} allocation(s) reverted, invoice → ${newStatus}`
      );
      return { success: true, reverted, allocationsRemoved: allocs.length, newStatus };
    }),
  create: protectedProcedure
    .input(z.object({
      customerId: z.number(),
      invoiceNumber: z.string().min(1),
      issueDate: z.number(),
      dueDate: z.number(),
      amount: z.number().positive(),
      vesselId: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = await db.createInvoice({ ...input, amount: eur(input.amount), amountEur: eur(input.amount) });
      await audit(ctx, "Create Invoice", "invoice", id, `Invoice ${input.invoiceNumber} for customer #${input.customerId}, amount €${eur(input.amount)}`);
      return { id };
    }),
  /** Attach or detach a vessel on any invoice. */
  setVessel: protectedProcedure
    .input(z.object({ invoiceId: z.number(), vesselId: z.number().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const inv = await db.getInvoice(input.invoiceId);
      if (!inv) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      await db.updateInvoice(input.invoiceId, { vesselId: input.vesselId } as any);
      const v = input.vesselId ? await db.getVesselById(input.vesselId) : null;
      await audit(ctx, "Set Invoice Vessel", "invoice", input.invoiceId, v ? `Vessel "${v.name}" set on ${inv.invoiceNumber}` : `Vessel cleared on ${inv.invoiceNumber}`);
      return { success: true };
    }),
  /** Toggle the simple "contract installment" flag on a single invoice. */
  setContractInstallment: protectedProcedure
    .input(z.object({ invoiceId: z.number(), isContractInstallment: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const inv = await db.getInvoice(input.invoiceId);
      if (!inv) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      await db.updateInvoice(input.invoiceId, { isContractInstallment: input.isContractInstallment } as any);
      await audit(
        ctx,
        "Set Contract Installment Flag",
        "invoice",
        input.invoiceId,
        `${inv.invoiceNumber} ${input.isContractInstallment ? "marked as" : "unmarked as"} contract installment`
      );
      return { success: true };
    }),
  /**
   * Bulk-mark invoices as contract installments from an uploaded list of invoice
   * numbers (parsed client-side from Excel/CSV). Matching is exact on invoiceNumber
   * after trimming. Returns how many matched and which numbers were not found.
   */
  bulkMarkContractInstallments: protectedProcedure
    .input(z.object({
      invoiceNumbers: z.array(z.string().min(1)).min(1).max(5000),
      value: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const wanted = Array.from(new Set(input.invoiceNumbers.map(n => n.trim()).filter(Boolean)));
      const all = await db.listInvoices();
      const byNumber = new Map(all.map(i => [i.invoiceNumber.trim(), i]));
      const matched: string[] = [];
      const notFound: string[] = [];
      for (const num of wanted) {
        const inv = byNumber.get(num);
        if (!inv) { notFound.push(num); continue; }
        if (!!inv.isContractInstallment !== input.value) {
          await db.updateInvoice(inv.id, { isContractInstallment: input.value } as any);
        }
        matched.push(num);
      }
      await audit(
        ctx,
        "Bulk Mark Contract Installments",
        "invoice",
        0,
        `${matched.length} invoice(s) ${input.value ? "marked" : "unmarked"} as contract installments (${notFound.length} not found)`
      );
      return { matchedCount: matched.length, notFound };
    }),
  markDisputed: protectedProcedure
    .input(z.object({ id: z.number(), disputed: z.boolean(), reason: z.string().max(1000).optional() }))
    .mutation(async ({ ctx, input }) => {
      const inv = await db.getInvoice(input.id);
      if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
      const now = Date.now();
      const status = input.disputed
        ? "Disputed"
        : (deriveInvoiceStatus(Number(inv.amount), Number(inv.paidAmount), inv.dueDate, now, "Open") as any);
      const update: Record<string, unknown> = { status };
      if (input.disputed && input.reason?.trim()) {
        const stamp = new Date(now).toISOString().slice(0, 10);
        const line = `[Dispute ${stamp}] ${input.reason.trim()}`;
        update.notes = inv.notes ? `${inv.notes}\n${line}` : line;
      }
      await db.updateInvoice(input.id, update);
      await audit(
        ctx,
        input.disputed ? "Mark Disputed" : "Clear Dispute",
        "invoice",
        input.id,
        input.disputed
          ? `${inv.invoiceNumber} marked Disputed${input.reason?.trim() ? ` — ${input.reason.trim()}` : ""}`
          : `${inv.invoiceNumber} dispute cleared → ${status}`
      );
      return { success: true, status };
    }),
});

export const vesselsRouter = router({
  list: protectedProcedure.query(async () => db.listVessels()),
  /** Vessels enriched with financial aggregates for the Vessels list page. */
  listWithStats: protectedProcedure.query(async () => {
    const [vesselRows, allInvoices, customers] = await Promise.all([
      db.listVessels(),
      db.listInvoices(),
      db.listCustomers(),
    ]);
    const custById = new Map(customers.map(c => [c.id, c]));
    const now = Date.now();
    type Agg = {
      invoiceCount: number;
      openBalance: number;
      overdueAmount: number;
      overdueCount: number;
      totalInvoiced: number;
      totalPaid: number;
      maxDaysOverdue: number;
      customerIds: Set<number>;
    };
    const aggByVessel = new Map<number, Agg>();
    for (const inv of allInvoices) {
      if (!inv.vesselId) continue;
      let agg = aggByVessel.get(inv.vesselId);
      if (!agg) {
        agg = { invoiceCount: 0, openBalance: 0, overdueAmount: 0, overdueCount: 0, totalInvoiced: 0, totalPaid: 0, maxDaysOverdue: 0, customerIds: new Set() };
        aggByVessel.set(inv.vesselId, agg);
      }
      agg.invoiceCount += 1;
      agg.customerIds.add(inv.customerId);
      const eurAmount = inv.amountEur != null ? Number(inv.amountEur) : Number(inv.amount);
      const paidFraction = Number(inv.amount) > 0 ? Math.min(1, Math.max(0, Number(inv.paidAmount) / Number(inv.amount))) : 0;
      agg.totalInvoiced += eurAmount;
      agg.totalPaid += eurAmount * paidFraction;
      if (isOpenInvoice(inv)) {
        const out = outstanding(inv);
        agg.openBalance += out;
        const dOver = daysOverdue(inv.dueDate, now);
        if (dOver > 0) {
          agg.overdueAmount += out;
          agg.overdueCount += 1;
          if (dOver > agg.maxDaysOverdue) agg.maxDaysOverdue = dOver;
        }
      }
    }
    return vesselRows.map(v => {
      const agg = aggByVessel.get(v.id);
      const owner = v.customerId ? custById.get(v.customerId) : undefined;
      // No explicit owner set → derive from invoicing history (first invoiced customer).
      let derivedOwner: string | null = null;
      if (!owner && agg && agg.customerIds.size > 0) {
        const c = custById.get(Array.from(agg.customerIds)[0]);
        if (c) derivedOwner = (c.customerGroup ?? "").trim() || c.name;
      }
      return {
        ...v,
        ownerName: owner ? owner.name : derivedOwner,
        ownerGroup: owner ? ((owner.customerGroup ?? "").trim() || owner.name) : derivedOwner,
        invoiceCount: agg?.invoiceCount ?? 0,
        openBalance: agg?.openBalance ?? 0,
        overdueAmount: agg?.overdueAmount ?? 0,
        overdueCount: agg?.overdueCount ?? 0,
        totalInvoiced: agg?.totalInvoiced ?? 0,
        totalPaid: agg?.totalPaid ?? 0,
        maxDaysOverdue: agg?.maxDaysOverdue ?? 0,
      };
    });
  }),
  /** Full vessel card: info + financial summary + its invoices (same row shape as invoices.list). */
  detail: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const vessel = await db.getVesselById(input.id);
    if (!vessel) throw new TRPCError({ code: "NOT_FOUND", message: "Vessel not found" });
    const [allInvoices, customers] = await Promise.all([db.listInvoices(), db.listCustomers()]);
    const custById = new Map(customers.map(c => [c.id, c]));
    const now = Date.now();
    const rows = allInvoices.filter(i => i.vesselId === input.id);
    const invoiceRows = rows.map(i => ({
      id: i.id,
      customerId: i.customerId,
      invoiceNumber: i.invoiceNumber,
      company: i.company,
      currency: i.currency,
      amount: i.amount,
      amountEur: i.amountEur,
      paidAmount: i.paidAmount,
      status: i.status,
      issueDate: i.issueDate,
      dueDate: i.dueDate,
      vesselId: i.vesselId,
      customerName: custById.get(i.customerId)?.name ?? "—",
      customerTier: custById.get(i.customerId)?.tier ?? "New",
      customerGroup: (custById.get(i.customerId)?.customerGroup ?? "").trim() || (custById.get(i.customerId)?.name ?? "—"),
      vesselName: vessel.name,
      outstanding: outstanding(i),
      daysOverdue: isOpenInvoice(i) ? daysOverdue(i.dueDate, now) : 0,
    }));
    let openBalance = 0, overdueAmount = 0, overdueCount = 0, totalInvoiced = 0, totalPaid = 0, maxDays = 0;
    for (const i of rows) {
      const eurAmount = i.amountEur != null ? Number(i.amountEur) : Number(i.amount);
      const paidFraction = Number(i.amount) > 0 ? Math.min(1, Math.max(0, Number(i.paidAmount) / Number(i.amount))) : 0;
      totalInvoiced += eurAmount;
      totalPaid += eurAmount * paidFraction;
      if (isOpenInvoice(i)) {
        const out = outstanding(i);
        openBalance += out;
        const d = daysOverdue(i.dueDate, now);
        if (d > 0) { overdueAmount += out; overdueCount += 1; if (d > maxDays) maxDays = d; }
      }
    }
    const owner = vessel.customerId ? custById.get(vessel.customerId) : undefined;
    // Companies that have invoiced this vessel (context on the card).
    const relatedCompanies = Array.from(new Set(rows.map(r => r.customerId)))
      .map(cid => {
        const c = custById.get(cid);
        return c ? { id: c.id, name: c.name, group: (c.customerGroup ?? "").trim() || c.name } : null;
      })
      .filter((x): x is { id: number; name: string; group: string } => x !== null);
    return {
      vessel: {
        ...vessel,
        ownerName: owner?.name ?? null,
        ownerGroup: owner ? ((owner.customerGroup ?? "").trim() || owner.name) : null,
      },
      stats: { openBalance, overdueAmount, overdueCount, totalInvoiced, totalPaid, maxDaysOverdue: maxDays, invoiceCount: rows.length },
      relatedCompanies,
      invoices: invoiceRows,
    };
  }),
  create: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(191), customerId: z.number().optional(), imo: z.string().max(32).optional(), vesselType: z.string().max(64).optional(), flag: z.string().max(64).optional(), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const id = await db.createVessel({ name: input.name.trim(), customerId: input.customerId ?? null, imo: input.imo?.trim() || null, vesselType: input.vesselType?.trim() || null, flag: input.flag?.trim() || null, notes: input.notes ?? null });
      await audit(ctx, "Create Vessel", "vessel", Number(id), `Vessel "${input.name.trim()}" created`);
      return { id: Number(id) };
    }),
  update: protectedProcedure
    .input(z.object({ id: z.number(), name: z.string().min(1).max(191).optional(), customerId: z.number().nullable().optional(), imo: z.string().max(32).nullable().optional(), vesselType: z.string().max(64).nullable().optional(), flag: z.string().max(64).nullable().optional(), notes: z.string().nullable().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await db.updateVessel(id, data as any);
      await audit(ctx, "Update Vessel", "vessel", id);
      return { success: true };
    }),
  remove: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const v = await db.getVesselById(input.id);
      await db.deleteVessel(input.id);
      await audit(ctx, "Delete Vessel", "vessel", input.id, v ? `Vessel "${v.name}" deleted (detached from invoices)` : undefined);
      return { success: true };
    }),
});

export const receiptsRouter = router({
  list: protectedProcedure.input(z.object({ customerId: z.number().optional() }).optional()).query(async ({ input }) => {
    const rows = await db.listReceipts(input?.customerId);
    const customers = await db.listCustomers();
    const byId = new Map(customers.map(c => [c.id, c]));
    return rows.map(r => ({ ...r, customerName: byId.get(r.customerId)?.name ?? "—" }));
  }),
  /** Record a receipt and allocate (match/reconcile) it against invoices. */
  create: protectedProcedure
    .input(z.object({
      customerId: z.number(),
      receiptNumber: z.string().min(1),
      receiptDate: z.number(),
      amount: z.number().positive(),
      method: z.enum(receiptMethods),
      notes: z.string().optional(),
      allocations: z.array(z.object({ invoiceId: z.number(), amount: z.number().positive() })),
    }))
    .mutation(async ({ ctx, input }) => {
      const allocated = input.allocations.reduce((s, a) => s + a.amount, 0);
      if (allocated - input.amount > 0.005) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Allocated amount exceeds receipt amount" });
      }
      const receiptId = await db.createReceipt({
        customerId: input.customerId,
        receiptNumber: input.receiptNumber,
        receiptDate: input.receiptDate,
        amount: eur(input.amount),
        method: input.method,
        notes: input.notes,
        createdBy: ctx.user.id,
      });
      const now = Date.now();
      for (const alloc of input.allocations) {
        const inv = await db.getInvoice(alloc.invoiceId);
        if (!inv) continue;
        const remaining = outstanding(inv);
        if (alloc.amount - remaining > 0.005) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Allocation to invoice ${inv.invoiceNumber} exceeds its outstanding balance` });
        }
        await db.addAllocation(receiptId, alloc.invoiceId, eur(alloc.amount));
        const newPaid = Number(inv.paidAmount) + alloc.amount;
        const status = deriveInvoiceStatus(Number(inv.amount), newPaid, inv.dueDate, now, inv.status) as any;
        await db.updateInvoice(alloc.invoiceId, { paidAmount: eur(newPaid), status });
        if (inv.contractInstallmentId && status === "Paid") {
          await db.updateInstallment(inv.contractInstallmentId, { status: "Paid" });
        }
        if (status === "Paid") {
          const invTasks = await db.listTasks({ customerId: input.customerId, statuses: ["Pending", "In Progress"] });
          for (const t of invTasks.filter(t => t.invoiceId === alloc.invoiceId)) {
            await db.updateTask(t.id, { status: "Cancelled", completionNotes: "Invoice fully paid — task auto-cancelled" });
          }
        }
      }
      await audit(ctx, "Record Receipt", "receipt", receiptId, `Receipt ${input.receiptNumber} €${eur(input.amount)} with ${input.allocations.length} allocation(s)`);
      return { id: receiptId };
    }),
});

export const contractsRouter = router({
  list: protectedProcedure.query(async () => {
    const [contracts, customers, installments] = await Promise.all([db.listContracts(), db.listCustomers(), db.listInstallments()]);
    const byId = new Map(customers.map(c => [c.id, c]));
    return contracts.map(c => {
      const insts = installments.filter(i => i.contractId === c.id);
      return {
        ...c,
        customerName: byId.get(c.customerId)?.name ?? "—",
        installmentsTotal: insts.length,
        installmentsPaid: insts.filter(i => i.status === "Paid").length,
        collectedAmount: insts.filter(i => i.status === "Paid").reduce((s, i) => s + Number(i.amount), 0),
      };
    });
  }),
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const contract = await db.getContract(input.id);
    if (!contract) throw new TRPCError({ code: "NOT_FOUND" });
    const installments = await db.listInstallments(input.id);
    const customer = await db.getCustomer(contract.customerId);
    return { contract, installments, customer };
  }),
  /** Create contract with auto-generated annual installment schedule. */
  create: protectedProcedure
    .input(z.object({
      customerId: z.number(),
      contractNumber: z.string().min(1),
      title: z.string().min(1),
      totalValue: z.number().positive(),
      startDate: z.number(),
      endDate: z.number(),
      installmentCount: z.number().int().min(1).max(30),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.endDate <= input.startDate) throw new TRPCError({ code: "BAD_REQUEST", message: "End date must be after start date" });
      const id = await db.createContract({
        customerId: input.customerId,
        contractNumber: input.contractNumber,
        title: input.title,
        totalValue: eur(input.totalValue),
        startDate: input.startDate,
        endDate: input.endDate,
        notes: input.notes,
      });
      const per = input.totalValue / input.installmentCount;
      const start = new Date(input.startDate);
      for (let i = 0; i < input.installmentCount; i++) {
        const due = Date.UTC(start.getUTCFullYear() + i, start.getUTCMonth(), start.getUTCDate());
        const amount = i === input.installmentCount - 1 ? input.totalValue - per * (input.installmentCount - 1) : per;
        await db.createInstallment({ contractId: id, installmentNumber: i + 1, dueDate: due, amount: eur(amount) });
      }
      await audit(ctx, "Create Contract", "contract", id, `Contract ${input.contractNumber} — €${eur(input.totalValue)} in ${input.installmentCount} annual installment(s)`);
      return { id };
    }),
  /** Generate an invoice for an installment (marks it Invoiced and links the invoice). */
  invoiceInstallment: protectedProcedure
    .input(z.object({ installmentId: z.number(), invoiceNumber: z.string().min(1), paymentTermsDays: z.number().int().default(30) }))
    .mutation(async ({ ctx, input }) => {
      const all = await db.listInstallments();
      const inst = all.find(i => i.id === input.installmentId);
      if (!inst) throw new TRPCError({ code: "NOT_FOUND" });
      if (inst.status === "Paid" || inst.invoiceId) throw new TRPCError({ code: "BAD_REQUEST", message: "Installment is already invoiced or paid" });
      const contract = await db.getContract(inst.contractId);
      if (!contract) throw new TRPCError({ code: "NOT_FOUND" });
      const now = Date.now();
      const invoiceId = await db.createInvoice({
        customerId: contract.customerId,
        invoiceNumber: input.invoiceNumber,
        issueDate: now,
        dueDate: inst.dueDate > now ? inst.dueDate : now + input.paymentTermsDays * 24 * 60 * 60 * 1000,
        amount: inst.amount,
        amountEur: inst.amount,
        contractInstallmentId: inst.id,
        notes: `Installment ${inst.installmentNumber} of contract ${contract.contractNumber}`,
      });
      await db.updateInstallment(inst.id, { status: "Invoiced", invoiceId });
      await audit(ctx, "Invoice Installment", "installment", inst.id, `Created invoice ${input.invoiceNumber} for installment #${inst.installmentNumber} of ${contract.contractNumber}`);
      return { invoiceId };
    }),
});

export const tasksRouter = router({
  /** Manual task creation by the user. */
  create: protectedProcedure
    .input(z.object({
      customerId: z.number(),
      type: z.enum(taskTypes),
      title: z.string().min(1),
      description: z.string().optional(),
      dueDate: z.number(),
      invoiceId: z.number().optional(),
      assigneeId: z.number().optional(),
      /** Invoices to attach — used when sending invoices to a colleague for help. */
      invoiceIds: z.array(z.number()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const customer = await db.getCustomer(input.customerId);
      if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found" });
      const id = await db.createTask({
        customerId: input.customerId,
        type: input.type,
        title: input.title,
        description: input.description,
        dueDate: input.dueDate,
        invoiceId: input.invoiceId,
        assigneeId: input.assigneeId ?? null,
        status: "Pending",
        assignedTo: ctx.user.id,
        // Every task belongs to a collections group, so the Desk can count open
        // work per group without parsing anything out of the description.
        customerGroup: (customer.customerGroup ?? "").trim() || customer.name,
      } as any);
      if (input.invoiceIds && input.invoiceIds.length > 0) {
        await db.addTaskInvoices(id, input.invoiceIds);
      }
      // When you create a task for someone else, you automatically become a
      // watcher so you can follow whether they helped.
      if (input.assigneeId != null) {
        const creatorMember = await db.getTeamMemberByUserId(ctx.user.id).catch(() => null);
        if (creatorMember && creatorMember.id !== input.assigneeId) {
          await db.addTaskWatcher(id, creatorMember.id).catch(() => {});
        }
      }
      // A manual task — above all a "Help" request to a colleague — belongs in the
      // customer's history: months later you must be able to see that help was
      // asked for without hunting through the task list.
      const taskGroupName = (customer.customerGroup ?? "").trim() || customer.name;
      const assigneeMember =
        input.assigneeId != null ? await db.getTeamMemberById(input.assigneeId).catch(() => null) : null;
      const assigneeLabel = assigneeMember?.name ?? "myself";
      await db.addActivityLog({
        groupName: taskGroupName,
        customerId: input.customerId,
        activityType: "task",
        title:
          input.type === "Help"
            ? `Help requested from ${assigneeLabel} — ${input.title}`
            : `Task created — ${input.title}`,
        description: [
          input.description?.trim() || null,
          `Assigned to: ${assigneeLabel}`,
          `Due: ${new Date(input.dueDate).toLocaleDateString("en-GB")}`,
        ]
          .filter(Boolean)
          .join("\n"),
        createdBy: ctx.user.id,
        createdAt: new Date(),
      }).catch(() => {});
      await audit(ctx, "Create Task", "task", id, `Manual task "${input.title}" for ${customer.name}`);
      return { id };
    }),
  list: protectedProcedure
    .input(z.object({ statuses: z.array(z.enum(taskStatuses)).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const [rows, customers, invoices, allPromises, members, allAttached, allUsers] = await Promise.all([
        db.listTasks({ statuses: input?.statuses }),
        db.listCustomers(),
        db.listInvoices(),
        db.listPromises(),
        db.listTeamMembers(true),
        db.listAllTaskInvoices(),
        db.listUsers().catch(() => [] as any[]),
      ]);
      const allWatchers = await db.listWatchersForTasks(rows.map(t => t.id));
      const watchersByTask = new Map<number, { memberId: number; name: string; title: string | null }[]>();
      for (const w of allWatchers) {
        const arr = watchersByTask.get(w.taskId) ?? [];
        arr.push({ memberId: w.memberId, name: w.name, title: w.title });
        watchersByTask.set(w.taskId, arr);
      }
      const byId = new Map(customers.map(c => [c.id, c]));
      const invById = new Map(invoices.map(i => [i.id, i]));
      const promById = new Map(allPromises.map(p => [p.id, p]));
      const memberById = new Map(members.map(mb => [mb.id, mb]));
      const userById = new Map(allUsers.map((u: any) => [u.id, u]));
      const attachedByTask = new Map<number, number[]>();
      for (const ti of allAttached) {
        const arr = attachedByTask.get(ti.taskId) ?? [];
        arr.push(ti.invoiceId);
        attachedByTask.set(ti.taskId, arr);
      }
      return rows.map(t => {
        // Promise follow-up tasks embed "(Promise #<id>)" in their description.
        const m = t.description?.match(/\(Promise #(\d+)\)/);
        const promise = m ? promById.get(Number(m[1])) : undefined;
        const attachedIds = attachedByTask.get(t.id) ?? [];
        const attachedInvoices = attachedIds
          .map(iid => invById.get(iid))
          .filter(Boolean)
          .map((inv: any) => ({
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            amount: inv.amount,
            currency: inv.currency,
            dueDate: inv.dueDate,
            status: inv.status,
            customerName: byId.get(inv.customerId)?.name ?? "—",
          }));
        return {
          ...t,
          customerName: byId.get(t.customerId)?.name ?? "—",
          groupName: (byId.get(t.customerId)?.customerGroup ?? "").trim() || (byId.get(t.customerId)?.name ?? null),
          invoiceNumber: t.invoiceId ? invById.get(t.invoiceId)?.invoiceNumber : undefined,
          assigneeName: t.assigneeId ? (memberById.get(t.assigneeId)?.name ?? null) : null,
          creatorName: t.assignedTo ? ((userById.get(t.assignedTo) as any)?.name ?? null) : null,
          createdByMe: t.assignedTo === ctx.user.id,
          attachedInvoices,
          watchers: watchersByTask.get(t.id) ?? [],
          promiseId: promise?.id,
          promise: promise
            ? { id: promise.id, promisedDate: promise.promisedDate, amount: promise.amount, status: promise.status, notes: promise.notes }
            : undefined,
        };
      });
    }),
  /** Comments thread on a task — internal collaboration between colleagues. */
  comments: protectedProcedure
    .input(z.object({ taskId: z.number() }))
    .query(async ({ input }) => db.listTaskComments(input.taskId)),
  /** Watchers — team members following a task's progress (avatar stack). */
  watchers: protectedProcedure
    .input(z.object({ taskId: z.number() }))
    .query(async ({ input }) => db.listTaskWatchers(input.taskId)),
  addWatcher: protectedProcedure
    .input(z.object({ taskId: z.number(), memberId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const task = await db.getTask(input.taskId);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      const member = await db.getTeamMemberById(input.memberId);
      if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Team member not found" });
      const id = await db.addTaskWatcher(input.taskId, input.memberId);
      await audit(ctx, "Add Watcher", "task", input.taskId, `${member.name} now watches "${task.title}"`);
      return { id };
    }),
  removeWatcher: protectedProcedure
    .input(z.object({ taskId: z.number(), memberId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.removeTaskWatcher(input.taskId, input.memberId);
      await audit(ctx, "Remove Watcher", "task", input.taskId, `Watcher #${input.memberId} removed`);
      return { ok: true };
    }),
  addComment: protectedProcedure
    .input(z.object({ taskId: z.number(), body: z.string().min(1).max(4000) }))
    .mutation(async ({ ctx, input }) => {
      const task = await db.getTask(input.taskId);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      const id = await db.addTaskComment({
        taskId: input.taskId,
        authorId: ctx.user.id,
        authorName: ctx.user.name ?? ctx.user.email ?? "User",
        body: input.body.trim(),
      });
      await audit(ctx, "Task Comment", "task", input.taskId, input.body.slice(0, 120));
      return { id };
    }),
  /** Assign or re-assign a task to a team member (null clears the assignment). */
  assign: protectedProcedure
    .input(z.object({ id: z.number(), assigneeId: z.number().nullable() }))
    .mutation(async ({ ctx, input }) => {
      if (input.assigneeId !== null) {
        const member = await db.getTeamMemberById(input.assigneeId);
        if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Team member not found" });
        if (!member.active) throw new TRPCError({ code: "BAD_REQUEST", message: "Team member is inactive" });
      }
      await db.updateTask(input.id, { assigneeId: input.assigneeId } as any);
      const name = input.assigneeId ? (await db.getTeamMemberById(input.assigneeId))?.name : null;
      await audit(ctx, "Assign Task", "task", input.id, name ? `Assigned to ${name}` : "Assignment cleared");
      return { success: true };
    }),
  updateStatus: protectedProcedure
   .input(z.object({ id: z.number(), status: z.enum(taskStatuses), completionNotes: z.string().optional() }))
   .mutation(async ({ ctx, input }) => {
      const existing = await db.getTask(input.id);
      await db.updateTask(input.id, {
        status: input.status,
        completionNotes: input.completionNotes,
        completedAt: input.status === "Completed" ? Date.now() : undefined,
      });
      // Keep the group's confirmation badge in sync: cancelling/completing the linked
      // auto-task must not leave a stale "Pending Follow-up" / "Promise to Pay" badge
      // with no open task behind it (badge click would have nothing to open).
      if ((input.status === "Cancelled" || input.status === "Completed") && existing?.description) {
        const followUpGroup = taskGroup(existing);
        const promiseMatch = existing.description.match(/\(Promise #(\d+)\)/);
        let group: string | null = followUpGroup;
        if (!group && promiseMatch && existing.customerId) {
          const cust = await db.getCustomer(existing.customerId);
          if (cust) group = (cust.customerGroup ?? "").trim() || cust.name;
        }
        if (group) {
          const conf = await db.getGroupConfirmationStatus(group);
          const stale =
            (followUpGroup && conf?.status === "Pending Follow-up") ||
            (promiseMatch && conf?.status === "Confirmed");
          if (stale) {
            // Cancelling an open promise's check task also breaks the promise cycle.
            if (promiseMatch && input.status === "Cancelled") {
              const promise = await db.getPromise(Number(promiseMatch[1]));
              if (promise && promise.status === "Pending") {
                await db.updatePromise(promise.id, { status: "Broken" });
                await audit(ctx, "Promise Broken", "promiseToPay", promise.id, "Linked check task cancelled");
              }
            }
            await db.upsertGroupConfirmationStatus(group, {
              status: input.status === "Completed" && promiseMatch ? "Kept" : "Not Contacted",
              amount: "0.00",
              followUpDate: null,
              updatedBy: ctx.user.id,
            });
            await db.addActivityLog({
              groupName: group,
              customerId: existing.customerId ?? undefined,
              activityType: "status_change",
              title: `Status reset — linked task ${input.status.toLowerCase()}`,
              description: `Task #${input.id} was ${input.status.toLowerCase()}; the group's confirmation status was updated so the badge stays consistent.`,
              createdBy: ctx.user.id,
              createdAt: new Date(),
            }).catch(() => {});
          }
        }
      }
      await audit(ctx, `Task ${input.status}`, "task", input.id, input.completionNotes);
      return { success: true };
    }),
  /** Change an open task's due date; every actual date change increments rescheduleCount. */
  reschedule: protectedProcedure
    .input(z.object({ id: z.number(), dueDate: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const task = await db.getTask(input.id);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      if (task.status === "Completed" || task.status === "Cancelled") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only open tasks can be rescheduled" });
      }
      if (task.dueDate === input.dueDate) return { success: true, rescheduleCount: task.rescheduleCount ?? 0 };
      const newCount = (task.rescheduleCount ?? 0) + 1;
      await db.updateTask(input.id, { dueDate: input.dueDate, rescheduleCount: newCount });
      // Keep the group's confirmation-status follow-up date in sync for auto follow-up tasks.
      const followUpGroup = taskGroup(task);
      if (followUpGroup) {
        const group = followUpGroup;
        const conf = await db.getGroupConfirmationStatus(group);
        if (conf && conf.status === "Pending Follow-up") {
          await db.upsertGroupConfirmationStatus(group, { followUpDate: input.dueDate, updatedBy: ctx.user.id });
        }
      }
      await audit(
        ctx,
        "Reschedule Task",
        "task",
        input.id,
        `Due date moved to ${new Date(input.dueDate).toLocaleDateString("en-GB")} — reschedule #${newCount}`
      );
      return { success: true, rescheduleCount: newCount };
    }),
  /**
   * Convert an open Follow-up task into a Promise to Pay:
   * 1. Creates the promise record + auto "Promise to Pay" check task (createGroupPromise)
   * 2. Updates the group's confirmation status to Confirmed (promise date + amount)
   * 3. Cancels the old follow-up task
   */
  convertFollowUpToPromise: protectedProcedure
    .input(
      z.object({
        taskId: z.number(),
        // A promise may be made without naming a figure ("I'll pay") — 0/omitted
        // means "amount not stated", never a zero-value promise.
        amount: z.number().nonnegative().optional(),
        promisedDate: z.number(),
        notes: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const task = await db.getTask(input.taskId);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      if (task.status === "Completed" || task.status === "Cancelled") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only open tasks can be converted" });
      }
      const followUpGroup = taskGroup(task);
      if (!followUpGroup) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This task is not a follow-up task" });
      }
      const group = followUpGroup;
      // "amount not stated" promises are stored as 0 and labelled without a figure.
      const cvAmt = input.amount && input.amount > 0 ? input.amount : 0;
      const cvLabel = cvAmt > 0 ? `€${Number(eur(cvAmt)).toLocaleString()}` : "amount not stated";

      // 1. Create the promise + its check task
      const promiseId = await createGroupPromise(ctx, {
        group,
        customerId: task.customerId ?? undefined,
        amount: cvAmt,
        promisedDate: input.promisedDate,
        notes: input.notes,
      });
      if (!promiseId) throw new TRPCError({ code: "NOT_FOUND", message: "Group not found" });

      // 2. Update the group's confirmation status to Confirmed (Promise to Pay)
      await db.upsertGroupConfirmationStatus(group, {
        status: "Confirmed",
        amount: eur(cvAmt),
        followUpDate: input.promisedDate,
        notes: input.notes,
        updatedBy: ctx.user.id,
      });

      // 3. Cancel the old follow-up task
      await db.updateTask(input.taskId, {
        status: "Cancelled",
        completionNotes: `Converted to Promise to Pay #${promiseId} (${cvLabel} by ${new Date(input.promisedDate).toLocaleDateString("en-GB")})`,
      });

      await db.addActivityLog({
        groupName: group,
        customerId: task.customerId ?? undefined,
        activityType: "status_change",
        title: `Follow-up converted to Promise to Pay — ${cvLabel}`,
        description: `Follow-up task #${input.taskId} cancelled; promise #${promiseId} due ${new Date(input.promisedDate).toLocaleDateString("en-GB")}.`,
        createdBy: ctx.user.id,
        createdAt: new Date(),
      }).catch(() => {});
      await audit(ctx, "Convert Follow-up to Promise", "task", input.taskId, `Promise #${promiseId} created for ${group}`);
      return { success: true, promiseId };
    }),
  /**
   * Rolling flow: from any open PTP / Follow-up task, create the NEXT task
   * (a new Promise to Pay or a new Pending Follow-up) for the same group and
   * cancel the old task. Optionally resolves the current promise first
   * (Kept / Broken) when closing a Promise-to-Pay task.
   */
  createNextTask: protectedProcedure
    .input(
      z.object({
        taskId: z.number(),
        // How to resolve the current promise before moving on (PTP tasks only)
        resolvePromise: z.enum(["Kept", "Broken"]).optional(),
        promiseId: z.number().optional(),
        // The next step
        nextType: z.enum(["promise", "follow-up"]),
        amount: z.number().nonnegative().optional(),
        date: z.number(),
        notes: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const task = await db.getTask(input.taskId);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      if (task.status === "Completed" || task.status === "Cancelled") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only open tasks can roll to a next task" });
      }
      // Resolve the group: follow-up marker, or the task's customer
      const followUpGroup = taskGroup(task);
      let group = followUpGroup;
      const cust = task.customerId ? await db.getCustomer(task.customerId) : null;
      if (!group && cust) group = (cust.customerGroup ?? "").trim() || cust.name;
      if (!group) throw new TRPCError({ code: "NOT_FOUND", message: "Could not resolve the task's group" });

      // 1. Resolve the current promise if requested (Kept / Broken)
      if (input.resolvePromise && input.promiseId) {
        const promise = await db.getPromise(input.promiseId);
        if (promise && promise.status === "Pending") {
          await db.updatePromise(input.promiseId, { status: input.resolvePromise });
          await db.addActivityLog({
            groupName: group,
            customerId: promise.customerId,
            activityType: "promise",
            title: `Promise marked ${input.resolvePromise}`,
            description: `${
              Number(promise.amount ?? 0) > 0 ? `€${Number(promise.amount).toLocaleString()}` : "Payment (amount not stated)"
            } promised for ${new Date(promise.promisedDate).toLocaleDateString("en-GB")}`,
            createdBy: ctx.user.id,
            createdAt: new Date(),
          }).catch(() => {});
          await audit(ctx, `Promise ${input.resolvePromise}`, "promiseToPay", input.promiseId);
        }
      }

     // 2. Cancel the old task BEFORE creating the new one, so upsertFollowUpTask
     //    does not "reuse" the task we are replacing.
     await db.updateTask(input.taskId, {
        status: "Cancelled",
       completionNotes: `Rolled into a new ${input.nextType === "promise" ? "Promise to Pay" : "Pending Follow-up"} for ${new Date(input.date).toLocaleDateString("en-GB")}`,
     });

      // 3. Create the next step + update the group's confirmation badge
      let newPromiseId: number | null = null;
      let newTaskId: number | null = null;
      // A next promise may carry no figure at all ("customer will pay, no amount given").
      const nextAmt = input.amount && input.amount > 0 ? input.amount : 0;
      const nextLabel = nextAmt > 0 ? `€${Number(eur(nextAmt)).toLocaleString()}` : "amount not stated";
      if (input.nextType === "promise") {
        newPromiseId = await createGroupPromise(ctx, {
          group,
          customerId: task.customerId ?? undefined,
          amount: nextAmt,
          promisedDate: input.date,
          notes: input.notes,
        });
        if (!newPromiseId) throw new TRPCError({ code: "NOT_FOUND", message: "Group not found" });
        await db.upsertGroupConfirmationStatus(group, {
          status: "Confirmed",
          amount: eur(nextAmt),
          followUpDate: input.date,
          notes: input.notes,
          updatedBy: ctx.user.id,
        });
      } else {
        newTaskId = await upsertFollowUpTask(ctx, {
          group,
          customerId: task.customerId ?? undefined,
          followUpDate: input.date,
          amount: input.amount,
          notes: input.notes,
        });
        if (!newTaskId) throw new TRPCError({ code: "NOT_FOUND", message: "Group not found" });
        await db.upsertGroupConfirmationStatus(group, {
          status: "Pending Follow-up",
          amount: input.amount && input.amount > 0 ? eur(input.amount) : "0.00",
          followUpDate: input.date,
          notes: input.notes,
          updatedBy: ctx.user.id,
        });
      }

      await db.addActivityLog({
        groupName: group,
        customerId: task.customerId ?? undefined,
        activityType: "status_change",
        title:
          input.nextType === "promise"
            ? `Next step: Promise to Pay — ${nextLabel} by ${new Date(input.date).toLocaleDateString("en-GB")}`
            : `Next step: Follow-up call on ${new Date(input.date).toLocaleDateString("en-GB")}`,
        description: `Task #${input.taskId} closed${input.resolvePromise ? ` (promise ${input.resolvePromise})` : ""} and rolled into the next step.`,
        createdBy: ctx.user.id,
        createdAt: new Date(),
      }).catch(() => {});
      // Carry the old task's watchers over to the new follow-up task (if one was created).
      if (newTaskId) {
        const oldWatchers = await db.listTaskWatchers(input.taskId).catch(() => []);
        for (const w of oldWatchers) {
          await db.addTaskWatcher(newTaskId, w.memberId).catch(() => {});
        }
      }
      await audit(ctx, "Create Next Task", "task", input.taskId, `${group}: next ${input.nextType} on ${new Date(input.date).toLocaleDateString("en-GB")}`);
      return { success: true, newPromiseId, newTaskId, group };
    }),
  /** Open invoices of the task's group (due-date ordered) — used by the next-task picker. */
  groupOpenInvoices: protectedProcedure
    .input(z.object({ taskId: z.number() }))
    .query(async ({ input }) => {
      const task = await db.getTask(input.taskId);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      const followUpGroup = taskGroup(task);
      let group = followUpGroup;
      const cust = task.customerId ? await db.getCustomer(task.customerId) : null;
      if (!group && cust) group = (cust.customerGroup ?? "").trim() || cust.name;
      if (!group) return { group: null, invoices: [] };
      const customers = await db.listCustomers();
      const memberIds = new Set(customers.filter(c => (((c.customerGroup ?? "").trim() || c.name) === group)).map(c => c.id));
      const invoices = (await db.listInvoices()).filter(i => memberIds.has(i.customerId) && isOpenInvoice(i));
      const nameById = new Map(customers.map(c => [c.id, c.name]));
      const rows = invoices
        .map(i => ({
          id: i.id,
          invoiceNumber: i.invoiceNumber,
          customerName: nameById.get(i.customerId) ?? "",
          dueDate: i.dueDate,
          amount: outstanding(i),
          currency: i.currency ?? "EUR",
          overdue: i.dueDate != null && i.dueDate < Date.now(),
        }))
        .sort((a, b) => (a.dueDate ?? 0) - (b.dueDate ?? 0));
      return { group, invoices: rows };
    }),
  /**
   * Reschedule an open promise from its check task: moves the promise date/amount
   * (customer moved the payment), updates the linked task, keeps the confirmation
   * badge (Confirmed) date in sync.
   */
  reschedulePromise: protectedProcedure
    .input(
      z.object({
        taskId: z.number(),
        promiseId: z.number(),
        // 0 / omitted keeps the promise's existing amount (see rescheduleGroupPromise).
        amount: z.number().nonnegative().optional(),
        promisedDate: z.number(),
        notes: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const task = await db.getTask(input.taskId);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      const promise = await db.getPromise(input.promiseId);
      if (!promise || promise.status !== "Pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only open promises can be rescheduled" });
      }
      const cust = await db.getCustomer(promise.customerId);
      const group = cust ? ((cust.customerGroup ?? "").trim() || cust.name) : null;
      if (!group) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found" });
      // No new figure entered → keep whatever the promise already carried (which may
      // itself be "amount not stated" = 0).
      const rsAmt = input.amount && input.amount > 0 ? input.amount : Number(promise.amount ?? 0);
      const res = await rescheduleGroupPromise(ctx, {
        group,
        promiseId: input.promiseId,
        amount: rsAmt,
        promisedDate: input.promisedDate,
        notes: input.notes,
      });
      if (!res) throw new TRPCError({ code: "BAD_REQUEST", message: "Promise could not be rescheduled" });
      // Keep the group's Confirmed badge date/amount in sync
      const conf = await db.getGroupConfirmationStatus(group);
      if (conf && conf.status === "Confirmed") {
        await db.upsertGroupConfirmationStatus(group, {
          amount: eur(rsAmt),
          followUpDate: input.promisedDate,
          updatedBy: ctx.user.id,
        });
      }
      return { success: true };
    }),
});

/**
 * Team members — collaborators who manage customers (account managers) and
 * take on tasks. Managed in-app; no login is required for a member.
 */
export const teamRouter = router({
  list: protectedProcedure
    .input(z.object({ includeInactive: z.boolean().optional() }).optional())
    .query(async ({ input }) => db.listTeamMembers(input?.includeInactive ?? false)),
  /**
   * The caller's @mentions inbox. A mention is a reference written by a colleague
   * inside a note — it carries no due date and never becomes a task.
   */
  myMentions: protectedProcedure
    .input(z.object({ unreadOnly: z.boolean().optional(), limit: z.number().min(1).max(200).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const me = await db.getTeamMemberByUserId(ctx.user.id).catch(() => null);
      if (!me) return { memberId: null as number | null, unread: 0, items: [] as any[] };
      const rows = await db
        .listMentionsForMember(me.id, { unreadOnly: input?.unreadOnly, limit: input?.limit ?? 50 })
        .catch(() => [] as any[]);
      const unread = await db.countUnreadMentions(me.id).catch(() => 0);
      const authors = await db.listTeamMembers(true).catch(() => [] as any[]);
      const users = await db.listUsers().catch(() => [] as any[]);
      const authorName = (userId: number | null) => {
        if (!userId) return null;
        const viaTeam = authors.find((a: any) => a.userId === userId);
        if (viaTeam?.name) return viaTeam.name as string;
        const u = (users ?? []).find((x: any) => x.id === userId);
        return (u?.name as string) ?? null;
      };
      return {
        memberId: me.id,
        unread,
        items: rows.map((r: any) => ({
          id: r.id,
          group: r.groupName,
          source: r.source as "call" | "collectionNotes" | "groupNote",
          excerpt: r.excerpt as string | null,
          createdAt: r.createdAt as Date,
          readAt: r.readAt as Date | null,
          byName: authorName(r.createdBy ?? null),
        })),
      };
    }),
  /** Mark one mention (or all of mine) as seen. */
  markMentionsRead: protectedProcedure
    .input(z.object({ mentionId: z.number().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      const me = await db.getTeamMemberByUserId(ctx.user.id).catch(() => null);
      if (!me) return { success: false as const };
      await db.markMentionsRead(me.id, input?.mentionId);
      return { success: true as const };
    }),
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(191),
      email: z.string().email().max(320).optional(),
      phone: z.string().max(64).optional(),
      title: z.string().max(128).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = await db.createTeamMember({
        name: input.name.trim(),
        email: input.email?.trim() || null,
        phone: input.phone?.trim() || null,
        title: input.title?.trim() || null,
      });
      await audit(ctx, "Create Team Member", "teamMember", Number(id), `Member "${input.name.trim()}" created`);
      return { id: Number(id) };
    }),
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(191).optional(),
      email: z.string().email().max(320).nullable().optional(),
      phone: z.string().max(64).nullable().optional(),
      title: z.string().max(128).nullable().optional(),
      active: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const member = await db.getTeamMemberById(id);
      if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Team member not found" });
      await db.updateTeamMember(id, data as any);
      await audit(ctx, "Update Team Member", "teamMember", id, data.active === false ? `Member "${member.name}" deactivated` : undefined);
      return { success: true };
    }),
  remove: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const member = await db.getTeamMemberById(input.id);
      if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Team member not found" });
      await db.deleteTeamMember(input.id);
      await audit(ctx, "Delete Team Member", "teamMember", input.id, `Member "${member.name}" deleted (detached from customers & tasks)`);
      return { success: true };
    }),
  /** Per-member workload: managed companies/groups and open task counts. */
  workload: protectedProcedure.query(async () => {
    const [members, allCustomers, allTasks] = await Promise.all([
      db.listTeamMembers(true),
      db.listCustomers(),
      db.listTasks({ statuses: ["Pending", "In Progress"] }),
    ]);
    return members.map(m => {
      const managed = allCustomers.filter(c => c.accountManagerId === m.id);
      const groups = new Set(managed.map(c => (c.customerGroup ?? "").trim() || c.name));
      const openTasks = allTasks.filter(t => t.assigneeId === m.id).length;
      const collecting = allCustomers.filter(c => (c as any).collectorId === m.id);
      const collectingGroups = new Set(collecting.map(c => (c.customerGroup ?? "").trim() || c.name));
      return {
        ...m,
        companies: managed.length,
        groups: groups.size,
        collectingCompanies: collecting.length,
        collectingGroups: collectingGroups.size,
        openTasks,
      };
    });
  }),
  /**
   * Sign-in accounts a team member can be linked to. Without a link, "@Name" has
   * no inbox to reach, so the Team screen has to be able to offer this list.
   * `linkedToMemberId` marks accounts already taken by another member.
   */
  linkableUsers: protectedProcedure.query(async () => {
    const [allUsers, members] = await Promise.all([
      db.listUsers().catch(() => [] as any[]),
      db.listTeamMembers(true).catch(() => [] as any[]),
    ]);
    const takenBy = new Map<number, { id: number; name: string }>();
    for (const m of members as any[]) {
      if (m.userId) takenBy.set(Number(m.userId), { id: Number(m.id), name: String(m.name) });
    }
    return (allUsers as any[])
      .map(u => ({
        id: Number(u.id),
        name: String(u.name ?? u.email ?? `User ${u.id}`),
        email: (u.email ?? null) as string | null,
        lastSignedIn: (u.lastSignedIn ?? null) as Date | null,
        linkedToMemberId: takenBy.get(Number(u.id))?.id ?? null,
        linkedToMemberName: takenBy.get(Number(u.id))?.name ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }),
  /**
   * Link (or unlink) a team member to a sign-in account. The relationship is
   * one-to-one: an account already linked to somebody else is rejected rather
   * than silently moved, so two members can never share one inbox.
   */
  setUserLink: protectedProcedure
    .input(z.object({ id: z.number(), userId: z.number().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const member = await db.getTeamMemberById(input.id);
      if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Team member not found" });
      if (input.userId !== null) {
        const allUsers = await db.listUsers().catch(() => [] as any[]);
        if (!(allUsers as any[]).some(u => Number(u.id) === input.userId)) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Sign-in account not found" });
        }
        const members = await db.listTeamMembers(true).catch(() => [] as any[]);
        const clash = (members as any[]).find(
          m => Number(m.userId) === input.userId && Number(m.id) !== input.id,
        );
        if (clash) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `That sign-in account is already linked to ${clash.name}`,
          });
        }
      }
      await db.updateTeamMember(input.id, { userId: input.userId } as any);
      await audit(
        ctx,
        "Link Team Member Login",
        "teamMember",
        input.id,
        input.userId === null
          ? `"${member.name}" unlinked from its sign-in account`
          : `"${member.name}" linked to sign-in account #${input.userId}`,
      );
      return { success: true as const };
    }),
});

export const forecastRouter = router({
  /** Dashboard KPIs + 6-month forecast. */
  dashboard: protectedProcedure.query(async () => {
    const now = Date.now();
    const nowDate = new Date(now);
    const year = nowDate.getUTCFullYear();
    const month = nowDate.getUTCMonth() + 1;
    const { start, end } = monthRange(year, month);
    const [invoices, installments, forecastTarget, receiptsCollected, tasksPending, dashMonthWires] = await Promise.all([
      db.listInvoices(),
      db.listInstallments(),
      db.sumForecastExpected(year, month),
      db.sumReceiptsInRange(start, end),
      db.listTasks({ statuses: ["Pending", "In Progress"] }),
      db.listReceivedWireTransfersInRange(start, end).catch(() => []),
    ]);
    const collectedThisMonth = receiptsCollected + dashMonthWires.reduce((s, w) => s + Number(w.amount), 0);
    const aging = computeAging(invoices, now);
    const arBalance = aging.totalOverdue + aging.current;
    const last90Sales = await db.sumInvoicedInRange(now - 90 * 24 * 60 * 60 * 1000, now);
    const dso = computeDso(arBalance, last90Sales, 90);
    const forecast = buildForecast(invoices, installments, now, 6);
    // Contract installments are "must pay on time" invoices — even 1 day overdue is a red flag.
    const overdueContractInvoices = invoices.filter(i => i.isContractInstallment && isOpenInvoice(i) && daysOverdue(i.dueDate, now) > 0);
    const overdueContractCount = overdueContractInvoices.length;
    const overdueContractAmount = overdueContractInvoices.reduce((s, i) => s + outstanding(i), 0);
    // Groups with a positive forecast this month whose effective confirmation status
    // is still "Not Contacted" (no row, or stale row) → the collector must call them.
    const [monthForecastEntries, confirmationRows, watchRowsDash, dashCustomers] = await Promise.all([
      db.listForecastEntries(year, month).catch(() => []),
      db.listGroupConfirmationStatuses().catch(() => []),
      db.listGroupWatchStatuses().catch(() => []),
      db.listCustomers().catch(() => []),
    ]);
    const confirmationByGroup = new Map(confirmationRows.map(r => [r.groupName, r]));
    const forecastGroups = new Set<string>();
    const forecastAmountByGroup = new Map<string, number>();
    for (const fe of monthForecastEntries) {
      if (!fe.customerGroup) continue;
      const amt = Number(fe.expectedAmount);
      forecastAmountByGroup.set(fe.customerGroup, (forecastAmountByGroup.get(fe.customerGroup) ?? 0) + amt);
      if (amt > 0) forecastGroups.add(fe.customerGroup);
    }
    let pendingContactGroups = 0;
    for (const g of Array.from(forecastGroups)) {
      const eff = effectiveConfirmation(confirmationByGroup.get(g));
      if (eff.status === "Not Contacted") pendingContactGroups++;
    }
    // Status counts must match the Customers groups list, which resolves the
    // effective status per group (manual override OR the auto-problematic rule:
    // forecast covers < 80% of what will be overdue by end of month).
    const watchByGroupDash = new Map<string, { status: string; problematicSince: number | null }>();
    for (const w of watchRowsDash) {
      watchByGroupDash.set(w.groupName, { status: w.status, problematicSince: w.problematicSince ?? null });
    }
    const eomTs = endOfCurrentMonth(nowDate);
    const groupKeyOfDash = (c: { customerGroup: string | null; name: string }) => (c.customerGroup ?? "").trim() || c.name;
    const groupOfCustomerId = new Map<number, string>();
    const allGroupNames = new Set<string>();
    for (const c of dashCustomers) {
      const key = groupKeyOfDash(c);
      groupOfCustomerId.set(c.id, key);
      allGroupNames.add(key);
    }
    const overdueEomByGroup = new Map<string, number>();
    // Portfolio-wide projection: everything still open whose due date falls on
    // or before the last day of the current month will be overdue by then.
    // Includes what is already overdue today, so it is always >= totalOverdue.
    let overdueEomTotal = 0;
    let overdueEomCount = 0;
    for (const inv of invoices) {
      if (!isOpenInvoice(inv)) continue;
      if (inv.dueDate <= eomTs) {
        overdueEomTotal += outstanding(inv);
        overdueEomCount++;
      }
      const gKey = groupOfCustomerId.get(inv.customerId);
      if (!gKey) continue;
      if (inv.dueDate <= eomTs) {
        overdueEomByGroup.set(gKey, (overdueEomByGroup.get(gKey) ?? 0) + outstanding(inv));
      }
    }
    let problematicGroups = 0;
    let criticalGroups = 0;
    let onHoldGroups = 0;
    for (const gName of Array.from(allGroupNames)) {
      const overdueEom = overdueEomByGroup.get(gName) ?? 0;
      const hasFc = forecastAmountByGroup.has(gName);
      const fcForRule = hasFc ? (forecastAmountByGroup.get(gName) ?? 0) : 0;
      const autoProblematic = overdueEom > 0 && fcForRule < 0.8 * overdueEom;
      const resolved = resolveGroupStatus(watchByGroupDash.get(gName) ?? null, autoProblematic, now);
      if (resolved.status === "Problematic") problematicGroups++;
      else if (resolved.status === "Critical") criticalGroups++;
      else if (resolved.status === "On Hold" || resolved.status === "Legal") onHoldGroups++;
    }
    return {
      year,
      month,
      target: forecastTarget,
      collected: collectedThisMonth,
      totalOverdue: aging.totalOverdue,
      overdueCount: Object.values(aging.buckets).reduce((s, b) => s + b.count, 0),
      // Overdue projected at end of the current month (today's overdue plus
      // invoices falling due within the rest of the month).
      overdueEom: overdueEomTotal,
      overdueEomCount,
      overdueEomDate: eomTs,
      arBalance,
      dso,
      aging,
      forecast,
      pendingTasks: tasksPending.length,
      overdueContractCount,
      overdueContractAmount,
      onHoldPending: criticalGroups,
      onHoldGroups,
      problematicGroups,
      pendingContactGroups,
    };
  }),
  plans: protectedProcedure.query(async () => {
    // Unified with Smart Forecast: target = sum of expected amounts (user-adjusted) per forecast month.
    const months = await db.listForecastMonths();
    const results = [] as { year: number; month: number; targetAmount: string; actual: number }[];
    for (const m of months) {
      const [target, { start, end }] = [await db.sumForecastExpected(m.year, m.month), monthRange(m.year, m.month)];
      const actual = await db.sumReceiptsInRange(start, end);
      results.push({ year: m.year, month: m.month, targetAmount: String(target ?? 0), actual });
    }
    return results;
  }),
  promises: protectedProcedure.query(async () => {
    const rows = await db.listPromises();
    const customers = await db.listCustomers();
    const byId = new Map(customers.map(c => [c.id, c]));
    return rows.map(p => ({ ...p, customerName: byId.get(p.customerId)?.name ?? "—" }));
  }),
  addPromise: protectedProcedure
    .input(z.object({ customerId: z.number(), invoiceId: z.number().optional(), promisedDate: z.number(), amount: z.number().nonnegative().optional(), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      // 0 / omitted = "amount not stated" (the customer promised to pay without a figure).
      const amt = input.amount && input.amount > 0 ? input.amount : 0;
      const amtLabel = amt > 0 ? `€${Number(eur(amt)).toLocaleString()}` : "amount not stated";
      const id = await db.createPromise({ ...input, amount: eur(amt), createdBy: ctx.user.id });
      await audit(ctx, "Record Promise-to-Pay", "promiseToPay", id, `Customer #${input.customerId} promised ${amtLabel} by ${new Date(input.promisedDate).toISOString().slice(0, 10)}`);
      const cust = await db.getCustomer(input.customerId);
      if (cust) {
        const groupKey = cust.customerGroup || cust.name;
        const dateStr = new Date(input.promisedDate).toLocaleDateString("en-GB");
        // Log to activity log
        await db.addActivityLog({
          groupName: groupKey,
          customerId: input.customerId,
          activityType: "promise",
          title: `Promise-to-Pay: ${amtLabel} by ${dateStr}`,
          description: `${cust.name}${input.notes ? ` — ${input.notes}` : ""}`,
          createdBy: ctx.user.id,
          createdAt: new Date(),
        }).catch(() => {});
        // Create a follow-up task due on the promised date so the team checks whether the company paid.
        const taskId = await db.createTask({
          customerId: input.customerId,
          type: "Manual",
          title: amt > 0 ? `Promise to Pay — ${amtLabel}` : `Promise to Pay — ${groupKey}`,
          description: `Verify that ${cust.name} paid ${amt > 0 ? `the promised amount of ${amtLabel}` : "the promised payment"} due ${dateStr}.${input.notes ? ` Notes: ${input.notes}` : ""} (Promise #${id})`,
          dueDate: input.promisedDate,
          invoiceId: input.invoiceId,
          status: "Pending",
          assignedTo: ctx.user.id,
          customerGroup: groupKey,
          promiseId: id,
        } as any);
        await audit(ctx, "Create Task", "task", taskId, `Auto follow-up for promise #${id} (${cust.name})`);
      }
      return { id };
    }),
  updatePromise: protectedProcedure
    .input(z.object({ id: z.number(), status: z.enum(["Pending", "Kept", "Broken"]) }))
    .mutation(async ({ ctx, input }) => {
      await db.updatePromise(input.id, { status: input.status });
      await audit(ctx, `Promise ${input.status}`, "promiseToPay", input.id);
      if (input.status === "Kept" || input.status === "Broken") {
        const promise = await db.getPromise(input.id);
        const cust = promise ? await db.getCustomer(promise.customerId) : null;
        if (promise && cust) {
          const groupKey = cust.customerGroup?.trim() ? cust.customerGroup.trim() : cust.name;
          const dateStr = new Date(promise.promisedDate).toLocaleDateString("en-GB");
          // Keep the group's confirmation badge in sync: the badge shows "Promise to Pay"
          // (Confirmed) while the promise is open. When the promise is resolved,
          // reflect the outcome — Kept → back to Not Contacted (cycle finished),
          // Broken → "Not Confirmed" (Broken) with amount reset.
          const conf = await db.getGroupConfirmationStatus(groupKey);
          if (conf && conf.status === "Confirmed") {
            await db.upsertGroupConfirmationStatus(groupKey, {
              status: input.status === "Broken" ? "Broken" : "Kept",
              amount: input.status === "Broken" ? "0.00" : String(promise.amount ?? 0),
              followUpDate: null,
              updatedBy: ctx.user.id,
            });
          }
          // Log to activity log
          await db.addActivityLog({
            groupName: groupKey,
            customerId: promise.customerId,
            activityType: "promise",
            title: `Promise marked ${input.status}`,
            description: `${cust.name} — ${
              Number(promise.amount ?? 0) > 0 ? `€${Number(promise.amount).toLocaleString()}` : "amount not stated"
            }`,
            createdBy: ctx.user.id,
            createdAt: new Date(),
          }).catch(() => {});
          // Auto-complete the follow-up task linked to this promise, if still open.
          const tasks = await db.listTasks({ customerId: promise.customerId });
          const followUp = tasks.find(
            t => (t.status === "Pending" || t.status === "In Progress") && taskPromiseId(t) === input.id,
          );
          if (followUp) {
            await db.updateTask(followUp.id, {
              status: "Completed",
              completionNotes: `Promise marked ${input.status}`,
              completedAt: Date.now(),
            });
            await audit(ctx, "Task Completed", "task", followUp.id, `Auto-completed: promise #${input.id} marked ${input.status}`);
          }
        }
      }
      return { success: true };
    }),

  /** Generate (or refresh) the smart per-GROUP forecast for a month (manual Refresh only). */
  generateSmart: protectedProcedure
    .input(z.object({ year: z.number().int(), month: z.number().int().min(1).max(12), useAi: z.boolean().default(true), confirmRerun: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => {
      const role = await getAppRole(ctx.user.id);
      requireRole(role, ["Administrator", "Management", "Credit Controller", "Accounting"]);
      // One forecast per month: if it already ran, an explicit confirmation is required.
      const existing = await db.listForecastEntries(input.year, input.month);
      if (existing.length > 0 && !input.confirmRerun) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `The forecast for ${input.month}/${input.year} has already run. Re-running it will alter the month's forecast.`,
        });
      }
      const result = await generateMonthlyForecast(input.year, input.month, { useAi: input.useAi });
      await audit(ctx, "Generate Smart Forecast", "forecast", `${input.year}-${input.month}`, `${result.groups} groups (${result.aiCount} AI, ${result.heuristicCount} heuristic)`);
      return result;
    }),

  /** Whether the month's forecast has already been generated (and when). */
  smartStatus: protectedProcedure
    .input(z.object({ year: z.number().int(), month: z.number().int().min(1).max(12) }))
    .query(async ({ input }) => {
      const entries = await db.listForecastEntries(input.year, input.month);
      if (entries.length === 0) return { hasRun: false as const, generatedAt: null, groups: 0, adjustedCount: 0 };
      const generatedAt = entries.reduce<Date | null>((min, e) => (!min || e.createdAt < min ? e.createdAt : min), null);
      const adjustedCount = entries.filter(e => e.userAdjusted === 1).length;
      return { hasRun: true as const, generatedAt, groups: entries.length, adjustedCount };
    }),

  /** Per-GROUP forecast entries for a month, with live collected amounts (EUR). */
  smartEntries: protectedProcedure
    .input(z.object({ year: z.number().int(), month: z.number().int().min(1).max(12) }))
    .query(async ({ input }) => {
      const [entries, customers, receipts, behaviorRows] = await Promise.all([
        db.listForecastEntries(input.year, input.month),
        db.listCustomers(),
        db.listReceipts(),
        db.listPaymentBehaviorWithGroup().catch(() => []),
      ]);
      const byId = new Map(customers.map(c => [c.id, c]));
      const behaviorByCustomer = new Map(behaviorRows.map(r => [r.customerId, r]));
      const groupStats = aggregateGroupBehavior(behaviorRows as BehaviorRow[]);
      // Map group key -> member customer ids (single companies group under their own name).
      const memberIds = new Map<string, number[]>();
      for (const c of customers) {
        const key = c.customerGroup?.trim() ? c.customerGroup.trim() : c.name;
        const arr = memberIds.get(key);
        if (arr) arr.push(c.id);
        else memberIds.set(key, [c.id]);
      }
      const { start, end } = monthRange(input.year, input.month);
      const collectedByCustomer = new Map<number, number>();
      for (const r of receipts) {
        if (r.receiptDate >= start && r.receiptDate < end) {
          collectedByCustomer.set(r.customerId, (collectedByCustomer.get(r.customerId) ?? 0) + Number(r.amount));
        }
      }
      // Received wire transfers count toward collected (manual invoice matching is separate)
      const smartMonthWires = await db.listReceivedWireTransfersInRange(start, end).catch(() => []);
      for (const w of smartMonthWires) {
        collectedByCustomer.set(w.customerId, (collectedByCustomer.get(w.customerId) ?? 0) + Number(w.amount));
      }
      const rows = entries.map(e => {
        const cust = byId.get(e.customerId);
        const groupKey = e.customerGroup ?? (cust?.customerGroup?.trim() ? cust.customerGroup.trim() : cust?.name ?? "—");
        const ids = memberIds.get(groupKey) ?? [e.customerId];
        // Collected in-month across ALL member companies of the group (EUR).
        const collected = ids.reduce((s, id) => s + (collectedByCustomer.get(id) ?? 0), 0);
        const hist = behaviorByCustomer.get(e.customerId) ?? null;
        const gb = groupStats.get(groupKey) ?? null;
        return {
          ...e,
          customerName: groupKey,
          customerTier: cust?.tier ?? "New",
          customerGroup: groupKey,
          companiesCount: ids.length,
          avgDaysLate: hist?.avgDaysLate ?? null,
          medianDaysLate: hist?.medianDaysLate ?? null,
          historyPayments: hist?.payments ?? 0,
          groupAvgDaysLate: gb?.avgDaysLate ?? null,
          groupMedianDaysLate: gb?.medianDaysLate ?? null,
          collected,
          remaining: Math.max(0, Number(e.expectedAmount) - collected),
        };
      });
      const totals = rows.reduce(
        (acc, r) => {
          acc.due += Number(r.dueAmount);
          acc.overdue += Number(r.overdueAmount);
          acc.aiSuggested += Number(r.aiSuggestedAmount);
          acc.expected += Number(r.expectedAmount);
          acc.initial += Number(r.initialForecast ?? 0);
          acc.collected += r.collected;
          return acc;
        },
        { due: 0, overdue: 0, aiSuggested: 0, expected: 0, initial: 0, collected: 0 },
      );
      return { entries: rows, totals: { ...totals, remaining: Math.max(0, totals.expected - totals.collected), initial: totals.initial } };
    }),

  /** Months that have a generated smart forecast. */
  smartMonths: protectedProcedure.query(async () => db.listForecastMonths()),

  /** User override of the expected amount for one forecast entry. */
  adjustEntry: protectedProcedure
    .input(z.object({ id: z.number(), expectedAmount: z.number().nonnegative(), note: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const entry = await db.getForecastEntry(input.id);
      if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Forecast entry not found" });
      await db.updateForecastEntry(input.id, {
        expectedAmount: eur(input.expectedAmount),
        userAdjusted: 1,
        adjustedBy: ctx.user.id,
        adjustmentNote: input.note,
      });
      await audit(ctx, "Adjust Forecast Entry", "forecastEntry", input.id, `Customer #${entry.customerId}: €${eur(Number(entry.expectedAmount))} → €${eur(input.expectedAmount)}${input.note ? ` (${input.note})` : ""}`);
      return { success: true };
    }),

  /** Reset an entry back to the AI suggestion. */
  resetEntry: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const entry = await db.getForecastEntry(input.id);
      if (!entry) throw new TRPCError({ code: "NOT_FOUND" });
      await db.updateForecastEntry(input.id, {
        expectedAmount: entry.aiSuggestedAmount,
        userAdjusted: 0,
        adjustedBy: null,
        adjustmentNote: null,
      });
      await audit(ctx, "Reset Forecast Entry", "forecastEntry", input.id);
      return { success: true };
    }),

  /** Set (correct) a group's current-month forecast from the Customers list. Updates both expectedAmount and initialForecast — the corrected value becomes the month's baseline. */
  setGroupForecast: protectedProcedure
    .input(z.object({ group: z.string().min(1), amount: z.number().nonnegative() }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const year = now.getUTCFullYear();
      const month = now.getUTCMonth() + 1;
      const entries = await db.listForecastEntries(year, month);
      const entry = entries.find(e => (e.customerGroup ?? "").trim() === input.group);
      if (entry) {
        await db.updateForecastEntry(entry.id, {
          expectedAmount: eur(input.amount),
          initialForecast: eur(input.amount),
          userAdjusted: 1,
          adjustedBy: ctx.user.id,
          adjustmentNote: "Corrected from Customers list",
        });
        await audit(ctx, "Set Group Forecast", "forecastEntry", entry.id, `${input.group}: €${eur(Number(entry.expectedAmount))} → €${eur(input.amount)}`);
        return { success: true, id: entry.id };
      }
      // No entry yet for this month — create one keyed to the group's primary member.
      const customers = await db.listCustomers();
      const members = customers.filter(c => ((c.customerGroup ?? "").trim() || c.name) === input.group);
      if (members.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Group not found" });
      const primary = members[0];
      const id = await db.upsertForecastEntry({
        year,
        month,
        customerId: primary.id,
        customerGroup: input.group,
        dueAmount: "0.00",
        overdueAmount: "0.00",
        aiSuggestedAmount: "0.00",
        aiReasoning: null,
        expectedAmount: eur(input.amount),
      } as any);
      await db.updateForecastEntry(id, {
        expectedAmount: eur(input.amount),
        initialForecast: eur(input.amount),
        userAdjusted: 1,
        adjustedBy: ctx.user.id,
        adjustmentNote: "Set from Customers list",
      });
      await audit(ctx, "Set Group Forecast", "forecastEntry", id, `${input.group}: new entry €${eur(input.amount)}`);
      return { success: true, id };
    }),
});

export const reportsRouter = router({
  /** SOA (Statement of Account) data for a customer. */
  soa: protectedProcedure.input(z.object({ customerId: z.number() })).query(async ({ input }) => {
    const customer = await db.getCustomer(input.customerId);
    if (!customer) throw new TRPCError({ code: "NOT_FOUND" });
    const invoices = await db.listInvoices({ customerId: input.customerId });
    const receipts = await db.listReceipts(input.customerId);
    const now = Date.now();
    const open = invoices.filter(isOpenInvoice);
    return {
      customer,
      lines: open
        .sort((a, b) => a.dueDate - b.dueDate)
        .map(i => ({
          invoiceNumber: i.invoiceNumber,
          issueDate: i.issueDate,
          dueDate: i.dueDate,
          amount: Number(i.amount),
          paid: Number(i.paidAmount),
          outstanding: outstanding(i),
          daysOverdue: daysOverdue(i.dueDate, now),
        })),
      totalOutstanding: open.reduce((s, i) => s + outstanding(i), 0),
      receiptsLast12m: receipts.filter(r => r.receiptDate > now - 365 * 24 * 60 * 60 * 1000).length,
    };
  }),
  collectionsHistory: protectedProcedure
    .input(z.object({ customerId: z.number().optional(), months: z.number().int().min(1).max(36).default(12) }))
    .query(async ({ input }) => {
      const receipts = await db.listReceipts(input.customerId);
      const now = new Date();
      const buckets: { year: number; month: number; total: number; count: number }[] = [];
      for (let i = input.months - 1; i >= 0; i--) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
        buckets.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, total: 0, count: 0 });
      }
      for (const r of receipts) {
        const d = new Date(r.receiptDate);
        const b = buckets.find(b => b.year === d.getUTCFullYear() && b.month === d.getUTCMonth() + 1);
        if (b) {
          b.total += Number(r.amount);
          b.count += 1;
        }
      }
      return buckets;
    }),
  audit: protectedProcedure.query(async ({ ctx }) => {
    const role = await getAppRole(ctx.user.id);
    requireRole(role, ["Administrator", "Management"]);
    return db.listAudit(300);
  }),
  /** Export aging report / forecast / SOA to Excel or PDF; returns base64. */
  export: protectedProcedure
    .input(z.object({
      report: z.enum(["aging", "forecast", "soa", "soa-group"]),
      format: z.enum(["xlsx", "pdf"]),
      customerId: z.number().optional(),
      group: z.string().optional(),
      branch: z.string().optional(),
      minDaysOverdue: z.number().int().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const now = Date.now();
      // New sample-styled Statement of Account PDF (per-company statements,
      // TOTAL AMOUNTS across branches + ANALYSIS per branch + bank details).
      if ((input.report === "soa-group" || input.report === "soa") && input.format === "pdf") {
        const [customersAll, allInvoices, vesselsAll] = await Promise.all([db.listCustomers(), db.listInvoices(), db.listVessels()]);
        let members: typeof customersAll;
        let scopeName: string;
        if (input.report === "soa-group") {
          if (!input.group) throw new TRPCError({ code: "BAD_REQUEST", message: "group is required for group SOA export" });
          members = customersAll.filter(c => ((c.customerGroup ?? "").trim() || c.name) === input.group);
          if (members.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Group not found" });
          if (input.customerId !== undefined) members = members.filter(m => m.id === input.customerId);
          scopeName = input.group;
        } else {
          if (!input.customerId) throw new TRPCError({ code: "BAD_REQUEST", message: "customerId is required for SOA export" });
          const customer = customersAll.find(c => c.id === input.customerId);
          if (!customer) throw new TRPCError({ code: "NOT_FOUND" });
          members = [customer];
          scopeName = customer.name;
        }
        const memberIds = new Set(members.map(m => m.id));
        const invs = allInvoices.filter(
          i => memberIds.has(i.customerId) && (input.branch === undefined || i.company === input.branch),
        );
        const stmt = buildGroupStatement({
          groupName: scopeName,
          now,
          customers: members.map(m => ({ id: m.id, name: m.name, paymentTermsDays: m.paymentTermsDays })),
          invoices: invs,
          vesselNames: new Map(vesselsAll.map(v => [v.id, v.name])),
          minDaysOverdue: input.minDaysOverdue,
        });
        const buffer = await buildStatementPdf(stmt);
        await audit(ctx, `Export ${input.report} (pdf statement)`, "report", input.report);
        return {
          filename: `SOA-${scopeName.replace(/[^A-Za-z0-9]+/g, "_")}-${new Date().toISOString().slice(0, 10)}.pdf`,
          mimeType: "application/pdf",
          base64: buffer.toString("base64"),
        };
      }
      let spec: TableSpec;
      if (input.report === "aging") {
        const invoices = await db.listInvoices();
        const customers = await db.listCustomers();
        const byId = new Map(customers.map(c => [c.id, c]));
        const open = invoices.filter(i => isOpenInvoice(i) && now > i.dueDate);
        spec = {
          title: "Aging Report",
          columns: [
            { header: "Customer", key: "customer", width: 32 },
            { header: "Prime Branch", key: "branch", width: 30 },
            { header: "Invoice", key: "invoice", width: 18 },
            { header: "Due Date", key: "due", width: 14 },
            { header: "Currency", key: "cur", width: 10 },
            { header: "Outstanding (orig.)", key: "outOrig", width: 18 },
            { header: "Outstanding (€)", key: "out", width: 16 },
            { header: "Days Overdue", key: "days", width: 14 },
            { header: "Bucket", key: "bucket", width: 10 },
          ],
          rows: open.map(i => {
            const d = daysOverdue(i.dueDate, now);
            return {
              customer: byId.get(i.customerId)?.name ?? "—",
              branch: i.company ?? "—",
              invoice: i.invoiceNumber,
              due: new Date(i.dueDate).toISOString().slice(0, 10),
              cur: i.currency ?? "EUR",
              outOrig: outstandingOriginal(i).toFixed(2),
              out: outstanding(i).toFixed(2),
              days: d,
              bucket: d <= 30 ? "0-30" : d <= 60 ? "31-60" : d <= 90 ? "61-90" : d <= 120 ? "91-120" : "120+",
            };
          }),
        };
      } else if (input.report === "forecast") {
        const [invoices, installments] = await Promise.all([db.listInvoices(), db.listInstallments()]);
        const forecast = buildForecast(invoices, installments, now, 6);
        spec = {
          title: "Monthly Cash Collection Forecast (6 months)",
          columns: [
            { header: "Month", key: "month", width: 14 },
            { header: "From Invoices (€)", key: "inv", width: 20 },
            { header: "From Contracts (€)", key: "con", width: 20 },
            { header: "Total (€)", key: "total", width: 18 },
          ],
          rows: forecast.map(f => ({
            month: `${f.year}-${String(f.month).padStart(2, "0")}`,
            inv: f.fromInvoices.toFixed(2),
            con: f.fromContracts.toFixed(2),
            total: f.total.toFixed(2),
          })),
        };
      } else if (input.report === "soa-group") {
        if (!input.group) throw new TRPCError({ code: "BAD_REQUEST", message: "group is required for group SOA export" });
        const customers = await db.listCustomers();
        const members = customers.filter(c => ((c.customerGroup ?? "").trim() || c.name) === input.group);
        if (members.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Group not found" });
        const memberIds = new Set(members.map(m => m.id));
        const names = new Map(members.map(m => [m.id, m.name]));
        const allInvoices = await db.listInvoices();
        const open = allInvoices.filter(
          i =>
            memberIds.has(i.customerId) &&
            isOpenInvoice(i) &&
            (input.customerId === undefined || i.customerId === input.customerId) &&
            (input.branch === undefined || i.company === input.branch) &&
            (input.minDaysOverdue === undefined || daysOverdue(i.dueDate, now) >= input.minDaysOverdue),
        );
        const scopeParts = [
          input.customerId !== undefined ? names.get(input.customerId) : null,
          input.branch ?? null,
          input.minDaysOverdue !== undefined ? `${input.minDaysOverdue}+ days overdue` : null,
        ].filter(Boolean);
        spec = {
          title: `Statement of Account — Group ${input.group}${scopeParts.length ? ` (${scopeParts.join(", ")})` : ""}`,
          columns: [
            { header: "Company", key: "company", width: 32 },
            { header: "Invoice", key: "invoice", width: 18 },
            { header: "Prime Branch", key: "branch", width: 30 },
            { header: "Document Date", key: "issue", width: 14 },
            { header: "Due Date", key: "due", width: 14 },
            { header: "Currency", key: "cur", width: 10 },
            { header: "Amount", key: "amount", width: 14 },
            { header: "Paid", key: "paid", width: 14 },
            { header: "Outstanding (orig.)", key: "outOrig", width: 18 },
            { header: "Outstanding (€)", key: "out", width: 16 },
            { header: "Days Overdue", key: "days", width: 14 },
          ],
          rows: [
            ...open
              .sort((a, b) => (names.get(a.customerId) ?? "").localeCompare(names.get(b.customerId) ?? "") || a.dueDate - b.dueDate)
              .map(i => ({
                company: names.get(i.customerId) ?? "—",
                invoice: i.invoiceNumber,
                branch: i.company ?? "—",
                issue: new Date(i.issueDate).toISOString().slice(0, 10),
                due: new Date(i.dueDate).toISOString().slice(0, 10),
                cur: i.currency ?? "EUR",
                amount: Number(i.amount).toFixed(2),
                paid: Number(i.paidAmount).toFixed(2),
                outOrig: outstandingOriginal(i).toFixed(2),
                out: outstanding(i).toFixed(2),
                days: daysOverdue(i.dueDate, now),
              })),
            {
              company: "TOTAL",
              invoice: "",
              branch: "",
              issue: "",
              due: "",
              cur: "",
              amount: "",
              paid: "",
              outOrig: "",
              out: open.reduce((s, i) => s + outstanding(i), 0).toFixed(2),
              days: "",
            },
          ],
        };
      } else {
        if (!input.customerId) throw new TRPCError({ code: "BAD_REQUEST", message: "customerId is required for SOA export" });
        const customer = await db.getCustomer(input.customerId);
        if (!customer) throw new TRPCError({ code: "NOT_FOUND" });
        const invoices = await db.listInvoices({ customerId: input.customerId });
        const open = invoices.filter(isOpenInvoice);
        spec = {
          title: `Statement of Account — ${customer.name}`,
          columns: [
            { header: "Invoice", key: "invoice", width: 18 },
            { header: "Prime Branch", key: "branch", width: 30 },
            { header: "Document Date", key: "issue", width: 14 },
            { header: "Due Date", key: "due", width: 14 },
            { header: "Currency", key: "cur", width: 10 },
            { header: "Amount", key: "amount", width: 14 },
            { header: "Paid", key: "paid", width: 14 },
            { header: "Outstanding (orig.)", key: "outOrig", width: 18 },
            { header: "Outstanding (€)", key: "out", width: 16 },
            { header: "Days Overdue", key: "days", width: 14 },
          ],
          rows: [
            ...open.map(i => ({
              invoice: i.invoiceNumber,
              branch: i.company ?? "—",
              issue: new Date(i.issueDate).toISOString().slice(0, 10),
              due: new Date(i.dueDate).toISOString().slice(0, 10),
              cur: i.currency ?? "EUR",
              amount: Number(i.amount).toFixed(2),
              paid: Number(i.paidAmount).toFixed(2),
              outOrig: outstandingOriginal(i).toFixed(2),
              out: outstanding(i).toFixed(2),
              days: daysOverdue(i.dueDate, now),
            })),
            {
              invoice: "TOTAL",
              branch: "",
              issue: "",
              due: "",
              cur: "",
              amount: "",
              paid: "",
              outOrig: "",
              out: open.reduce((s, i) => s + outstanding(i), 0).toFixed(2),
              days: "",
            },
          ],
        };
      }
      const buffer = input.format === "xlsx" ? await buildExcel(spec) : await buildPdf(spec);
      await audit(ctx, `Export ${input.report} (${input.format})`, "report", input.report);
      return {
        filename: `${input.report}-${new Date().toISOString().slice(0, 10)}.${input.format}`,
        mimeType: input.format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf",
        base64: buffer.toString("base64"),
      };
    }),
});

export const adminRouter = router({
  users: protectedProcedure.query(async ({ ctx }) => {
    const role = await getAppRole(ctx.user.id);
    requireRole(role, ["Administrator", "Management"]);
    return db.listUsersWithProfiles();
  }),
  setRole: protectedProcedure
    .input(z.object({ userId: z.number(), appRole: z.enum(appRoles) }))
    .mutation(async ({ ctx, input }) => {
      const role = await getAppRole(ctx.user.id);
      requireRole(role, ["Administrator"]);
      await db.setAppRole(input.userId, input.appRole);
      await audit(ctx, "Set App Role", "user", input.userId, `Role set to ${input.appRole}`);
      return { success: true };
    }),
  myRole: protectedProcedure.query(async ({ ctx }) => {
    const profile = await db.getOrCreateProfile(ctx.user.id);
    // Project owner is always Administrator
    if (ctx.user.role === "admin" && profile.appRole !== "Administrator") {
      await db.setAppRole(ctx.user.id, "Administrator");
      return { appRole: "Administrator" as const };
    }
    return { appRole: profile.appRole };
  }),
  syncStatus: protectedProcedure.query(async () => {
    const configured = softone.getSoftoneConfig() !== null;
    const logs = await db.listSyncLogs(30);
    return { configured, logs };
  }),
  /** Active FX rates to EUR (defaults + persisted overrides). */
  fxRates: protectedProcedure.query(async () => {
    const stored = await db.getSetting("fx_rates");
    if (stored) {
      try {
        setFxRates(JSON.parse(stored));
      } catch {
        /* keep defaults on parse error */
      }
    }
    return { rates: getFxRates(), defaults: DEFAULT_FX_RATES };
  }),
  /** Persist FX rate overrides (per unit of foreign currency in EUR). */
  setFxRates: protectedProcedure
    .input(
      z.object({
        rates: z.record(z.string().length(3), z.number().positive().max(1000)),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const role = await getAppRole(ctx.user.id);
      requireRole(role, ["Administrator", "Management", "Accounting"]);
      setFxRates(input.rates);
      await db.setSetting("fx_rates", JSON.stringify(getFxRates()), ctx.user.id);
      await audit(ctx, "Update FX Rates", "settings", "fx_rates", JSON.stringify(input.rates));
      return { rates: getFxRates() };
    }),
  syncPullCustomers: protectedProcedure.mutation(async ({ ctx }) => {
    const role = await getAppRole(ctx.user.id);
    requireRole(role, ["Administrator", "Accounting"]);
    try {
      const configured = softone.getSoftoneConfig() !== null;
      const res = configured ? await softone.pullCustomers() : await softone.seedDemoCustomers();
      await audit(ctx, configured ? "Softone Pull Customers" : "Load Demo Customers", "sync", undefined, `${res.synced} records`);
      return res;
    } catch (e: any) {
      await db.addSyncLog({ direction: "Pull", entityType: "customers", recordCount: 0, status: "Failed", message: e.message });
      throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
    }
  }),
  syncPullInvoices: protectedProcedure.mutation(async ({ ctx }) => {
    const role = await getAppRole(ctx.user.id);
    requireRole(role, ["Administrator", "Accounting"]);
    try {
      const configured = softone.getSoftoneConfig() !== null;
      const res = configured ? await softone.pullInvoices() : await softone.seedDemoInvoices();
      await audit(ctx, configured ? "Softone Pull Invoices" : "Load Demo Invoices", "sync", undefined, `${res.synced} records`);
      return res;
    } catch (e: any) {
      await db.addSyncLog({ direction: "Pull", entityType: "invoices", recordCount: 0, status: "Failed", message: e.message });
      throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
    }
  }),

  /**
   * Editable email templates (Settings → Email Templates). Returns the effective
   * text per template (stored override or built-in default) plus the placeholder
   * reference so the editor can document what can be inserted.
   */
  emailTemplates: protectedProcedure.query(async () => {
    const stored = await db.listEmailTemplates();
    return { templates: mergeTemplates(stored), placeholders: TEMPLATE_PLACEHOLDERS };
  }),

  /** Save a customised subject/body for one template type. */
  saveEmailTemplate: protectedProcedure
    .input(
      z.object({
        templateType: z.enum(EDITABLE_TEMPLATES),
        subject: z.string().min(1).max(500),
        body: z.string().min(1).max(20000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const role = await getAppRole(ctx.user.id);
      requireRole(role, ["Administrator", "Management", "Accounting", "Credit Controller"]);
      await db.upsertEmailTemplate({
        templateType: input.templateType,
        subject: input.subject,
        body: input.body,
        updatedBy: ctx.user.id,
      });
      await audit(ctx, "Update Email Template", "settings", input.templateType, input.subject);
      return { success: true };
    }),

  /** Drop the override so the built-in default text applies again. */
  resetEmailTemplate: protectedProcedure
    .input(z.object({ templateType: z.enum(EDITABLE_TEMPLATES) }))
    .mutation(async ({ ctx, input }) => {
      const role = await getAppRole(ctx.user.id);
      requireRole(role, ["Administrator", "Management", "Accounting", "Credit Controller"]);
      await db.deleteEmailTemplate(input.templateType);
      await audit(ctx, "Reset Email Template", "settings", input.templateType, "Restored default text");
      return { success: true, ...DEFAULT_TEMPLATES[input.templateType] };
    }),

  /**
   * Preview a draft template with example values, so the user can see how the
   * placeholders resolve without opening the Send Email dialog.
   */
  previewEmailTemplate: protectedProcedure
    .input(z.object({ subject: z.string().max(500), body: z.string().max(20000) }))
    .query(async ({ ctx, input }) => {
      const vars: Record<string, string> = {};
      for (const p of TEMPLATE_PLACEHOLDERS) vars[p.key] = p.example;
      vars.sender = ctx.user.name ?? "Your name";
      vars.date = new Date().toLocaleDateString("en-GB");
      return { subject: renderTemplate(input.subject, vars), body: renderTemplate(input.body, vars) };
    }),
});

export const callsRouter = router({


  /**
   * Fix a stale task-backed badge: if the group's status is "Pending Follow-up" or
   * "Confirmed" (Promise to Pay) but no open linked task exists any more (it was
   * cancelled/closed through another path), reset the status to Not Contacted so the
   * badge stops pointing at nothing. No-op when an open linked task is found.
   */
  resetStaleConfirmation: protectedProcedure
    .input(z.object({ group: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const conf = await db.getGroupConfirmationStatus(input.group);
      if (!conf || (conf.status !== "Pending Follow-up" && conf.status !== "Confirmed")) {
        return { reset: false };
      }
      const allTasks = await db.listTasks({});
      const open = allTasks.filter(t => t.status === "Pending" || t.status === "In Progress");
      let hasOpenLinked = false;
      if (conf.status === "Pending Follow-up") {
        hasOpenLinked = open.some(t => isTaskOfGroup(t, input.group));
      } else {
        // Confirmed → any open promise-check task for one of the group's customers.
        const customers = await db.listCustomers();
        const memberIds = new Set(
          customers.filter(c => (((c.customerGroup ?? "").trim() || c.name) === input.group)).map(c => c.id)
        );
        hasOpenLinked = open.some(
          t => t.customerId != null && memberIds.has(t.customerId) && /\(Promise #\d+\)/.test(t.description ?? "")
        );
      }
      if (hasOpenLinked) return { reset: false };
      await db.upsertGroupConfirmationStatus(input.group, {
        status: "Not Contacted",
        amount: "0.00",
        followUpDate: null,
        updatedBy: ctx.user.id,
      });
      await db.addActivityLog({
        groupName: input.group,
        activityType: "status_change",
        title: "Stale status reset",
        description: `"${conf.status}" had no open linked task — status reset to Not Contacted.`,
        createdBy: ctx.user.id,
        createdAt: new Date(),
      }).catch(() => {});
      await audit(ctx, "Reset Stale Confirmation", "group", input.group, `${conf.status} → Not Contacted`);
      return { reset: true };
    }),

  /**
   * Prefill data for the Send Email dialog: builds subject/body for a given
   * template using the customer's live figures (open balance, overdue invoices).
   * The SOA template is paired with an SOA file download on the client.
   */
  emailPrefill: protectedProcedure
    .input(z.object({
      customerId: z.number(),
      template: z.enum(EDITABLE_TEMPLATES),
    }))
    .query(async ({ ctx, input }) => {
      const customer = await db.getCustomer(input.customerId);
      if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found" });
      const invoices = await db.listInvoices({ customerId: input.customerId });
      const now = Date.now();
      const open = invoices.filter(isOpenInvoice);
      const overdue = open.filter(i => i.dueDate < now);
      const sum = (list: typeof open) => list.reduce((s, i) => s + toEur(outstanding(i), i.currency ?? "EUR"), 0);
      const fmt = (n: number) => `€${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const openTotal = sum(open);
      const overdueTotal = sum(overdue);
      const oldestDays = overdue.reduce((m, i) => Math.max(m, Math.floor((now - i.dueDate) / 86400000)), 0);
      const today = new Date().toLocaleDateString("en-GB");

      // Short list of the most overdue invoices for the reminder templates.
      const topOverdue = overdue
        .sort((a, b) => a.dueDate - b.dueDate)
        .slice(0, 8)
        .map(i => `  - ${i.invoiceNumber} · due ${new Date(i.dueDate).toLocaleDateString("en-GB")} · ${(i.currency && i.currency !== "EUR") ? `${i.currency} ` : "€"}${outstanding(i).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
        .join("\n");

      // Stored override (Settings → Email Templates) wins over the built-in default.
      const stored = await db.getEmailTemplate(input.template).catch(() => null);
      const tpl = {
        subject: stored?.subject ?? DEFAULT_TEMPLATES[input.template].subject,
        body: stored?.body ?? DEFAULT_TEMPLATES[input.template].body,
      };
      const vars = {
        customer: customer.name,
        contact: customer.contactPerson || "Sir/Madam",
        group: (customer.customerGroup ?? "").trim() || customer.name,
        balance: fmt(openTotal),
        overdue: fmt(overdueTotal),
        openCount: open.length,
        overdueCount: overdue.length,
        oldestDays,
        invoiceList: topOverdue || "  (see attached statement)",
        date: today,
        sender: ctx.user.name ?? "",
      };
      return {
        subject: renderTemplate(tpl.subject, vars),
        body: renderTemplate(tpl.body, vars),
        openTotal,
        overdueTotal,
        openCount: open.length,
        overdueCount: overdue.length,
        isCustom: !!stored,
      };
    }),
  sendGroupEmail: protectedProcedure
    .input(
      z.object({
        customerId: z.number(),
        recipientEmail: z.string().email(),
        recipientName: z.string().optional(),
        templateType: z.enum(["SOA", "Payment Reminder", "Overdue Notice", "Friendly Reminder", "Final Notice", "Statement", "Custom"]),
        subject: z.string().min(1).max(255),
        body: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Verify customer exists
        const customer = await db.getCustomer(input.customerId);
        if (!customer) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found" });
        }

        // Record email in history with "Pending" status
        const emailRecord = await db.addEmailHistory({
          customerId: input.customerId,
          recipientEmail: input.recipientEmail,
          recipientName: input.recipientName,
          templateType: input.templateType,
          subject: input.subject,
          body: input.body,
          status: "Pending",
          createdBy: ctx.user.id,
        });

        // By design the app does not send mail itself: the dialog hands the drafted
        // message to the collector's own Outlook, so replies come back to them and
        // the company signature is preserved. The row above records the draft; the
        // activity-log line below is what the team reads as "we contacted them".

        // Audit the email send action
        await audit(
          ctx,
          "Send Email",
          "email",
          input.customerId,
          `To: ${input.recipientEmail}, Template: ${input.templateType}`
        );

        // Log to activity log
        const groupKey = customer.customerGroup || customer.name;
        await db.addActivityLog({
          groupName: groupKey,
          customerId: input.customerId,
          activityType: "email",
          title: `Email sent: ${input.subject}`,
          description: `To: ${input.recipientEmail} (${input.templateType})`,
          createdBy: ctx.user.id,
          createdAt: new Date(),
        }).catch(() => {});

        return {
          success: true,
          emailId: emailRecord,
          message: "Email queued for sending",
        };
      } catch (error: any) {
        console.error("[Email] Error sending email:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message || "Failed to send email",
        });
      }
    }),

  getEmailHistory: protectedProcedure
    .input(z.object({ customerId: z.number(), limit: z.number().default(50) }))
    .query(async ({ input }) => {
      return db.listEmailHistory(input.customerId, input.limit);
    }),
  logCall: protectedProcedure
    .input(
      z.object({
        group: z.string().min(1).max(255),
        customerId: z.number().optional(),
        contactName: z.string().max(255).optional(),
        /** Saved payment contact picked from the list; resolved to a name for the log line. */
        contactId: z.number().optional(),
        outcome: z.enum(["Reached", "No Answer"]),
        notes: z.string().max(2000).optional(),
        confirmationStatus: z.enum(confirmationStatuses).optional(),
        /**
         * What the customer actually answered, when it differs from the status the
         * call ends on. A refusal followed by a new call-back date used to be
         * invisible: only the resulting status was logged, so the timeline read as
         * if the customer had cooperated. The dialog now sends the original
         * response here and the timeline records both.
         */
        customerResponse: z.enum(confirmationStatuses).optional(),
        confirmationAmount: z.number().optional(),
        followUpDate: z.number().optional(),
        promisedDate: z.number().optional(),
        /**
         * Deprecated. A group carries at most one open promise, so a newly logged
         * Promise to Pay always moves the existing open promise; the collector is no
         * longer asked to choose. Still accepted so older clients keep working.
         */
        reschedulePromiseId: z.number().optional(),
        /**
         * Accepted for backwards compatibility with existing clients. Logging a call
         * no longer touches tasks, so nothing is assigned here.
         */
        assigneeId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      /*
       * Logging a call is a pure record of a conversation (user requirement 2/8):
       * it must neither create/modify/cancel any task, nor be blocked by one.
       * The call therefore writes an activity-log line, and — when the collector
       * picked one — the group's confirmation status and promise record. Tasks stay
       * entirely in the user's hands via the Tasks page / New Task.
       */
      // Promise to Pay must always carry a target date — it stays active until that date passes.
      if (input.confirmationStatus === "Confirmed" && !input.promisedDate) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A promised payment date is required for Promise to Pay." });
      }
      // Pending Follow-up must always carry a follow-up date.
      if (input.confirmationStatus === "Pending Follow-up" && !input.followUpDate) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A follow-up date is required for Pending Follow-up." });
      }
      const parts: string[] = [];
      /*
       * The timeline entry has to stand on its own: months later the collector must
       * be able to read one line and know who was called, at which company, what
       * they answered and for how much. The dialog sends a contactId when a saved
       * contact is picked from the list, so resolve it to a name here — otherwise
       * the person we spoke to disappears from the record.
       */
      let contactLabel = input.contactName?.trim() || null;
      if (!contactLabel && input.contactId) {
        const rows = await db.getPaymentContact(input.contactId).catch(() => []);
        const picked = Array.isArray(rows) ? rows[0] : rows;
        if (picked) contactLabel = [picked.name, (picked as any).title].filter(Boolean).join(", ");
      }
      let companyLabel: string | null = null;
      if (input.customerId) {
        const cust = await db.getCustomer(input.customerId).catch(() => null);
        const name = cust?.name?.trim();
        // Only worth showing when it adds something beyond the group name.
        if (name && name.toUpperCase() !== input.group.trim().toUpperCase()) companyLabel = name;
      }
      if (companyLabel) parts.push(companyLabel);
      if (contactLabel) parts.push(`Contact: ${contactLabel}`);
      if (input.notes) parts.push(input.notes);
      // A no-answer call is a contact attempt: it changes no status and creates no
      // task, so the log line is the only trace. Spell that out, otherwise the
      // entry is indistinguishable from a conversation that simply went nowhere.
      if (input.outcome === "No Answer" && !input.confirmationStatus) {
        parts.push("Contact attempt — no one answered; status unchanged");
      }
      /*
       * One call = one timeline entry. The outcome the collector picked (promise,
       * follow-up, broken...) is folded into this single line instead of being
       * logged again by the promise helpers, which used to make one call appear
       * twice in the communication timeline.
       */
      const outcomeLabel = (() => {
        if (!input.confirmationStatus) return null;
        const label = confirmationStatusLabel(input.confirmationStatus);
        if (input.confirmationStatus === "Confirmed") {
          const amt = input.confirmationAmount && input.confirmationAmount > 0
            ? `€${Number(eur(input.confirmationAmount)).toLocaleString()}`
            : "amount not stated";
          const dateStr = input.promisedDate ? new Date(input.promisedDate).toLocaleDateString("en-GB") : "—";
          return `${label}: ${amt} by ${dateStr}`;
        }
        if (input.confirmationStatus === "Pending Follow-up" && input.followUpDate) {
          const amt =
            input.confirmationAmount && input.confirmationAmount > 0
              ? `€${Number(eur(input.confirmationAmount)).toLocaleString()} · `
              : "";
          return `${label}: ${amt}call back on ${new Date(input.followUpDate).toLocaleDateString("en-GB")}`;
        }
        return label;
      })();
      /*
       * A call can start with a refusal and still end with a new date: the collector
       * picks "Did not confirm" and then chooses Pending Follow-up or Reschedule
       * Promise as the way forward. Both facts belong in the record — the refusal is
       * the collections signal, the new date is only the plan. Without this line the
       * timeline showed just the plan and the refusal was lost.
       */
      const responseLabel =
        input.customerResponse && input.customerResponse !== input.confirmationStatus
          ? confirmationStatusLabel(input.customerResponse)
          : null;
      if (responseLabel) parts.unshift(`Customer response: ${responseLabel}`);
      // The outcome already leads the title, so repeating it in the body would show
      // the same sentence twice in the timeline entry.
      const activityId = await db.addActivityLog({
        groupName: input.group,
        customerId: input.customerId,
        activityType: input.confirmationStatus === "Confirmed" ? "promise" : "call",
        title: outcomeLabel
          ? responseLabel
            ? `Call — ${input.outcome} · ${responseLabel} → ${outcomeLabel}`
            : `Call — ${input.outcome} · ${outcomeLabel}`
          : `Call logged — ${input.outcome}`,
        description: parts.length > 0 ? parts.join(" · ") : undefined,
        createdBy: ctx.user.id,
        createdAt: new Date(),
      });

      /*
       * @mentions in the call note are references to colleagues ("I informed X"),
       * so they are recorded for the mentions inbox only — deliberately no task.
       */
      const mentioned = parseMentions(input.notes);
      if (mentioned.length > 0) {
        await db
          .addNoteMentions(
            mentioned.map(m => ({
              memberId: m.memberId,
              groupName: input.group,
              source: "call" as const,
              activityId,
              excerpt: (input.notes ?? "").slice(0, 500),
              createdBy: ctx.user.id,
            })),
          )
          .catch(() => 0);
      }

      // Update confirmation status if provided
      if (input.confirmationStatus) {
        await db.upsertGroupConfirmationStatus(input.group, {
          status: input.confirmationStatus,
          // Amount always follows the new status: reset to 0 for Not Contacted / Broken,
          // otherwise use the newly entered value (or 0 if none was provided).
          amount:
            input.confirmationStatus === "Not Contacted" || input.confirmationStatus === "Broken"
              ? "0.00"
              : String(input.confirmationAmount ?? 0),
          // Follow-up date applies to "Pending Follow-up" (from followUpDate) and "Confirmed" (from promisedDate)
          followUpDate:
            input.confirmationStatus === "Pending Follow-up"
              ? input.followUpDate
              : input.confirmationStatus === "Confirmed"
                ? input.promisedDate ?? null
                : null,
          notes: input.notes,
          updatedBy: ctx.user.id,
        });

        // A promise to pay is part of the conversation, so it is still recorded —
        // but only as a promise row + activity log, with no check task attached.
        if (input.confirmationStatus === "Confirmed") {
          let rescheduled: number | null = null;
          /*
           * A group has one payment commitment at a time: when the customer names a
           * new date, that is the same promise moving, not an extra one. The collector
           * used to be asked "reschedule or create a new promise?", which added a step
           * without adding information — and answering "new" produced two open promises
           * for the same money, inflating the Desk's promised figures and the
           * kept/broken statistics. The existing open promise is now always moved.
           */
          const existing = input.reschedulePromiseId
            ? input.reschedulePromiseId
            : (await findOpenGroupPromise(input.group).catch(() => null))?.id ?? null;
          if (existing) {
            rescheduled = await reschedulePromiseRecord(ctx, {
              group: input.group,
              promiseId: existing,
              amount: input.confirmationAmount ?? 0,
              promisedDate: input.promisedDate ?? endOfCurrentMonth(),
              notes: input.notes,
              // Already covered by this call's single log line.
              skipActivityLog: true,
            });
          }
          if (!rescheduled) {
            await createPromiseRecord(ctx, {
              group: input.group,
              customerId: input.customerId,
              amount: input.confirmationAmount,
              promisedDate: input.promisedDate ?? endOfCurrentMonth(),
              notes: input.notes,
              contactName: contactLabel ?? undefined,
              skipActivityLog: true,
            });
          }
        }
      }

      await audit(ctx, "Log Call", "call", input.customerId, `${input.group}: ${input.outcome}`);
      return { success: true };
    }),

  getConfirmationStatus: protectedProcedure
    .input(z.object({ group: z.string().min(1).max(255) }))
    .query(async ({ input }) => {
      const row = await db.getGroupConfirmationStatus(input.group);
      if (!row) return null;
      // Only "Not Contacted" (or missing status) is treated as no active status —
      // Promise/Pending/Broken persist until a human changes them.
      if (isConfirmationStale(row.status, row.followUpDate, new Date(), (row as any).updatedAt ?? null)) {
        return { ...row, status: "Not Contacted" as typeof row.status, amount: "0.00", followUpDate: null, notes: null, carriedOver: false };
      }
      // Red-badge flag: linked auto-task still open and past due.
      let taskOverdue = false;
      if (row.status === "Pending Follow-up" || row.status === "Confirmed") {
        const nowTs = Date.now();
        const openAutoTasks = (await db.listTasks({ statuses: ["Pending", "In Progress"] }).catch(() => [])).filter(
          t => taskGroup(t) !== null || taskPromiseId(t) !== null,
        );
        let linked: { id: number; status: string; dueDate: number | null } | null = null;
        if (row.status === "Pending Follow-up") {
          const t = openAutoTasks.find(t => isTaskOfGroup(t, input.group));
          linked = t ? { id: t.id, status: t.status, dueDate: t.dueDate ?? null } : null;
        } else {
          const openPromise = await findOpenGroupPromise(input.group).catch(() => null);
          if (openPromise) {
            const t = openAutoTasks.find(t => taskPromiseId(t) === openPromise.id);
            linked = t ? { id: t.id, status: t.status, dueDate: t.dueDate ?? null } : null;
          }
        }
        taskOverdue = linked
          ? isTaskOverdue(linked, nowTs)
          : ((row.followUpDate ?? null) !== null && (row.followUpDate as number) < nowTs);
      }
      return { ...row, carriedOver: isFromPreviousMonth((row as any).updatedAt ?? null), taskOverdue };
    }),

  /** Most recent open (Pending) promise for a group — used by Log Call to offer rescheduling. */
  getOpenPromise: protectedProcedure
    .input(z.object({ group: z.string().min(1).max(255) }))
    .query(async ({ input }) => {
      return findOpenGroupPromise(input.group);
    }),

  /**
   * Active communication ("case") for a group — the single open promise-check,
   * or follow-up-call task. Used by the Log Call button to first ask
    * whether to open the existing task or just log another call.
   */
  getActiveCommunication: protectedProcedure
    .input(z.object({ group: z.string().min(1).max(255) }))
    .query(async ({ input }) => {
      const row = await db.getGroupConfirmationStatus(input.group);
      const status = row?.status ?? null;
      if (!row || !status) return null;
      if (isConfirmationStale(status, row.followUpDate, new Date(), (row as any).updatedAt ?? null)) return null;
      if (status !== "Pending Follow-up" && status !== "Confirmed") return null;
      const openTasks = await db.listTasks({ statuses: ["Pending", "In Progress"] }).catch(() => []);
      if (status === "Pending Follow-up") {
        const t = openTasks.find(t => isTaskOfGroup(t, input.group));
        if (!t) return null;
        return { status, taskId: t.id, title: t.title, dueDate: t.dueDate ?? null, amount: row.amount ?? null };
      }
      const openPromise = await findOpenGroupPromise(input.group).catch(() => null);
      if (!openPromise) return null;
      const t = openTasks.find(t => taskPromiseId(t) === openPromise.id);
      if (!t) return null;
      return { status, taskId: t.id, title: t.title, dueDate: t.dueDate ?? null, amount: String(openPromise.amount ?? row.amount ?? "") };
    }),

  /** Open follow-up-call task for a group — used by Log Call to show the current
   * follow-up date and how many times it has already been rescheduled. */
  getOpenFollowUpTask: protectedProcedure
    .input(z.object({ group: z.string().min(1).max(255) }))
    .query(async ({ input }) => {
      const openTasks = await db.listTasks({ statuses: ["Pending", "In Progress"] });
      const t = openTasks.find(task => isTaskOfGroup(task, input.group));
      if (!t) return null;
      return { id: t.id, dueDate: t.dueDate, rescheduleCount: t.rescheduleCount ?? 0, title: t.title };
    }),

  updateConfirmationStatus: protectedProcedure
    .input(
      z.object({
        group: z.string().min(1).max(255),
        status: z.enum(confirmationStatuses),
        amount: z.number().optional(),
        followUpDate: z.number().optional(),
        notes: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const previous = await db.getGroupConfirmationStatus(input.group);
      await db.upsertGroupConfirmationStatus(input.group, {
        status: input.status,
        // Amount always follows the new status: reset to 0 for Not Contacted / Broken,
        // otherwise use the newly entered value (or 0 if none was provided).
        amount:
          input.status === "Not Contacted" || input.status === "Broken"
            ? "0.00"
            : String(input.amount ?? 0),
        // Target date applies to "Pending Follow-up" and "Confirmed" (promise date); clear on other statuses
        followUpDate:
          input.status === "Pending Follow-up" || input.status === "Confirmed"
            ? (input.followUpDate ?? null)
            : null,
        notes: input.notes,
        updatedBy: ctx.user.id,
      });
      await cleanupStatusArtifacts(ctx, {
        group: input.group,
        previousStatus: previous?.status ?? null,
        newStatus: input.status,
      });
      if (input.status === "Pending Follow-up" && input.followUpDate) {
        await upsertFollowUpTask(ctx, {
          group: input.group,
          followUpDate: input.followUpDate,
          amount: input.amount,
          notes: input.notes,
        });
      }
      // "Confirmed" (Promise to Pay) with an amount: record a real promise so the
      // check task + activity log are created (used by the Next Action dialog after
      // a broken promise; Log Call has its own promise-creation path).
      if (input.status === "Confirmed" && (input.amount ?? 0) > 0) {
        const existing = await findOpenGroupPromise(input.group).catch(() => null);
        if (!existing) {
          await createGroupPromise(ctx, {
            group: input.group,
            amount: input.amount!,
            promisedDate: input.followUpDate ?? endOfCurrentMonth(),
            notes: input.notes,
          });
        } else if (input.followUpDate) {
          // Re-saving Confirmed with a new date/amount: move the open promise (and
          // its linked check task) instead of leaving them on the stale old date.
          await rescheduleGroupPromise(ctx, {
            group: input.group,
            promiseId: existing.id,
            amount: input.amount!,
            promisedDate: input.followUpDate,
            notes: input.notes,
          });
        }
      }
      await audit(ctx, "Update Confirmation Status", "confirmation", input.group, `Status: ${input.status}`);
      return { success: true };
    }),
});



export const paymentContactsRouter = router({
  list: protectedProcedure
    .input(z.object({ customerId: z.number() }))
    .query(async ({ input }) => {
      return db.listPaymentContacts(input.customerId);
    }),
  /** All payment contacts across every company of a group, with the company name attached. */
  listByGroup: protectedProcedure
    .input(z.object({ group: z.string().min(1).max(255) }))
    .query(async ({ input }) => {
      const customers = await db.listCustomers();
      const members = customers.filter(c => ((c.customerGroup ?? "").trim() || c.name) === input.group);
      if (members.length === 0) return [];
      const byId = new Map(members.map(m => [m.id, m.name]));
      const lists = await Promise.all(members.map(m => db.listPaymentContacts(m.id)));
      return lists
        .flat()
        .map(c => ({ ...c, companyName: byId.get(c.customerId) ?? "—" }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }),
  /** Every payment contact in the system, with company and group names attached (for the Contacts page). */
  listAll: protectedProcedure.query(async () => {
    const [contacts, customers] = await Promise.all([db.listAllPaymentContacts(), db.listCustomers()]);
    const byId = new Map(customers.map(c => [c.id, c]));
    return contacts
      .map(c => {
        const cust = byId.get(c.customerId);
        return {
          ...c,
          companyName: cust?.name ?? "—",
          groupName: cust ? (cust.customerGroup ?? "").trim() || cust.name : "—",
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }),
  add: protectedProcedure
    .input(
      z.object({
        customerId: z.number(),
        name: z.string().min(1).max(255),
        email: z.string().email(),
        phone: z.string().max(20).optional(),
        title: z.string().max(255).optional(),
        contactType: z.enum(contactTypes).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const customer = await db.getCustomer(input.customerId);
      if (!customer) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found" });
      }
      const id = await db.addPaymentContact({
        customerId: input.customerId,
        name: input.name,
        email: input.email,
        phone: input.phone,
        title: input.title,
        contactType: input.contactType ?? "Person",
      });
      await audit(ctx, "Add Payment Contact", "paymentContact", id, `${input.name} - ${input.email}`);
      return { id, ...input };
    }),
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        customerId: z.number(),
        name: z.string().min(1).max(255).optional(),
        email: z.string().email().optional(),
        phone: z.string().max(20).optional(),
        title: z.string().max(255).optional(),
        contactType: z.enum(contactTypes).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const contact = await db.getPaymentContact(input.id);
      if (!contact || contact[0]?.customerId !== input.customerId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Payment contact not found" });
      }
      const updates = {
        ...(input.name && { name: input.name }),
        ...(input.email && { email: input.email }),
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.title !== undefined && { title: input.title }),
        ...(input.contactType && { contactType: input.contactType }),
      };
      await db.updatePaymentContact(input.id, updates);
      await audit(ctx, "Update Payment Contact", "paymentContact", input.id, JSON.stringify(updates));
      return { id: input.id, ...updates };
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number(), customerId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const contact = await db.getPaymentContact(input.id);
      if (!contact || contact[0]?.customerId !== input.customerId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Payment contact not found" });
      }
      await db.deletePaymentContact(input.id);
      await audit(ctx, "Delete Payment Contact", "paymentContact", input.id);
      return { success: true };
    }),
});
