import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  appRoles,
  confirmationStatuses,
  customerTiers,
  invoiceStatuses,
  onHoldStatuses,
  receiptMethods,
  taskStatuses,
  taskTypes,
} from "../../drizzle/schema";
import * as db from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { resolveGroupStatus } from "../lib/statusWorkflow";
import {
  buildForecast,
  canTransitionOnHold,
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
} from "../lib/arLogic";
import { buildExcel, buildPdf, TableSpec } from "../lib/exports";
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

/** Timestamp of the last millisecond of the current month (UTC). Invoices due on or before this are "overdue by end of month". */
function endOfCurrentMonth(now = new Date()): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) - 1;
}

/**
 * Confirmation statuses are a *monthly* workflow: a "Promise to Pay" or "Broken"
 * recorded in July says nothing about August. A status row is considered stale
 * once the calendar month of its last update differs from the current month —
 * stale rows are treated as "Not Contacted" (amount 0) everywhere they are read,
 * so every group starts the new month with a clean slate without losing history.
 */
function isConfirmationStale(updatedAt: Date | string | null | undefined, now = new Date()): boolean {
  if (!updatedAt) return true;
  const d = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
  if (Number.isNaN(d.getTime())) return true;
  return d.getUTCFullYear() !== now.getUTCFullYear() || d.getUTCMonth() !== now.getUTCMonth();
}

/** Effective (month-aware) view of a confirmation row: stale → Not Contacted / €0. */
function effectiveConfirmation<T extends { status: string; amount: string | null; updatedAt: Date | string | null } | null | undefined>(
  row: T,
): { status: string; amount: number; stale: boolean } {
  if (!row) return { status: "Not Contacted", amount: 0, stale: false };
  if (isConfirmationStale(row.updatedAt)) return { status: "Not Contacted", amount: 0, stale: true };
  return { status: row.status, amount: row.amount ? Number(row.amount) : 0, stale: false };
}

/**
 * Create a Promise-to-Pay record for a group (used when a Confirmed status is logged).
 * Resolves the target customer (given id or the group's primary member), creates the promise,
 * logs the activity, and creates a follow-up task on the promised date — same behavior as addPromise.
 */
async function createGroupPromise(
  ctx: { user: { id: number; name: string | null } },
  input: { group: string; customerId?: number; amount: number; promisedDate: number; notes?: string }
) {
  let cust = input.customerId ? await db.getCustomer(input.customerId) : null;
  if (!cust) {
    const customers = await db.listCustomers();
    const members = customers.filter(c => ((c.customerGroup ?? "").trim() || c.name) === input.group);
    if (members.length === 0) return null;
    cust = members[0];
  }
  const id = await db.createPromise({
    customerId: cust.id,
    promisedDate: input.promisedDate,
    amount: eur(input.amount),
    notes: input.notes,
    createdBy: ctx.user.id,
  });
  await audit(ctx, "Record Promise-to-Pay", "promiseToPay", id, `Customer #${cust.id} promised €${eur(input.amount)} by ${new Date(input.promisedDate).toISOString().slice(0, 10)} (from confirmed call)`);
  const groupKey = cust.customerGroup?.trim() ? cust.customerGroup.trim() : cust.name;
  const dateStr = new Date(input.promisedDate).toLocaleDateString("en-GB");
  await db.addActivityLog({
    groupName: groupKey,
    customerId: cust.id,
    activityType: "promise",
    title: `Promise-to-Pay: €${Number(eur(input.amount)).toLocaleString()} by ${dateStr}`,
    description: `${cust.name} — confirmed by phone${input.notes ? ` — ${input.notes}` : ""}`,
    createdBy: ctx.user.id,
    createdAt: new Date(),
  }).catch(() => {});
  const taskId = await db.createTask({
    customerId: cust.id,
    type: "Manual",
    title: `Promise to Pay — €${Number(eur(input.amount)).toLocaleString()}`,
    description: `Verify that ${cust.name} paid the promised amount of €${Number(eur(input.amount)).toLocaleString()} due ${dateStr}.${input.notes ? ` Notes: ${input.notes}` : ""} (Promise #${id})`,
    dueDate: input.promisedDate,
    status: "Pending",
    assignedTo: ctx.user.id,
  });
  await audit(ctx, "Create Task", "task", taskId, `Auto follow-up for promise #${id} (${cust.name})`);
  return id;
}

/**
 * Find the most recent open (Pending) promise for any customer that belongs to a group.
 * Returns the promise row (with customer name) or null.
 */
async function findOpenGroupPromise(group: string) {
  const customers = await db.listCustomers();
  const members = customers.filter(c => ((c.customerGroup ?? "").trim() || c.name) === group);
  if (members.length === 0) return null;
  const memberIds = new Set(members.map(m => m.id));
  const byId = new Map(members.map(m => [m.id, m]));
  const all = await db.listPromises();
  const open = all
    .filter(p => p.status === "Pending" && memberIds.has(p.customerId))
    .sort((a, b) => b.id - a.id);
  if (open.length === 0) return null;
  const p = open[0];
  return { ...p, customerName: byId.get(p.customerId)?.name ?? "—" };
}

/**
 * Reschedule an existing open promise to a new date/amount (customer moved the payment).
 * Updates the promise row, moves the linked follow-up task's due date, and logs the change.
 */
async function rescheduleGroupPromise(
  ctx: { user: { id: number; name: string | null } },
  input: { group: string; promiseId: number; amount: number; promisedDate: number; notes?: string }
) {
  const promise = await db.getPromise(input.promiseId);
  if (!promise || promise.status !== "Pending") return null;
  const cust = await db.getCustomer(promise.customerId);
  const oldDateStr = new Date(promise.promisedDate).toLocaleDateString("en-GB");
  const newDateStr = new Date(input.promisedDate).toLocaleDateString("en-GB");
  await db.updatePromise(input.promiseId, {
    promisedDate: input.promisedDate,
    amount: eur(input.amount),
    notes: input.notes ?? promise.notes,
  });
  await audit(ctx, "Reschedule Promise-to-Pay", "promiseToPay", input.promiseId, `${input.group}: €${eur(input.amount)} moved ${oldDateStr} → ${newDateStr}`);
  await db.addActivityLog({
    groupName: input.group,
    customerId: promise.customerId,
    activityType: "promise",
    title: `Payment rescheduled: €${Number(eur(input.amount)).toLocaleString()} — ${oldDateStr} → ${newDateStr}`,
    description: `${cust?.name ?? "—"} moved the promised payment${input.notes ? ` — ${input.notes}` : ""}`,
    createdBy: ctx.user.id,
    createdAt: new Date(),
  }).catch(() => {});
  // Move the linked follow-up task (identified by "(Promise #id)" marker) to the new date.
  const marker = `(Promise #${input.promiseId})`;
  const openTasks = await db.listTasks({ statuses: ["Pending", "In Progress"] });
  const linked = openTasks.find(t => t.description?.includes(marker));
  if (linked) {
    await db.updateTask(linked.id, {
      title: `Promise to Pay — €${Number(eur(input.amount)).toLocaleString()}`,
      description: `Verify that ${cust?.name ?? "the customer"} paid the promised amount of €${Number(eur(input.amount)).toLocaleString()} due ${newDateStr}.${input.notes ? ` Notes: ${input.notes}` : ""} ${marker}`,
      dueDate: input.promisedDate,
    });
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
  input: { group: string; customerId?: number; followUpDate: number; amount?: number; notes?: string }
) {
  let cust = input.customerId ? await db.getCustomer(input.customerId) : null;
  if (!cust) {
    const customers = await db.listCustomers();
    const members = customers.filter(c => ((c.customerGroup ?? "").trim() || c.name) === input.group);
    if (members.length === 0) return null;
    cust = members[0];
  }
  const marker = `(Follow-up: ${input.group})`;
  const dateStr = new Date(input.followUpDate).toLocaleDateString("en-GB");
  const amountStr = input.amount && input.amount > 0 ? ` — expected €${Number(eur(input.amount)).toLocaleString()}` : "";
  const title = `Follow-up call — ${input.group}${amountStr}`;
  const description = `Call ${input.group} on ${dateStr} to confirm the expected payment${amountStr}.${input.notes ? ` Notes: ${input.notes}` : ""} ${marker}`;

  // Reuse an existing open follow-up task for this group (avoid duplicates)
  const openTasks = await db.listTasks({ statuses: ["Pending", "In Progress"] });
  const existing = openTasks.find(t => t.description?.includes(marker));
  if (existing) {
    await db.updateTask(existing.id, { title, description, dueDate: input.followUpDate });
    await audit(ctx, "Update Task", "task", existing.id, `Follow-up rescheduled to ${dateStr} (${input.group})`);
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
  });
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
    const marker = `(Follow-up: ${input.group})`;
    const linked = openTasks.filter(t => t.description?.includes(marker));
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
      const marker = `(Promise #${open.id})`;
      const linked = openTasks.filter(t => t.description?.includes(marker));
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
      // Distinct groups matched via customer name/group
      const groups = new Map<string, number>();
      for (const c of res.customers) {
        const key = (c.customerGroup ?? "").trim() || c.name;
        groups.set(key, (groups.get(key) ?? 0) + 1);
      }
      const lower = q.toLowerCase();
      return {
        groups: Array.from(groups.entries())
          .sort((a, b) => Number(b[0].toLowerCase().includes(lower)) - Number(a[0].toLowerCase().includes(lower)))
          .slice(0, 8)
          .map(([name, members]) => ({ name, members })),
        companies: res.customers.slice(0, 8).map(c => ({
          id: c.id,
          name: c.name,
          code: c.code,
          group: (c.customerGroup ?? "").trim() || c.name,
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
        onHoldStatus: c.onHoldStatus,
        turnoverYtd: c.turnoverYtd != null ? Number(c.turnoverYtd) : null,
        turnoverLastYear: c.turnoverLastYear != null ? Number(c.turnoverLastYear) : null,
      });
      return {
        ...c,
        openBalance,
        overdueBalance,
        overdueEomBalance: overdueEom.reduce((s, i) => s + outstanding(i), 0),
        overdueCount: overdue.length,
        rating: ratingResult.rating,
        ratingScore: ratingResult.score,
        ratingFactors: ratingResult.factors,
      };
    });
  }),
  /** Group-level view: aggregated totals per customer group. */
  groups: protectedProcedure.query(async () => {
    const now = Date.now();
    const today = new Date();
    const monthStart = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1);
    const monthEnd = Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1);
    const [customers, invoices, forecastRows, behavior, allPromises, watchRows, receipts, confirmationStatuses] = await Promise.all([
      db.listCustomers(),
      db.listInvoices(),
      db.listForecastEntries(today.getUTCFullYear(), today.getUTCMonth() + 1),
      db.listPaymentBehaviorWithGroup().catch(() => []),
      db.listPromises(),
      db.listGroupWatchStatuses().catch(() => []),
      db.listReceiptsInRange(monthStart, monthEnd),
      db.listGroupConfirmationStatuses().catch(() => []),
    ]);
    const eom = endOfCurrentMonth();
    const collectedByCustomer = new Map<number, number>();
    for (const r of receipts) {
      if (r.receiptDate >= monthStart && r.receiptDate < monthEnd) {
        collectedByCustomer.set(r.customerId, (collectedByCustomer.get(r.customerId) ?? 0) + Number(r.amount));
      }
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
    for (const p of allPromises) {
      const e = promisesByCustomer.get(p.customerId) ?? { kept: 0, broken: 0 };
      if (p.status === "Kept") e.kept++;
      else if (p.status === "Broken") e.broken++;
      else if (p.status === "Pending") {
        const cur = openPromiseDateByCustomer.get(p.customerId);
        if (cur === undefined || p.promisedDate < cur) openPromiseDateByCustomer.set(p.customerId, p.promisedDate);
      }
      promisesByCustomer.set(p.customerId, e);
    }
    const HOLD_SEVERITY: Record<string, number> = { Active: 0, Resolved: 0, Rejected: 0, "Under Review": 1, "Eligible for On Hold": 2, "On Hold": 3, Legal: 4 };
    const day90 = 90 * 24 * 60 * 60 * 1000;
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
        worstHold: string;
        turnoverYtd: number;
        turnoverLastYear: number;
        collected: number;
        openPromiseDate: number | null;
      }
    >();
    const groupInvoices = new Map<string, typeof invoices>();
    for (const c of customers) {
      const key = (c.customerGroup ?? "").trim() || c.name;
      let g = groups.get(key);
      if (!g) {
        g = { group: key, companyCount: 0, openBalance: 0, overdueBalance: 0, overdueEomBalance: 0, overdueCount: 0, openByCurrency: {}, branches: new Set(), overdue90Plus: 0, promisesKept: 0, promisesBroken: 0, worstHold: "Active", turnoverYtd: 0, turnoverLastYear: 0, collected: 0, openPromiseDate: null };
        groups.set(key, g);
      }
      let gInv = groupInvoices.get(key);
      if (!gInv) {
        gInv = [];
        groupInvoices.set(key, gInv);
      }
      g.companyCount += 1;
      g.turnoverYtd += c.turnoverYtd ? Number(c.turnoverYtd) : 0;
      g.turnoverLastYear += c.turnoverLastYear ? Number(c.turnoverLastYear) : 0;
      g.collected += collectedByCustomer.get(c.id) ?? 0;
      const prom = promisesByCustomer.get(c.id);
      if (prom) {
        g.promisesKept += prom.kept;
        g.promisesBroken += prom.broken;
      }
      const opd = openPromiseDateByCustomer.get(c.id);
      if (opd !== undefined && (g.openPromiseDate === null || opd < g.openPromiseDate)) g.openPromiseDate = opd;
      if ((HOLD_SEVERITY[c.onHoldStatus] ?? 0) > (HOLD_SEVERITY[g.worstHold] ?? 0)) g.worstHold = c.onHoldStatus;
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
      .map(g => {
        const beh = groupBehavior.get(g.group);
        const ratingResult = computeCreditRating({
          daysLate: beh?.medianDaysLate ?? beh?.avgDaysLate ?? null,
          openBalance: g.openBalance,
          overdueBalance: g.overdueBalance,
          overdue90Plus: g.overdue90Plus,
          promisesKept: g.promisesKept,
          promisesBroken: g.promisesBroken,
          onHoldStatus: g.worstHold,
          turnoverYtd: g.turnoverYtd,
          turnoverLastYear: g.turnoverLastYear,
        });
        const forecastExpected = forecastByGroup.get(g.group) ?? 0;
        // Business rule: problematic when the month's forecast covers < 80% of what will be overdue by EOM.
        const hasForecast = forecastByGroup.has(g.group);
        const forecastForRule = hasForecast ? forecastExpected : 0;
        const autoProblematic = g.overdueEomBalance > 0 && forecastForRule < 0.8 * g.overdueEomBalance;
        // Unified workflow: Normal → Problematic → Critical (auto after 30 days) → Legal / Resolved.
        const row = watchByGroup.get(g.group) ?? null;
        const resolved = resolveGroupStatus(row, autoProblematic);
        const watchStatus = resolved.status;
        const watchOverride = row && row.status !== "Auto" ? (row.status === "On Watch" ? "Problematic" : row.status) : null;
        const problematic = watchStatus === "Problematic" || watchStatus === "Critical";
        const { overdue90Plus, promisesKept, promisesBroken, worstHold, turnoverYtd, turnoverLastYear, collected, openPromiseDate, ...rest } = g;
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
          // Earliest open promise date — shown under the "Promise to Pay" badge.
          confirmationPromiseDate: confStatus === "Confirmed" ? openPromiseDate : null,
        };
      })
      .sort((a, b) => b.openBalance - a.openBalance);
  }),
  /**
   * Prioritized collection call list: which groups to phone first.
   * Score = overdue amount (61-90d weighted extra, 120+ reduced) × rating multiplier
   * + broken-promise boost + low-forecast-coverage boost + stale-payment boost.
   */
  callList: protectedProcedure.query(async () => {
    const now = Date.now();
    const today = new Date();
    const [customers, invoices, forecastRows, behavior, allPromises, receipts, openTasks, watchRowsCl] = await Promise.all([
      db.listCustomers(),
      db.listInvoices(),
      db.listForecastEntries(today.getUTCFullYear(), today.getUTCMonth() + 1),
      db.listPaymentBehaviorWithGroup().catch(() => []),
      db.listPromises(),
      db.listReceipts(),
      db.listTasks({ statuses: ["Pending", "In Progress"] }),
      db.listGroupWatchStatuses().catch(() => []),
    ]);
    const eom = endOfCurrentMonth();
    const day61 = 61 * 24 * 60 * 60 * 1000;
    const day90 = 90 * 24 * 60 * 60 * 1000;
    const watchByGroupCl = new Map<string, { status: string; problematicSince: number | null }>();
    for (const w of watchRowsCl) {
      watchByGroupCl.set(w.groupName, { status: w.status, problematicSince: w.problematicSince ?? null });
    }
    const forecastByGroup = new Map<string, number>();
    const forecastGroups = new Set<string>();
    for (const f of forecastRows) {
      const key = (f.customerGroup ?? "").trim();
      if (!key) continue;
      forecastGroups.add(key);
      forecastByGroup.set(key, (forecastByGroup.get(key) ?? 0) + Number(f.expectedAmount));
    }
    const groupBehavior = aggregateGroupBehavior(behavior as BehaviorRow[]);
    const custById = new Map(customers.map(c => [c.id, c]));
    const groupKeyOf = (c: { customerGroup: string | null; name: string }) => (c.customerGroup ?? "").trim() || c.name;

    type Agg = {
      group: string;
      openBalance: number;
      overdueBalance: number;
      overdueEom: number;
      overdue6190: number;
      overdue90Plus: number;
      overdueCount: number;
      promisesKept: number;
      promisesBroken: number;
      promisesOverduePending: number;
      pendingPromiseAmount: number;
      lastPaymentTs: number | null;
      followUpTs: number | null;
      turnoverYtd: number;
      turnoverLastYear: number;
      worstHold: string;
      contacts: { name: string; phone: string | null; email: string | null; contactPerson: string | null }[];
      memberIds: number[];
    };
    const HOLD_SEVERITY: Record<string, number> = { Active: 0, Resolved: 0, Rejected: 0, "Under Review": 1, "Eligible for On Hold": 2, "On Hold": 3, Legal: 4 };
    const aggs = new Map<string, Agg>();
    for (const c of customers) {
      const key = groupKeyOf(c);
      let g = aggs.get(key);
      if (!g) {
        g = { group: key, openBalance: 0, overdueBalance: 0, overdueEom: 0, overdue6190: 0, overdue90Plus: 0, overdueCount: 0, promisesKept: 0, promisesBroken: 0, promisesOverduePending: 0, pendingPromiseAmount: 0, lastPaymentTs: null, followUpTs: null, turnoverYtd: 0, turnoverLastYear: 0, worstHold: "Active", contacts: [], memberIds: [] };
        aggs.set(key, g);
      }
      g.memberIds.push(c.id);
      g.turnoverYtd += c.turnoverYtd ? Number(c.turnoverYtd) : 0;
      g.turnoverLastYear += c.turnoverLastYear ? Number(c.turnoverLastYear) : 0;
      if ((HOLD_SEVERITY[c.onHoldStatus] ?? 0) > (HOLD_SEVERITY[g.worstHold] ?? 0)) g.worstHold = c.onHoldStatus;
      if (c.phone || c.email || c.contactPerson) {
        g.contacts.push({ name: c.name, phone: c.phone, email: c.email, contactPerson: c.contactPerson });
      }
    }
    for (const inv of invoices) {
      const cust = custById.get(inv.customerId);
      if (!cust || !isOpenInvoice(inv)) continue;
      const g = aggs.get(groupKeyOf(cust))!;
      const out = outstanding(inv);
      g.openBalance += out;
      if (inv.dueDate <= eom) g.overdueEom += out;
      if (now > inv.dueDate) {
        g.overdueBalance += out;
        g.overdueCount += 1;
        const age = now - inv.dueDate;
        if (age > day61 && age <= day90) g.overdue6190 += out;
        if (age > day90) g.overdue90Plus += out;
      }
    }
    for (const p of allPromises) {
      const cust = custById.get(p.customerId);
      if (!cust) continue;
      const g = aggs.get(groupKeyOf(cust))!;
      if (p.status === "Kept") g.promisesKept += 1;
      else if (p.status === "Broken") g.promisesBroken += 1;
      else if (p.status === "Pending") {
        if (p.promisedDate < now) g.promisesOverduePending += 1;
        g.pendingPromiseAmount += Number(p.amount);
        if (g.followUpTs === null || p.promisedDate < g.followUpTs) g.followUpTs = p.promisedDate;
      }
    }
    for (const t of openTasks) {
      if (!t.customerId) continue;
      const cust = custById.get(t.customerId);
      if (!cust) continue;
      const g = aggs.get(groupKeyOf(cust));
      if (!g) continue;
      const due = t.dueDate ?? now;
      if (g.followUpTs === null || due < g.followUpTs) g.followUpTs = due;
    }
    for (const r of receipts) {
      const cust = custById.get(r.customerId);
      if (!cust) continue;
      const g = aggs.get(groupKeyOf(cust))!;
      if (g.lastPaymentTs === null || r.receiptDate > g.lastPaymentTs) g.lastPaymentTs = r.receiptDate;
    }

    const rows = Array.from(aggs.values())
      .filter(g => g.overdueBalance > 0.005)
      .map(g => {
        const beh = groupBehavior.get(g.group);
        const rating = computeCreditRating({
          daysLate: beh?.medianDaysLate ?? beh?.avgDaysLate ?? null,
          openBalance: g.openBalance,
          overdueBalance: g.overdueBalance,
          overdue90Plus: g.overdue90Plus,
          promisesKept: g.promisesKept,
          promisesBroken: g.promisesBroken,
          onHoldStatus: g.worstHold,
          turnoverYtd: g.turnoverYtd,
          turnoverLastYear: g.turnoverLastYear,
        });
        const expected = forecastByGroup.get(g.group) ?? 0;
        const coverage = forecastGroups.has(g.group) && g.overdueEom > 0 ? expected / g.overdueEom : null;
        const daysSinceLastPayment = g.lastPaymentTs !== null ? Math.floor((now - g.lastPaymentTs) / (24 * 60 * 60 * 1000)) : null;
        // Unified status: manual/auto Problematic → Critical after 30 days; drives the tier.
        const expectedForRule = forecastGroups.has(g.group) ? expected : 0;
        const autoProblematic = g.overdueEom > 0 && expectedForRule < 0.8 * g.overdueEom;
        const resolvedStatus = resolveGroupStatus(watchByGroupCl.get(g.group) ?? null, autoProblematic, now);
        const priority = computeCallPriority({
          overdueBalance: g.overdueBalance,
          overdue6190: g.overdue6190,
          overdue90Plus: g.overdue90Plus,
          rating: rating.rating,
          promisesBroken: g.promisesBroken,
          promisesOverduePending: g.promisesOverduePending,
          forecastCoverage: coverage,
          daysSinceLastPayment,
          groupStatus: resolvedStatus.status,
        });
        return {
          group: g.group,
          score: priority.score,
          reasons: priority.reasons,
          tier: priority.tier,
          watchStatus: resolvedStatus.status,
         rating: rating.rating,
         ratingScore: rating.score,
         overdueBalance: g.overdueBalance,
          overdueEomBalance: g.overdueEom,
         overdue6190: g.overdue6190,
         overdue90Plus: g.overdue90Plus,
         overdueCount: g.overdueCount,
         openBalance: g.openBalance,
         forecastExpected: expected,
          forecastCoverage: coverage,
          promisesBroken: g.promisesBroken,
          promisesOverduePending: g.promisesOverduePending,
          pendingPromiseAmount: g.pendingPromiseAmount,
          daysSinceLastPayment,
          contacts: g.contacts.slice(0, 3),
          memberIds: g.memberIds,
          contacted: g.followUpTs !== null,
          followUpDate: g.followUpTs,
        };
      })
      // Status-first: Critical/Legal, then Problematic, then Normal; score orders within each tier.
      .sort((a, b) => (b.tier - a.tier) || (b.score - a.score));
    return rows;
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
      const memberPromises = (await db.listPromises()).filter(p => memberIds.has(p.customerId));
      const HOLD_SEVERITY: Record<string, number> = { Active: 0, Resolved: 0, Rejected: 0, "Under Review": 1, "Eligible for On Hold": 2, "On Hold": 3, Legal: 4 };
      const worstHold = members.reduce((w, m) => ((HOLD_SEVERITY[m.onHoldStatus] ?? 0) > (HOLD_SEVERITY[w] ?? 0) ? m.onHoldStatus : w), "Active");
      const ratingResult = computeCreditRating({
        daysLate: groupBehavior?.medianDaysLate ?? groupBehavior?.avgDaysLate ?? null,
        openBalance: gOpen.reduce((s, i) => s + outstanding(i), 0),
        overdueBalance: gOverdue.reduce((s, i) => s + outstanding(i), 0),
        overdue90Plus: gOverdue.filter(i => now - i.dueDate > day90).reduce((s, i) => s + outstanding(i), 0),
        promisesKept: memberPromises.filter(p => p.status === "Kept").length,
        promisesBroken: memberPromises.filter(p => p.status === "Broken").length,
        onHoldStatus: worstHold,
        turnoverYtd: members.reduce((s, m) => s + (m.turnoverYtd ? Number(m.turnoverYtd) : 0), 0),
        turnoverLastYear: members.reduce((s, m) => s + (m.turnoverLastYear ? Number(m.turnoverLastYear) : 0), 0),
      });
      const todayD = new Date();
      const forecastRows = await db.listForecastEntries(todayD.getUTCFullYear(), todayD.getUTCMonth() + 1);
      const groupForecast = forecastRows.filter(f => (f.customerGroup ?? "").trim() === input.group).reduce((s, f) => s + Number(f.expectedAmount), 0);
      const hasForecast = forecastRows.some(f => (f.customerGroup ?? "").trim() === input.group);
      const forecastForRule = hasForecast ? groupForecast : 0;
      const problematic = gOverdueEom > 0 && forecastForRule < 0.8 * gOverdueEom;
      const watchRow = await db.getGroupWatchStatus(input.group).catch(() => null);
      const resolvedDetail = resolveGroupStatus(watchRow, problematic);
      const watchStatus = resolvedDetail.status;
      const watchOverride = watchRow && watchRow.status !== "Auto" ? (watchRow.status === "On Watch" ? "Problematic" : watchRow.status) : null;
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
            onHoldStatus: m.onHoldStatus,
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
      const DETAIL_HOLD_SEVERITY: Record<string, number> = { Active: 0, Resolved: 0, Rejected: 0, "Under Review": 1, "Eligible for On Hold": 2, "On Hold": 3, Legal: 4 };
      const groupHoldStatus = members.reduce(
        (worst, m) => ((DETAIL_HOLD_SEVERITY[m.onHoldStatus] ?? 0) > (DETAIL_HOLD_SEVERITY[worst] ?? 0) ? m.onHoldStatus : worst),
        "Active" as string,
      );
      const activityLogs = await db.listActivityLog(input.group, 200).catch(() => []);
      // Month-aware: a confirmation from a previous month is stale → Not Contacted.
      const gConf = effectiveConfirmation(confirmation);
      const gConfStatus = gConf.status;
      const gConfAmount = gConf.amount;
      const gExpectedToCollect =
        gConfStatus === "Not Contacted" ? groupForecast : gConfStatus === "Broken" ? 0 : gConfAmount;
      const groupForecastInitial = forecastRows
        .filter(f => (f.customerGroup ?? "").trim() === input.group)
        .reduce((s, f) => s + Number((f as any).initialForecast ?? 0), 0);
      return {
        group: input.group,
        companies,
        branches,
        aging,
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
        confirmationFollowUpDate: confirmation?.followUpDate ?? null,
        confirmationNotes: confirmation?.notes ?? null,
        totals: {
          openBalance: open.reduce((s, i) => s + outstanding(i), 0),
          overdueBalance: overdue.reduce((s, i) => s + outstanding(i), 0),
          overdueCount: overdue.length,
          openCount: open.length,
          openByCurrency,
          turnoverYtd: members.reduce((s, m) => s + (m.turnoverYtd ? Number(m.turnoverYtd) : 0), 0),
          turnoverLastYear: members.reduce((s, m) => s + (m.turnoverLastYear ? Number(m.turnoverLastYear) : 0), 0),
        },
        invoices: sortedInvoices.map(i => ({ ...i, customerName: customerNames.get(i.customerId) ?? "" })),
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
  /** Current-month Smart Forecast entry for a group, with live collected across member companies (EUR). */
  groupForecast: protectedProcedure.input(z.object({ group: z.string().min(1) })).query(async ({ input }) => {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const entries = await db.listForecastEntries(year, month);
    const entry = entries.find(e => (e.customerGroup ?? "").trim() === input.group);
    if (!entry) return null;
    const customers = await db.listCustomers();
    const memberIds = new Set(
      customers.filter(c => ((c.customerGroup ?? "").trim() || c.name) === input.group).map(c => c.id),
    );
    const receipts = await db.listReceipts();
    const start = Date.UTC(year, month - 1, 1);
    const end = Date.UTC(year, month, 1);
    const collected = receipts
      .filter(r => memberIds.has(r.customerId) && r.receiptDate >= start && r.receiptDate < end)
      .reduce((s, r) => s + Number(r.amount), 0);
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
      await db.addActivityLog({
        groupName: input.group,
        activityType: "note",
        title: "Note added",
        description: input.content.substring(0, 200),
        createdBy: ctx.user.id,
        createdAt: new Date(),
      }).catch(() => {});
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
    .input(z.object({ group: z.string().min(1), status: z.enum(["Auto", "Normal", "Problematic", "Critical", "Legal", "Resolved"]) }))
    .mutation(async ({ ctx, input }) => {
      await db.setGroupWatchStatus(input.group, input.status, ctx.user.id);
      await audit(ctx, "Set Watch Status", "group", input.group, `Status → ${input.status}`);
      await db.createGroupNote({
        groupName: input.group,
        content: `Status changed to "${input.status === "Auto" ? "Auto (forecast rule)" : input.status}" by ${ctx.user.name ?? "user"}.`,
        createdBy: ctx.user.id,
        createdAt: Date.now(),
      });
      return { success: true };
    }),
  /** AI-generated snapshot of the group: balances, behavior, promises, tasks, notes. */
  groupAiSummary: protectedProcedure.input(z.object({ group: z.string().min(1) })).mutation(async ({ ctx, input }) => {
    const customers = await db.listCustomers();
    const members = customers.filter(c => ((c.customerGroup ?? "").trim() || c.name) === input.group);
    if (members.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Group not found" });
    const memberIds = new Set(members.map(m => m.id));
    const names = new Map(members.map(m => [m.id, m.name]));
    const now = Date.now();
    const [allInvoices, allBehavior, allPromises, allTasks, notes] = await Promise.all([
      db.listInvoices(),
      db.listPaymentBehaviorWithGroup().catch(() => []),
      db.listPromises(),
      db.listTasks({}),
      db.listGroupNotes(input.group),
    ]);
    const invs = allInvoices.filter(i => memberIds.has(i.customerId));
    const open = invs.filter(isOpenInvoice);
    const overdue = open.filter(i => now > i.dueDate);
    const aging = computeAging(invs, now);
    const behavior = allBehavior.filter(b => memberIds.has(b.customerId));
    const promises = allPromises.filter(p => memberIds.has(p.customerId));
    const pendingTasks = allTasks.filter(t => memberIds.has(t.customerId) && (t.status === "Pending" || t.status === "In Progress"));
    const onHold = members.filter(m => m.onHoldStatus !== "Active");
    // Current-month forecast & collection status
    const todayD = new Date();
    const curYear = todayD.getUTCFullYear();
    const curMonth = todayD.getUTCMonth() + 1;
    const { start: mStart, end: mEnd } = monthRange(curYear, curMonth);
    const [forecastRows, monthReceipts] = await Promise.all([
      db.listForecastEntries(curYear, curMonth),
      db.listReceiptsInRange(mStart, mEnd).catch(() => []),
    ]);
    const groupForecastRows = forecastRows.filter(f => (f.customerGroup ?? "").trim() === input.group);
    const forecastExpected = groupForecastRows.reduce((s, f) => s + Number(f.expectedAmount), 0);
    const collectedThisMonth = monthReceipts
      .filter(r => memberIds.has(r.customerId))
      .reduce((s, r) => s + Number(r.amount), 0);
    const remainingToCollect = Math.max(0, forecastExpected - collectedThisMonth);
    // Invoices due within the current month (collection targets for the forecast)
    const dueThisMonth = open
      .filter(i => i.dueDate <= mEnd)
      .sort((a, b) => b.dueDate - a.dueDate)
      .slice(0, 40)
      .map(i => ({
        company: names.get(i.customerId),
        invoice: i.invoiceNumber,
        dueDate: new Date(i.dueDate).toISOString().slice(0, 10),
        outstandingEur: eur(outstanding(i)),
        daysOverdue: now > i.dueDate ? Math.floor((now - i.dueDate) / (24 * 60 * 60 * 1000)) : 0,
      }));
    const facts = {
      group: input.group,
      companies: members.length,
      totalOpenBalanceEur: eur(open.reduce((s, i) => s + outstanding(i), 0)),
      totalOverdueEur: eur(overdue.reduce((s, i) => s + outstanding(i), 0)),
      overdueInvoices: overdue.length,
      openInvoices: open.length,
      aging,
      currentMonth: `${curYear}-${String(curMonth).padStart(2, "0")}`,
      monthlyForecastEur: eur(forecastExpected),
      collectedThisMonthEur: eur(collectedThisMonth),
      remainingToCollectEur: eur(remainingToCollect),
      invoicesDueOrOverdueThisMonth: dueThisMonth,
      topDebtors: [...members]
        .map(m => ({ name: m.name, overdueEur: invs.filter(i => i.customerId === m.id && isOpenInvoice(i) && now > i.dueDate).reduce((s, i) => s + outstanding(i), 0) }))
        .sort((a, b) => b.overdueEur - a.overdueEur)
        .slice(0, 5)
        .map(d => ({ name: d.name, overdueEur: eur(d.overdueEur) })),
      paymentBehavior: behavior.slice(0, 10).map(b => ({ company: names.get(b.customerId), avgDaysLate: b.avgDaysLate, medianDaysLate: b.medianDaysLate, payments: b.payments })),
      promises: promises.slice(0, 20).map(p => ({ company: names.get(p.customerId), amountEur: Number(p.amount), promisedDate: new Date(p.promisedDate).toISOString().slice(0, 10), status: p.status, notes: p.notes })),
      pendingTasks: pendingTasks.slice(0, 20).map(t => ({ company: names.get(t.customerId), type: t.type, title: t.title, dueDate: t.dueDate ? new Date(t.dueDate).toISOString().slice(0, 10) : null })),
      onHoldStatuses: onHold.map(m => ({ company: m.name, status: m.onHoldStatus })),
      recentNotes: notes.slice(0, 10).map(n => ({ date: new Date(n.createdAt).toISOString().slice(0, 10), content: n.content })),
    };
    const response = await invokeLLM({
      model: "gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            "You are a credit-control analyst helping an accounts-receivable user hit this month's collection forecast. Structure your answer in exactly two sections:\n\n**Profile** — 2-3 sentences maximum, STRICTLY about the financials and the debts this customer group owes to us: open balance, overdue amount and aging, payment behavior (average delay, promise reliability), and this month's forecast position. Do NOT describe the company itself (no industry, size, business background or other generic company info).\n\n**Actions this month** — the COMPLETE list of concrete collection items the user must handle THIS month to achieve the monthly forecast (remainingToCollectEur). List EVERY item, not just the top ones: every invoice or company amount that must be collected (use invoicesDueOrOverdueThisMonth and topDebtors), every promise to follow up, every pending task to close, and any escalation (on-hold, legal) if the data justifies it. Each item on its own bullet line, most valuable first, with amounts in EUR and company names. NEVER suggest calling or phoning the customer about invoices — phrase items as amounts to collect or follow up, e.g. 'Collect invoice Y from X (€Z, N days overdue)'. If the forecast is already covered (remainingToCollectEur = 0), say so and list only monitoring items. Respond in English.",
        },
        { role: "user", content: JSON.stringify(facts) },
      ],
    });
    const raw = response.choices?.[0]?.message?.content;
    const summary = typeof raw === "string" ? raw : Array.isArray(raw) ? raw.map((c: any) => (c?.type === "text" ? c.text : "")).join("") : "";
    if (!summary) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI summary unavailable, please try again" });
    await audit(ctx, "Generate Group AI Summary", "group", input.group);
    return { summary, generatedAt: Date.now() };
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
    const ratingResult = computeCreditRating({
      daysLate: behaviorRow?.medianDaysLate ?? behaviorRow?.avgDaysLate ?? null,
      openBalance: openInv.reduce((s, i) => s + outstanding(i), 0),
      overdueBalance: overdueInv.reduce((s, i) => s + outstanding(i), 0),
      overdue90Plus: overdueInv.filter(i => now - i.dueDate > day90).reduce((s, i) => s + outstanding(i), 0),
      promisesKept: promises.filter(p => p.status === "Kept").length,
      promisesBroken: promises.filter(p => p.status === "Broken").length,
      onHoldStatus: customer.onHoldStatus,
      turnoverYtd: customer.turnoverYtd != null ? Number(customer.turnoverYtd) : null,
      turnoverLastYear: customer.turnoverLastYear != null ? Number(customer.turnoverLastYear) : null,
    });
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
    const watchOverride = watchRow && watchRow.status !== "Auto" ? (watchRow.status === "On Watch" ? "Problematic" : watchRow.status) : null;
    return {
      customer,
      invoices,
      receipts,
      contracts,
      installments,
      promises,
      tasks,
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
});

export const invoicesRouter = router({
  list: protectedProcedure
    .input(z.object({ customerId: z.number().optional(), statuses: z.array(z.enum(invoiceStatuses)).optional() }).optional())
    .query(async ({ input }) => {
      const invoices = await db.listInvoices({ customerId: input?.customerId, statuses: input?.statuses });
      const customers = await db.listCustomers();
      const byId = new Map(customers.map(c => [c.id, c]));
      const now = Date.now();
     return invoices.map(i => ({
       ...i,
       customerName: byId.get(i.customerId)?.name ?? "—",
       customerTier: byId.get(i.customerId)?.tier ?? "New",
        customerGroup: (byId.get(i.customerId)?.customerGroup ?? "").trim() || (byId.get(i.customerId)?.name ?? "—"),
       outstanding: outstanding(i),
       daysOverdue: isOpenInvoice(i) ? daysOverdue(i.dueDate, now) : 0,
     }));
    }),
  aging: protectedProcedure.query(async () => {
    const invoices = await db.listInvoices();
    return computeAging(invoices, Date.now());
  }),
  create: protectedProcedure
    .input(z.object({
      customerId: z.number(),
      invoiceNumber: z.string().min(1),
      issueDate: z.number(),
      dueDate: z.number(),
      amount: z.number().positive(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = await db.createInvoice({ ...input, amount: eur(input.amount), amountEur: eur(input.amount) });
      await audit(ctx, "Create Invoice", "invoice", id, `Invoice ${input.invoiceNumber} for customer #${input.customerId}, amount €${eur(input.amount)}`);
      return { id };
    }),
  markDisputed: protectedProcedure.input(z.object({ id: z.number(), disputed: z.boolean() })).mutation(async ({ ctx, input }) => {
    const inv = await db.getInvoice(input.id);
    if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
    const now = Date.now();
    const status = input.disputed
      ? "Disputed"
      : (deriveInvoiceStatus(Number(inv.amount), Number(inv.paidAmount), inv.dueDate, now, "Open") as any);
    await db.updateInvoice(input.id, { status });
    await audit(ctx, input.disputed ? "Mark Disputed" : "Clear Dispute", "invoice", input.id);
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
        status: "Pending",
        assignedTo: ctx.user.id,
      });
      await audit(ctx, "Create Task", "task", id, `Manual task "${input.title}" for ${customer.name}`);
      return { id };
    }),
  list: protectedProcedure
    .input(z.object({ statuses: z.array(z.enum(taskStatuses)).optional() }).optional())
    .query(async ({ input }) => {
      const rows = await db.listTasks({ statuses: input?.statuses });
      const customers = await db.listCustomers();
      const byId = new Map(customers.map(c => [c.id, c]));
      const invoices = await db.listInvoices();
      const invById = new Map(invoices.map(i => [i.id, i]));
      const allPromises = await db.listPromises();
      const promById = new Map(allPromises.map(p => [p.id, p]));
      return rows.map(t => {
        // Promise follow-up tasks embed "(Promise #<id>)" in their description.
        const m = t.description?.match(/\(Promise #(\d+)\)/);
        const promise = m ? promById.get(Number(m[1])) : undefined;
        return {
          ...t,
          customerName: byId.get(t.customerId)?.name ?? "—",
          invoiceNumber: t.invoiceId ? invById.get(t.invoiceId)?.invoiceNumber : undefined,
          promiseId: promise?.id,
          promise: promise
            ? { id: promise.id, promisedDate: promise.promisedDate, amount: promise.amount, status: promise.status, notes: promise.notes }
            : undefined,
        };
      });
    }),
  updateStatus: protectedProcedure
    .input(z.object({ id: z.number(), status: z.enum(taskStatuses), completionNotes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await db.updateTask(input.id, {
        status: input.status,
        completionNotes: input.completionNotes,
        completedAt: input.status === "Completed" ? Date.now() : undefined,
      });
      await audit(ctx, `Task ${input.status}`, "task", input.id, input.completionNotes);
      return { success: true };
    }),
  runEngine: protectedProcedure.mutation(async ({ ctx }) => {
    const res = await runTaskEngine();
    await audit(ctx, "Run Task Engine", "system", undefined, `Generated ${res.created} task(s)`);
    return res;
  }),
});

export const onHoldRouter = router({
  list: protectedProcedure.query(async () => {
    const rows = await db.listOnHoldProposals();
    const customers = await db.listCustomers();
    const byId = new Map(customers.map(c => [c.id, c]));
    return rows.map(p => ({ ...p, customerName: byId.get(p.customerId)?.name ?? "—", customerTier: byId.get(p.customerId)?.tier ?? "New" }));
  }),
  /** Collections Manager (Credit Controller) submits a proposal with auto-aggregated supporting data. */
  submit: protectedProcedure
    .input(z.object({ customerId: z.number(), reason: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const role = await getAppRole(ctx.user.id);
      requireRole(role, ["Administrator", "Credit Controller"]);
      const invoices = await db.listInvoices({ customerId: input.customerId });
      const now = Date.now();
      const overdue = invoices.filter(i => isOpenInvoice(i) && now > i.dueDate);
      if (overdue.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Customer has no overdue invoices" });
      const totalOverdue = overdue.reduce((s, i) => s + outstanding(i), 0);
      const oldestDays = Math.max(...overdue.map(i => daysOverdue(i.dueDate, now)));
      const supporting = overdue.map(i => ({
        invoiceNumber: i.invoiceNumber,
        dueDate: new Date(i.dueDate).toISOString().slice(0, 10),
        outstanding: outstanding(i).toFixed(2),
        daysOverdue: daysOverdue(i.dueDate, now),
      }));
      const id = await db.createOnHoldProposal({
        customerId: input.customerId,
        reason: input.reason,
        totalOverdue: eur(totalOverdue),
        overdueInvoiceCount: overdue.length,
        oldestOverdueDays: oldestDays,
        supportingData: JSON.stringify(supporting),
        submittedBy: ctx.user.id,
      });
      await db.updateCustomer(input.customerId, { onHoldStatus: "Under Review" });
      await audit(ctx, "Submit On-Hold Proposal", "onHoldProposal", id, `Customer #${input.customerId}, €${eur(totalOverdue)} overdue across ${overdue.length} invoice(s)`);
      return { id };
    }),
  /** Management approves/rejects and advances workflow: Under Review → Eligible for On Hold → On Hold → Legal. */
  transition: protectedProcedure
    .input(z.object({ id: z.number(), to: z.enum(onHoldStatuses), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const role = await getAppRole(ctx.user.id);
      requireRole(role, ["Administrator", "Management"]);
      const proposal = await db.getOnHoldProposal(input.id);
      if (!proposal) throw new TRPCError({ code: "NOT_FOUND" });
      if (!canTransitionOnHold(proposal.status, input.to)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Invalid transition from "${proposal.status}" to "${input.to}"` });
      }
      await db.updateOnHoldProposal(input.id, {
        status: input.to,
        decidedBy: ctx.user.id,
        decisionNotes: input.notes,
        decidedAt: Date.now(),
      });
      const customerStatus =
        input.to === "Rejected" || input.to === "Resolved" ? "Active" : (input.to as any);
      await db.updateCustomer(proposal.customerId, { onHoldStatus: customerStatus });
      await audit(ctx, `On-Hold: ${proposal.status} → ${input.to}`, "onHoldProposal", input.id, input.notes);
      return { success: true };
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
    const [invoices, installments, forecastTarget, collectedThisMonth, tasksPending, proposals] = await Promise.all([
      db.listInvoices(),
      db.listInstallments(),
      db.sumForecastExpected(year, month),
      db.sumReceiptsInRange(start, end),
      db.listTasks({ statuses: ["Pending", "In Progress"] }),
      db.listOnHoldProposals(),
    ]);
    const aging = computeAging(invoices, now);
    const arBalance = aging.totalOverdue + aging.current;
    const last90Sales = await db.sumInvoicedInRange(now - 90 * 24 * 60 * 60 * 1000, now);
    const dso = computeDso(arBalance, last90Sales, 90);
    const forecast = buildForecast(invoices, installments, now, 6);
    const escalations = tasksPending.filter(t => t.type === "Escalation +30").length;
    const underReview = proposals.filter(p => p.status === "Under Review" || p.status === "Eligible for On Hold").length;
    const watchRowsDash = await db.listGroupWatchStatuses().catch(() => []);
    const dayMs = 24 * 60 * 60 * 1000;
    const criticalGroups = watchRowsDash.filter(
      w =>
        w.status === "Critical" ||
        (w.status === "Problematic" && w.problematicSince != null && now - w.problematicSince >= 30 * dayMs)
    ).length;
    return {
      year,
      month,
      target: forecastTarget,
      collected: collectedThisMonth,
      totalOverdue: aging.totalOverdue,
      overdueCount: Object.values(aging.buckets).reduce((s, b) => s + b.count, 0),
      arBalance,
      dso,
      aging,
      forecast,
      pendingTasks: tasksPending.length,
      escalations,
      onHoldPending: underReview,
      criticalGroups,
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
    .input(z.object({ customerId: z.number(), invoiceId: z.number().optional(), promisedDate: z.number(), amount: z.number().positive(), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const id = await db.createPromise({ ...input, amount: eur(input.amount), createdBy: ctx.user.id });
      await audit(ctx, "Record Promise-to-Pay", "promiseToPay", id, `Customer #${input.customerId} promised €${eur(input.amount)} by ${new Date(input.promisedDate).toISOString().slice(0, 10)}`);
      const cust = await db.getCustomer(input.customerId);
      if (cust) {
        const groupKey = cust.customerGroup || cust.name;
        const dateStr = new Date(input.promisedDate).toLocaleDateString("en-GB");
        // Log to activity log
        await db.addActivityLog({
          groupName: groupKey,
          customerId: input.customerId,
          activityType: "promise",
          title: `Promise-to-Pay: €${Number(eur(input.amount)).toLocaleString()} by ${dateStr}`,
          description: `${cust.name}${input.notes ? ` — ${input.notes}` : ""}`,
          createdBy: ctx.user.id,
          createdAt: new Date(),
        }).catch(() => {});
        // Create a follow-up task due on the promised date so the team checks whether the company paid.
        const taskId = await db.createTask({
          customerId: input.customerId,
          type: "Manual",
          title: `Promise to Pay — €${Number(eur(input.amount)).toLocaleString()}`,
          description: `Verify that ${cust.name} paid the promised amount of €${Number(eur(input.amount)).toLocaleString()} due ${dateStr}.${input.notes ? ` Notes: ${input.notes}` : ""} (Promise #${id})`,
          dueDate: input.promisedDate,
          invoiceId: input.invoiceId,
          status: "Pending",
          assignedTo: ctx.user.id,
        });
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
          // Log to activity log
          await db.addActivityLog({
            groupName: groupKey,
            customerId: promise.customerId,
            activityType: "promise",
            title: `Promise marked ${input.status}`,
            description: `${cust.name} — €${Number(promise.amount).toLocaleString()}`,
            createdBy: ctx.user.id,
            createdAt: new Date(),
          }).catch(() => {});
          // Auto-complete the follow-up task linked to this promise, if still open.
          const tasks = await db.listTasks({ customerId: promise.customerId });
          const followUp = tasks.find(
            t => (t.status === "Pending" || t.status === "In Progress") && t.description?.includes(`(Promise #${input.id})`),
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
  syncPushReceipt: protectedProcedure.input(z.object({ receiptId: z.number() })).mutation(async ({ ctx, input }) => {
    const role = await getAppRole(ctx.user.id);
    requireRole(role, ["Administrator", "Accounting"]);
    try {
      const res = await softone.pushReceipt(input.receiptId);
      await audit(ctx, "Softone Push Receipt", "sync", input.receiptId, `Softone id ${res.softoneId}`);
      return res;
    } catch (e: any) {
      await db.addSyncLog({ direction: "Push", entityType: "receipts", recordCount: 0, status: "Failed", message: e.message });
      throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
    }
  }),
});

export const callsRouter = router({
  sendGroupEmail: protectedProcedure
    .input(
      z.object({
        customerId: z.number(),
        recipientEmail: z.string().email(),
        recipientName: z.string().optional(),
        templateType: z.enum(["Friendly Reminder", "Final Notice", "Statement", "Custom"]),
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

        // TODO: Integrate with actual email sending service (e.g., SendGrid, AWS SES)
        // For now, we'll just mark it as sent and log it
        // In production, you would call the email service here and handle errors

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
        outcome: z.enum(["Reached", "No Answer", "Voicemail", "Promised Payment", "Dispute", "Other"]),
        notes: z.string().max(2000).optional(),
        confirmationStatus: z.enum(confirmationStatuses).optional(),
        confirmationAmount: z.number().optional(),
        followUpDate: z.number().optional(),
        promisedDate: z.number().optional(),
        // When Confirmed and an open promise already exists: reschedule it instead of creating a new one.
        reschedulePromiseId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const parts: string[] = [];
      if (input.contactName) parts.push(`Contact: ${input.contactName}`);
      if (input.notes) parts.push(input.notes);
      await db.addActivityLog({
        groupName: input.group,
        customerId: input.customerId,
        activityType: "call",
        title: `Call logged — ${input.outcome}`,
        description: parts.length > 0 ? parts.join(" · ") : undefined,
        createdBy: ctx.user.id,
        createdAt: new Date(),
      });

      // Update confirmation status if provided
      if (input.confirmationStatus) {
        const previous = await db.getGroupConfirmationStatus(input.group);
        await db.upsertGroupConfirmationStatus(input.group, {
          status: input.confirmationStatus,
          // Amount always follows the new status: reset to 0 for Not Contacted / Broken,
          // otherwise use the newly entered value (or 0 if none was provided).
          amount:
            input.confirmationStatus === "Not Contacted" || input.confirmationStatus === "Broken"
              ? "0.00"
              : String(input.confirmationAmount ?? 0),
          // Follow-up date only applies to "Pending Follow-up"; clear it on any other status
          followUpDate: input.confirmationStatus === "Pending Follow-up" ? input.followUpDate : null,
          notes: input.notes,
          updatedBy: ctx.user.id,
        });

        // Cancel stale auto-created tasks/promises from the previous status
        await cleanupStatusArtifacts(ctx, {
          group: input.group,
          previousStatus: previous?.status ?? null,
          newStatus: input.confirmationStatus,
        });

        // "Confirmed" is effectively a Promise-to-Pay: auto-create the promise record
        // (with follow-up task + activity log) via the shared helper.
        if (
          input.confirmationStatus === "Confirmed" &&
          input.confirmationAmount !== undefined &&
          input.confirmationAmount > 0
        ) {
          let rescheduled: number | null = null;
          if (input.reschedulePromiseId) {
            rescheduled = await rescheduleGroupPromise(ctx, {
              group: input.group,
              promiseId: input.reschedulePromiseId,
              amount: input.confirmationAmount,
              promisedDate: input.promisedDate ?? endOfCurrentMonth(),
              notes: input.notes,
            });
          }
          if (!rescheduled) {
            await createGroupPromise(ctx, {
              group: input.group,
              customerId: input.customerId,
              amount: input.confirmationAmount,
              promisedDate: input.promisedDate ?? endOfCurrentMonth(),
              notes: input.notes,
            });
          }
        }

        // "Pending Follow-up" with a date: create/reschedule a follow-up-call task
        if (input.confirmationStatus === "Pending Follow-up" && input.followUpDate) {
          await upsertFollowUpTask(ctx, {
            group: input.group,
            customerId: input.customerId,
            followUpDate: input.followUpDate,
            amount: input.confirmationAmount,
            notes: input.notes,
          });
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
      // Month-aware: statuses reset each month. A row last updated in a previous
      // month is presented as "Not Contacted" so the badge/dialog start fresh.
      if (isConfirmationStale(row.updatedAt)) {
        return { ...row, status: "Not Contacted" as typeof row.status, amount: "0.00", followUpDate: null, notes: null };
      }
      return row;
    }),

  /** Most recent open (Pending) promise for a group — used by Log Call to offer rescheduling. */
  getOpenPromise: protectedProcedure
    .input(z.object({ group: z.string().min(1).max(255) }))
    .query(async ({ input }) => {
      return findOpenGroupPromise(input.group);
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
        // Follow-up date only applies to "Pending Follow-up"; clear it on any other status
        followUpDate: input.status === "Pending Follow-up" ? input.followUpDate : null,
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
