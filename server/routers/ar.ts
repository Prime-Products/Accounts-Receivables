import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  appRoles,
  customerTiers,
  invoiceStatuses,
  onHoldStatuses,
  receiptMethods,
  taskStatuses,
} from "../../drizzle/schema";
import * as db from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import {
  buildForecast,
  canTransitionOnHold,
  computeAging,
  computeDso,
  daysOverdue,
  DEFAULT_FX_RATES,
  deriveInvoiceStatus,
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

export const customersRouter = router({
  list: protectedProcedure.query(async () => {
    const [customers, invoices] = await Promise.all([db.listCustomers(), db.listInvoices()]);
    const now = Date.now();
    return customers.map(c => {
      const custInvoices = invoices.filter(i => i.customerId === c.id);
      const open = custInvoices.filter(isOpenInvoice);
      const overdue = open.filter(i => now > i.dueDate);
      return {
        ...c,
        openBalance: open.reduce((s, i) => s + outstanding(i), 0),
        overdueBalance: overdue.reduce((s, i) => s + outstanding(i), 0),
        overdueCount: overdue.length,
      };
    });
  }),
  /** Group-level view: aggregated totals per customer group. */
  groups: protectedProcedure.query(async () => {
    const [customers, invoices] = await Promise.all([db.listCustomers(), db.listInvoices()]);
    const now = Date.now();
    const byCustomer = new Map<number, typeof invoices>();
    for (const inv of invoices) {
      const arr = byCustomer.get(inv.customerId);
      if (arr) arr.push(inv);
      else byCustomer.set(inv.customerId, [inv]);
    }
    const groups = new Map<
      string,
      {
        group: string;
        companyCount: number;
        openBalance: number;
        overdueBalance: number;
        overdueCount: number;
        openByCurrency: Record<string, number>;
        branches: Set<string>;
      }
    >();
    for (const c of customers) {
      const key = (c.customerGroup ?? "").trim() || c.name;
      let g = groups.get(key);
      if (!g) {
        g = { group: key, companyCount: 0, openBalance: 0, overdueBalance: 0, overdueCount: 0, openByCurrency: {}, branches: new Set() };
        groups.set(key, g);
      }
      g.companyCount += 1;
      for (const inv of byCustomer.get(c.id) ?? []) {
        if (!isOpenInvoice(inv)) continue;
        g.openBalance += outstanding(inv);
        const cur = inv.currency ?? "EUR";
        g.openByCurrency[cur] = (g.openByCurrency[cur] ?? 0) + outstandingOriginal(inv);
        if (inv.company) g.branches.add(inv.company);
        if (now > inv.dueDate) {
          g.overdueBalance += outstanding(inv);
          g.overdueCount += 1;
        }
      }
    }
    return Array.from(groups.values())
      .map(g => ({ ...g, branches: Array.from(g.branches).sort() }))
      .sort((a, b) => b.openBalance - a.openBalance);
  }),
  /** Group card: aggregates + invoices, scoped by optional member company and/or Prime Branch. */
  groupDetail: protectedProcedure
    .input(
      z.object({
        group: z.string().min(1),
        customerId: z.number().optional(),
        branch: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      const customers = await db.listCustomers();
      const members = customers.filter(c => ((c.customerGroup ?? "").trim() || c.name) === input.group);
      if (members.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Group not found" });
      const memberIds = new Set(members.map(m => m.id));
      const allInvoices = await db.listInvoices();
      const now = Date.now();
      // Full group scope (for the branch list and per-company summary regardless of filters)
      const groupInvoices = allInvoices.filter(i => memberIds.has(i.customerId));
      const branches = Array.from(new Set(groupInvoices.map(i => i.company).filter((b): b is string => !!b))).sort();
      // Filtered scope drives all page data
      const scoped = groupInvoices.filter(
        i =>
          (input.customerId === undefined || i.customerId === input.customerId) &&
          (input.branch === undefined || i.company === input.branch),
      );
      const aging = computeAging(scoped, now);
      const open = scoped.filter(isOpenInvoice);
      const overdue = open.filter(i => now > i.dueDate);
      const openByCurrency: Record<string, number> = {};
      for (const inv of open) {
        const cur = inv.currency ?? "EUR";
        openByCurrency[cur] = (openByCurrency[cur] ?? 0) + outstandingOriginal(inv);
      }
      // Per-company summary within current branch filter (company filter not applied so the list stays complete)
      const branchScoped = groupInvoices.filter(i => input.branch === undefined || i.company === input.branch);
      const companies = members
        .map(m => {
          const mine = branchScoped.filter(i => i.customerId === m.id);
          const mOpen = mine.filter(isOpenInvoice);
          const mOverdue = mOpen.filter(i => now > i.dueDate);
          return {
            id: m.id,
            name: m.name,
            code: m.code,
            tier: m.tier,
            openBalance: mOpen.reduce((s, i) => s + outstanding(i), 0),
            overdueBalance: mOverdue.reduce((s, i) => s + outstanding(i), 0),
            invoiceCount: mOpen.length,
          };
        })
        .sort((a, b) => b.openBalance - a.openBalance);
      const sortedInvoices = [...scoped].sort((a, b) => b.dueDate - a.dueDate);
      const customerNames = new Map(members.map(m => [m.id, m.name]));
      return {
        group: input.group,
        companies,
        branches,
        aging,
        totals: {
          openBalance: open.reduce((s, i) => s + outstanding(i), 0),
          overdueBalance: overdue.reduce((s, i) => s + outstanding(i), 0),
          overdueCount: overdue.length,
          openCount: open.length,
          openByCurrency,
        },
        invoices: sortedInvoices.slice(0, 500).map(i => ({ ...i, customerName: customerNames.get(i.customerId) ?? "" })),
      };
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
    return { customer, invoices, receipts, contracts, installments, promises, tasks, aging };
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
  list: protectedProcedure
    .input(z.object({ statuses: z.array(z.enum(taskStatuses)).optional() }).optional())
    .query(async ({ input }) => {
      const rows = await db.listTasks({ statuses: input?.statuses });
      const customers = await db.listCustomers();
      const byId = new Map(customers.map(c => [c.id, c]));
      const invoices = await db.listInvoices();
      const invById = new Map(invoices.map(i => [i.id, i]));
      return rows.map(t => ({
        ...t,
        customerName: byId.get(t.customerId)?.name ?? "—",
        invoiceNumber: t.invoiceId ? invById.get(t.invoiceId)?.invoiceNumber : undefined,
      }));
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
    const [invoices, installments, plan, collectedThisMonth, tasksPending, proposals] = await Promise.all([
      db.listInvoices(),
      db.listInstallments(),
      db.getPlan(year, month),
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
    return {
      year,
      month,
      target: plan ? Number(plan.targetAmount) : null,
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
    };
  }),
  setTarget: protectedProcedure
    .input(z.object({ year: z.number().int(), month: z.number().int().min(1).max(12), targetAmount: z.number().nonnegative(), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const role = await getAppRole(ctx.user.id);
      requireRole(role, ["Administrator", "Management", "Credit Controller"]);
      await db.upsertPlan(input.year, input.month, eur(input.targetAmount), ctx.user.id, input.notes);
      await audit(ctx, "Set Collection Target", "collectionPlan", `${input.year}-${input.month}`, `Target €${eur(input.targetAmount)}`);
      return { success: true };
    }),
  plans: protectedProcedure.query(async () => {
    const plans = await db.listPlans();
    const results = [];
    for (const p of plans) {
      const { start, end } = monthRange(p.year, p.month);
      const actual = await db.sumReceiptsInRange(start, end);
      results.push({ ...p, actual });
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
      return { id };
    }),
  updatePromise: protectedProcedure
    .input(z.object({ id: z.number(), status: z.enum(["Pending", "Kept", "Broken"]) }))
    .mutation(async ({ ctx, input }) => {
      await db.updatePromise(input.id, { status: input.status });
      await audit(ctx, `Promise ${input.status}`, "promiseToPay", input.id);
      return { success: true };
    }),

  /** Generate (or refresh) the smart per-customer forecast for a month. */
  generateSmart: protectedProcedure
    .input(z.object({ year: z.number().int(), month: z.number().int().min(1).max(12), useAi: z.boolean().default(true) }))
    .mutation(async ({ ctx, input }) => {
      const role = await getAppRole(ctx.user.id);
      requireRole(role, ["Administrator", "Management", "Credit Controller", "Accounting"]);
      const result = await generateMonthlyForecast(input.year, input.month, { useAi: input.useAi });
      await audit(ctx, "Generate Smart Forecast", "forecast", `${input.year}-${input.month}`, `${result.customers} customers (${result.aiCount} AI, ${result.heuristicCount} heuristic)`);
      return result;
    }),

  /** Per-customer forecast entries for a month, with live collected amounts. */
  smartEntries: protectedProcedure
    .input(z.object({ year: z.number().int(), month: z.number().int().min(1).max(12) }))
    .query(async ({ input }) => {
      const [entries, customers, receipts] = await Promise.all([
        db.listForecastEntries(input.year, input.month),
        db.listCustomers(),
        db.listReceipts(),
      ]);
      const byId = new Map(customers.map(c => [c.id, c]));
      const { start, end } = monthRange(input.year, input.month);
      const collectedByCustomer = new Map<number, number>();
      for (const r of receipts) {
        if (r.receiptDate >= start && r.receiptDate < end) {
          collectedByCustomer.set(r.customerId, (collectedByCustomer.get(r.customerId) ?? 0) + Number(r.amount));
        }
      }
      const rows = entries.map(e => {
        const collected = collectedByCustomer.get(e.customerId) ?? 0;
        return {
          ...e,
          customerName: byId.get(e.customerId)?.name ?? "—",
          customerTier: byId.get(e.customerId)?.tier ?? "New",
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
          acc.collected += r.collected;
          return acc;
        },
        { due: 0, overdue: 0, aiSuggested: 0, expected: 0, collected: 0 },
      );
      return { entries: rows, totals: { ...totals, remaining: Math.max(0, totals.expected - totals.collected) } };
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
      report: z.enum(["aging", "forecast", "soa"]),
      format: z.enum(["xlsx", "pdf"]),
      customerId: z.number().optional(),
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
              bucket: d <= 30 ? "0-30" : d <= 60 ? "31-60" : d <= 90 ? "61-90" : "90+",
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
            { header: "Issue Date", key: "issue", width: 14 },
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
