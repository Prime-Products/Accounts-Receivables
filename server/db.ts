import { and, desc, eq, gte, inArray, like, lt, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  activityLog,
  appSettings,
  auditLogs,
  collectionPlans,
  contractInstallments,
  contracts,
  customers,
  emailHistory,
  emailTemplates,
  emailTemplateTypes,
  forecastEntries,
  groupConfirmationStatus,
  groupNotes,
  groupCollectionProfile,
  groupWatchStatus,
  InsertActivityLog,
  InsertContract,
  InsertCustomer,
  InsertEmailHistory,
  InsertForecastEntry,
  InsertGroupConfirmationStatus,
  InsertInvoice,
  InsertPaymentContact,
  InsertReceipt,
  InsertTask,
  InsertUser,
  invoices,
  paymentBehavior,
  paymentContacts,
  promisesToPay,
  receiptAllocations,
  receipts,
  syncLogs,
  tasks,
  taskComments,
  taskInvoices,
  taskWatchers,
  userProfiles,
  users,
} from "../drizzle/schema";
import {
  paymentBankDetails,
  InsertPaymentBankDetails,
} from "../drizzle/schema";
import { vessels, InsertVessel } from "../drizzle/schema";
import {
  creditNotes,
  creditNoteAllocations,
  InsertCreditNote,
  InsertCreditNoteAllocation,
} from "../drizzle/schema";
import { teamMembers, InsertTeamMember } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/** All login users — used to resolve task creator names. */
export async function listUsers() {
  const db = await requireDb();
  return db.select().from(users);
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db;
}

// ---------- User profiles / app roles ----------
export async function getOrCreateProfile(userId: number) {
  const db = await requireDb();
  const found = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  if (found.length > 0) return found[0];
  await db.insert(userProfiles).values({ userId }).onDuplicateKeyUpdate({ set: { userId } });
  const created = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  return created[0];
}

export async function setAppRole(userId: number, appRole: "Administrator" | "Accounting" | "Credit Controller" | "Management") {
  const db = await requireDb();
  await getOrCreateProfile(userId);
  await db.update(userProfiles).set({ appRole }).where(eq(userProfiles.userId, userId));
}

export async function listUsersWithProfiles() {
  const db = await requireDb();
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      appRole: userProfiles.appRole,
      lastSignedIn: users.lastSignedIn,
    })
    .from(users)
    .leftJoin(userProfiles, eq(users.id, userProfiles.userId));
}

// ---------- Customers ----------
/**
 * Micro-cache for hot, frequently re-read reference lists (customers / invoices).
 * The remote DB round-trip is ~150-300ms; many procedures re-fetch the full
 * customer list just to resolve names. A 10s TTL keeps data effectively live
 * for interactive use while collapsing bursts of identical reads (page loads
 * fire 3-5 procedures that each call listCustomers). Any write to the table
 * clears its cache entry immediately.
 */
const microCache = new Map<string, { at: number; data: unknown }>();
const MICRO_TTL_MS = 10_000;

function cacheGet<T>(key: string): T | undefined {
  const hit = microCache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > MICRO_TTL_MS) {
    microCache.delete(key);
    return undefined;
  }
  return hit.data as T;
}

function cacheSet(key: string, data: unknown) {
  microCache.set(key, { at: Date.now(), data });
}

export function invalidateCache(prefix: string) {
  for (const key of Array.from(microCache.keys())) {
    if (key.startsWith(prefix)) microCache.delete(key);
  }
}

export async function listCustomers() {
  const cached = cacheGet<Awaited<ReturnType<typeof listCustomersUncached>>>("customers:all");
  if (cached) return cached;
  const rows = await listCustomersUncached();
  cacheSet("customers:all", rows);
  return rows;
}

async function listCustomersUncached() {
  const db = await requireDb();
  return db.select().from(customers).orderBy(customers.name);
}

export async function getCustomer(id: number) {
  const db = await requireDb();
  const r = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  return r[0];
}

export async function createCustomer(data: InsertCustomer) {
  const db = await requireDb();
  const res = await db.insert(customers).values(data);
  invalidateCache("customers:");
  return Number((res as any)[0].insertId);
}

export async function updateCustomer(id: number, data: Partial<InsertCustomer>) {
  const db = await requireDb();
  await db.update(customers).set(data).where(eq(customers.id, id));
  invalidateCache("customers:");
}

/**
 * Bulk-creates customers, chunked to stay inside MySQL's placeholder limit.
 * Used by the CRM contacts import to register directory-only companies
 * (companies with people but no invoices yet).
 */
export async function createCustomersBulk(rows: InsertCustomer[], chunkSize = 200) {
  if (rows.length === 0) return 0;
  const db = await requireDb();
  let inserted = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    await db.insert(customers).values(chunk);
    inserted += chunk.length;
  }
  invalidateCache("customers:");
  return inserted;
}

// ---------- Invoices ----------
export async function listInvoices(filter?: { customerId?: number; statuses?: string[] }) {
  const cacheable = !filter?.customerId && (!filter?.statuses || filter.statuses.length === 0);
  if (cacheable) {
    const cached = cacheGet<Awaited<ReturnType<typeof listInvoicesQuery>>>("invoices:all");
    if (cached) return cached;
    const rows = await listInvoicesQuery(filter);
    cacheSet("invoices:all", rows);
    return rows;
  }
  return listInvoicesQuery(filter);
}

async function listInvoicesQuery(filter?: { customerId?: number; statuses?: string[] }) {
  const db = await requireDb();
  const conds = [];
  if (filter?.customerId) conds.push(eq(invoices.customerId, filter.customerId));
  if (filter?.statuses && filter.statuses.length > 0) conds.push(inArray(invoices.status, filter.statuses as any));
  const q = db.select().from(invoices);
  const rows = conds.length > 0 ? await q.where(and(...conds)).orderBy(desc(invoices.dueDate)) : await q.orderBy(desc(invoices.dueDate));
  return rows;
}

export async function getInvoice(id: number) {
  const db = await requireDb();
  const r = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  return r[0];
}

export async function createInvoice(data: InsertInvoice) {
  const db = await requireDb();
  const res = await db.insert(invoices).values(data);
  invalidateCache("invoices:");
  return Number((res as any)[0].insertId);
}

export async function updateInvoice(id: number, data: Partial<InsertInvoice>) {
  const db = await requireDb();
  await db.update(invoices).set(data).where(eq(invoices.id, id));
  invalidateCache("invoices:");
}

// ---------- Receipts & allocations ----------
export async function listReceipts(customerId?: number) {
  const db = await requireDb();
  const q = db.select().from(receipts);
  return customerId ? q.where(eq(receipts.customerId, customerId)).orderBy(desc(receipts.receiptDate)) : q.orderBy(desc(receipts.receiptDate));
}

export async function listReceiptsInRange(start: number, end: number, customerId?: number) {
  const db = await requireDb();
  const conds = [gte(receipts.receiptDate, start), lt(receipts.receiptDate, end)];
  if (customerId) conds.push(eq(receipts.customerId, customerId));
  return db.select().from(receipts).where(and(...conds)).orderBy(desc(receipts.receiptDate));
}

export async function createReceipt(data: InsertReceipt) {
  const db = await requireDb();
  const res = await db.insert(receipts).values(data);
  return Number((res as any)[0].insertId);
}

export async function addAllocation(receiptId: number, invoiceId: number, amount: string) {
  const db = await requireDb();
  await db.insert(receiptAllocations).values({ receiptId, invoiceId, amount });
}

export async function listAllocationsForReceipt(receiptId: number) {
  const db = await requireDb();
  return db.select().from(receiptAllocations).where(eq(receiptAllocations.receiptId, receiptId));
}

export async function listAllocationsForInvoice(invoiceId: number) {
  const db = await requireDb();
  return db.select().from(receiptAllocations).where(eq(receiptAllocations.invoiceId, invoiceId));
}

// ---------- Contracts & installments ----------
export async function listContracts(customerId?: number) {
  const db = await requireDb();
  const q = db.select().from(contracts);
  return customerId ? q.where(eq(contracts.customerId, customerId)).orderBy(desc(contracts.endDate)) : q.orderBy(desc(contracts.endDate));
}

export async function getContract(id: number) {
  const db = await requireDb();
  const r = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1);
  return r[0];
}

export async function createContract(data: InsertContract) {
  const db = await requireDb();
  const res = await db.insert(contracts).values(data);
  return Number((res as any)[0].insertId);
}

export async function updateContract(id: number, data: Partial<InsertContract>) {
  const db = await requireDb();
  await db.update(contracts).set(data).where(eq(contracts.id, id));
}

export async function listInstallments(contractId?: number) {
  const db = await requireDb();
  const q = db.select().from(contractInstallments);
  return contractId ? q.where(eq(contractInstallments.contractId, contractId)).orderBy(contractInstallments.dueDate) : q.orderBy(contractInstallments.dueDate);
}

export async function createInstallment(data: typeof contractInstallments.$inferInsert) {
  const db = await requireDb();
  const res = await db.insert(contractInstallments).values(data);
  return Number((res as any)[0].insertId);
}

export async function updateInstallment(id: number, data: Partial<typeof contractInstallments.$inferInsert>) {
  const db = await requireDb();
  await db.update(contractInstallments).set(data).where(eq(contractInstallments.id, id));
}

// ---------- Tasks ----------
export async function listTasks(filter?: { statuses?: string[]; customerId?: number }) {
  const db = await requireDb();
  const conds = [];
  if (filter?.statuses && filter.statuses.length > 0) conds.push(inArray(tasks.status, filter.statuses as any));
  if (filter?.customerId) conds.push(eq(tasks.customerId, filter.customerId));
  const q = db.select().from(tasks);
  return conds.length > 0 ? q.where(and(...conds)).orderBy(tasks.dueDate) : q.orderBy(tasks.dueDate);
}

export async function createTask(data: InsertTask) {
  const db = await requireDb();
  const res = await db.insert(tasks).values(data);
  return Number((res as any)[0].insertId);
}

export async function updateTask(id: number, data: Partial<InsertTask>) {
  const db = await requireDb();
  await db.update(tasks).set(data).where(eq(tasks.id, id));
}

export async function findTaskByInvoiceAndType(invoiceId: number, type: string) {
  const db = await requireDb();
  const r = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.invoiceId, invoiceId), eq(tasks.type, type as any)))
    .limit(1);
  return r[0];
}

export async function findTaskByContractAndType(contractId: number, type: string) {
  const db = await requireDb();
  const r = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.contractId, contractId), eq(tasks.type, type as any)))
    .limit(1);
  return r[0];
}

export async function getTask(id: number) {
  const db = await requireDb();
  const r = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  return r[0];
}

// ---------- Task comments (internal collaboration) ----------
export async function listTaskComments(taskId: number) {
  const db = await requireDb();
  return db.select().from(taskComments).where(eq(taskComments.taskId, taskId)).orderBy(taskComments.createdAt);
}

export async function addTaskComment(data: { taskId: number; authorId?: number | null; authorName: string; body: string }) {
  const db = await requireDb();
  const res = await db.insert(taskComments).values(data);
  return Number((res as any)[0].insertId);
}

export async function deleteTaskComment(id: number) {
  const db = await requireDb();
  await db.delete(taskComments).where(eq(taskComments.id, id));
}

// ---------- Task watchers (avatar stack) ----------
export async function listTaskWatchers(taskId: number) {
  const db = await requireDb();
  return db
    .select({
      id: taskWatchers.id,
      taskId: taskWatchers.taskId,
      memberId: taskWatchers.memberId,
      name: teamMembers.name,
      title: teamMembers.title,
    })
    .from(taskWatchers)
    .innerJoin(teamMembers, eq(taskWatchers.memberId, teamMembers.id))
    .where(eq(taskWatchers.taskId, taskId))
    .orderBy(taskWatchers.createdAt);
}

export async function listWatchersForTasks(taskIds: number[]) {
  if (taskIds.length === 0) return [];
  const db = await requireDb();
  return db
    .select({
      id: taskWatchers.id,
      taskId: taskWatchers.taskId,
      memberId: taskWatchers.memberId,
      name: teamMembers.name,
      title: teamMembers.title,
    })
    .from(taskWatchers)
    .innerJoin(teamMembers, eq(taskWatchers.memberId, teamMembers.id))
    .where(inArray(taskWatchers.taskId, taskIds))
    .orderBy(taskWatchers.createdAt);
}

export async function addTaskWatcher(taskId: number, memberId: number) {
  const db = await requireDb();
  // Avoid duplicates
  const existing = await db
    .select({ id: taskWatchers.id })
    .from(taskWatchers)
    .where(and(eq(taskWatchers.taskId, taskId), eq(taskWatchers.memberId, memberId)));
  if (existing.length > 0) return existing[0].id;
  const res = await db.insert(taskWatchers).values({ taskId, memberId });
  return Number((res as any)[0].insertId);
}

export async function removeTaskWatcher(taskId: number, memberId: number) {
  const db = await requireDb();
  await db
    .delete(taskWatchers)
    .where(and(eq(taskWatchers.taskId, taskId), eq(taskWatchers.memberId, memberId)));
}

// ---------- Task ↔ invoice attachments ----------
export async function listTaskInvoices(taskId: number) {
  const db = await requireDb();
  return db.select().from(taskInvoices).where(eq(taskInvoices.taskId, taskId));
}

export async function listAllTaskInvoices() {
  const db = await requireDb();
  return db.select().from(taskInvoices);
}

export async function addTaskInvoices(taskId: number, invoiceIds: number[]) {
  if (invoiceIds.length === 0) return;
  const db = await requireDb();
  await db
    .insert(taskInvoices)
    .values(invoiceIds.map(invoiceId => ({ taskId, invoiceId })))
    .onDuplicateKeyUpdate({ set: { taskId } });
}


// ---------- Collection plans & promises ----------
export async function getPlan(year: number, month: number) {
  const db = await requireDb();
  const r = await db
    .select()
    .from(collectionPlans)
    .where(and(eq(collectionPlans.year, year), eq(collectionPlans.month, month)))
    .limit(1);
  return r[0];
}

export async function upsertPlan(year: number, month: number, targetAmount: string, createdBy?: number, notes?: string) {
  const db = await requireDb();
  const existing = await getPlan(year, month);
  if (existing) {
    await db.update(collectionPlans).set({ targetAmount, notes }).where(eq(collectionPlans.id, existing.id));
    return existing.id;
  }
  const res = await db.insert(collectionPlans).values({ year, month, targetAmount, createdBy, notes });
  return Number((res as any)[0].insertId);
}

export async function listPlans() {
  const db = await requireDb();
  return db.select().from(collectionPlans).orderBy(desc(collectionPlans.year), desc(collectionPlans.month));
}

// ---------- Forecast entries (per-customer monthly collection forecast) ----------
export async function listForecastEntries(year: number, month: number) {
  const db = await requireDb();
  return db
    .select()
    .from(forecastEntries)
    .where(and(eq(forecastEntries.year, year), eq(forecastEntries.month, month)))
    .orderBy(desc(forecastEntries.expectedAmount));
}

/** Sum of expected (user-adjusted) forecast amounts for a month — the unified monthly target. */
export async function sumForecastExpected(year: number, month: number) {
  const db = await requireDb();
  const rows = await db
    .select({ expectedAmount: forecastEntries.expectedAmount })
    .from(forecastEntries)
    .where(and(eq(forecastEntries.year, year), eq(forecastEntries.month, month)));
  if (rows.length === 0) return null;
  return rows.reduce((s, r) => s + Number(r.expectedAmount), 0);
}

export async function getForecastEntry(id: number) {
  const db = await requireDb();
  const r = await db.select().from(forecastEntries).where(eq(forecastEntries.id, id)).limit(1);
  return r[0];
}

export async function upsertForecastEntry(data: InsertForecastEntry) {
  const db = await requireDb();
  const existing = await db
    .select()
    .from(forecastEntries)
    .where(
      and(
        eq(forecastEntries.year, data.year),
        eq(forecastEntries.month, data.month),
        data.customerGroup ? eq(forecastEntries.customerGroup, data.customerGroup) : eq(forecastEntries.customerId, data.customerId),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    // Preserve user adjustments on regeneration: only refresh due/AI fields.
    const keep = existing[0];
    // Also preserve initialForecast if it was already set
    const initialToKeep = keep.initialForecast ?? data.expectedAmount;
    await db
      .update(forecastEntries)
      .set({
        customerId: data.customerId,
        customerGroup: data.customerGroup,
        dueAmount: data.dueAmount,
        overdueAmount: data.overdueAmount,
        aiSuggestedAmount: data.aiSuggestedAmount,
        aiReasoning: data.aiReasoning,
        initialForecast: initialToKeep,
        ...(keep.userAdjusted ? {} : { expectedAmount: data.expectedAmount }),
      })
      .where(eq(forecastEntries.id, keep.id));
    return keep.id;
  }
  const res = await db.insert(forecastEntries).values({
    ...data,
    initialForecast: data.expectedAmount,
  });
  return Number((res as any)[0].insertId);
}

export async function updateForecastEntry(id: number, data: Partial<InsertForecastEntry>) {
  const db = await requireDb();
  await db.update(forecastEntries).set(data).where(eq(forecastEntries.id, id));
}

/** Remove a single forecast entry (used when discarding an entry created on the fly). */
export async function deleteForecastEntry(id: number) {
  const db = await requireDb();
  await db.delete(forecastEntries).where(eq(forecastEntries.id, id));
}

export async function listForecastMonths() {
  const db = await requireDb();
  return db
    .selectDistinct({ year: forecastEntries.year, month: forecastEntries.month })
    .from(forecastEntries)
    .orderBy(desc(forecastEntries.year), desc(forecastEntries.month));
}

// ---------- App settings (key-value) ----------
export async function getSetting(key: string) {
  const db = await requireDb();
  const r = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return r[0]?.value;
}

// ---------- Payment behavior (historical days-to-pay stats) ----------
export async function listPaymentBehavior() {
  const db = await requireDb();
  return db.select().from(paymentBehavior);
}

export async function getPaymentBehavior(customerId: number) {
  const db = await requireDb();
  const r = await db.select().from(paymentBehavior).where(eq(paymentBehavior.customerId, customerId)).limit(1);
  return r[0];
}

/** Behavior rows joined with customer group, for group-level aggregation. */
export async function listPaymentBehaviorWithGroup() {
  const db = await requireDb();
  return db
    .select({
      customerId: paymentBehavior.customerId,
      payments: paymentBehavior.payments,
      totalPaid: paymentBehavior.totalPaid,
      avgDaysLate: paymentBehavior.avgDaysLate,
      medianDaysLate: paymentBehavior.medianDaysLate,
      avgDaysFromInvoice: paymentBehavior.avgDaysFromInvoice,
      medianDaysFromInvoice: paymentBehavior.medianDaysFromInvoice,
      customerName: customers.name,
      customerGroup: customers.customerGroup,
    })
    .from(paymentBehavior)
    .innerJoin(customers, eq(paymentBehavior.customerId, customers.id));
}

export async function setSetting(key: string, value: string, updatedBy?: number) {
  const db = await requireDb();
  await db
    .insert(appSettings)
    .values({ key, value, updatedBy })
    .onDuplicateKeyUpdate({ set: { value, updatedBy } });
}

// ---------- Email templates (editable subject/body per template type) ----------
export async function listEmailTemplates() {
  const db = await requireDb();
  return db.select().from(emailTemplates);
}

export async function getEmailTemplate(templateType: (typeof emailTemplateTypes)[number]) {
  const db = await requireDb();
  const rows = await db.select().from(emailTemplates).where(eq(emailTemplates.templateType, templateType)).limit(1);
  return rows[0] ?? null;
}

export async function upsertEmailTemplate(data: {
  templateType: (typeof emailTemplateTypes)[number];
  subject: string;
  body: string;
  updatedBy?: number;
}) {
  const db = await requireDb();
  await db
    .insert(emailTemplates)
    .values(data)
    .onDuplicateKeyUpdate({ set: { subject: data.subject, body: data.body, updatedBy: data.updatedBy } });
}

/** Drop the stored override so the built-in default text applies again. */
export async function deleteEmailTemplate(templateType: (typeof emailTemplateTypes)[number]) {
  const db = await requireDb();
  await db.delete(emailTemplates).where(eq(emailTemplates.templateType, templateType));
}

export async function listPromises(customerId?: number) {
  const db = await requireDb();
  const q = db.select().from(promisesToPay);
  return customerId ? q.where(eq(promisesToPay.customerId, customerId)).orderBy(desc(promisesToPay.promisedDate)) : q.orderBy(desc(promisesToPay.promisedDate));
}

export async function createPromise(data: typeof promisesToPay.$inferInsert) {
  const db = await requireDb();
  const res = await db.insert(promisesToPay).values(data);
  return Number((res as any)[0].insertId);
}

export async function getPromise(id: number) {
  const db = await requireDb();
  const rows = await db.select().from(promisesToPay).where(eq(promisesToPay.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function updatePromise(id: number, data: Partial<typeof promisesToPay.$inferInsert>) {
  const db = await requireDb();
  await db.update(promisesToPay).set(data).where(eq(promisesToPay.id, id));
}

// ---------- Group notes ----------
export async function listGroupNotes(groupName: string) {
  const db = await requireDb();
  return db.select().from(groupNotes).where(eq(groupNotes.groupName, groupName)).orderBy(desc(groupNotes.createdAt));
}
export async function createGroupNote(data: typeof groupNotes.$inferInsert) {
  const db = await requireDb();
  const res = await db.insert(groupNotes).values(data);
  return Number((res as any)[0].insertId);
}
export async function updateGroupNote(id: number, content: string) {
  const db = await requireDb();
  await db.update(groupNotes).set({ content }).where(eq(groupNotes.id, id));
}
export async function deleteGroupNote(id: number) {
  const db = await requireDb();
  await db.delete(groupNotes).where(eq(groupNotes.id, id));
}

// ---------- Group collection profile (call preferences & particularities) ----------
export async function getGroupCollectionProfile(groupName: string) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(groupCollectionProfile)
    .where(eq(groupCollectionProfile.groupName, groupName))
    .limit(1);
  return rows[0] ?? null;
}
export async function upsertGroupCollectionProfile(
  groupName: string,
  notes: string,
  updatedBy: number | null,
) {
  const db = await requireDb();
  await db
    .insert(groupCollectionProfile)
    .values({ groupName, notes, updatedBy, updatedAt: Date.now() })
    .onDuplicateKeyUpdate({ set: { notes, updatedBy, updatedAt: Date.now() } });
}

// ---------- Group status (unified workflow: Normal → Problematic → Critical → Legal / Resolved) ----------
export async function listGroupWatchStatuses() {
  const db = await requireDb();
  return db.select().from(groupWatchStatus);
}
export async function getGroupWatchStatus(groupName: string) {
  const db = await requireDb();
  const rows = await db.select().from(groupWatchStatus).where(eq(groupWatchStatus.groupName, groupName)).limit(1);
  return rows[0] ?? null;
}
export async function setGroupWatchStatus(
  groupName: string,
  status: "Auto" | "Problematic" | "Normal" | "Critical" | "On Hold" | "Legal",
  updatedBy: number | null,
) {
  const db = await requireDb();
  // Track when the group became Problematic (display only); other statuses clear it.
  const problematicSince = status === "Problematic" ? Date.now() : null;
  await db
    .insert(groupWatchStatus)
    .values({ groupName, status, problematicSince, updatedBy, updatedAt: Date.now() })
    .onDuplicateKeyUpdate({ set: { status, problematicSince, updatedBy, updatedAt: Date.now() } });
}
/**
 * Ensure the escalation clock is running for a group flagged Problematic by the
 * automatic forecast rule (row may not exist yet). Never overwrites an existing
 * manual status other than "Auto"; only stamps problematicSince when missing.
 */
export async function ensureProblematicSince(groupName: string, now = Date.now()) {
  const db = await requireDb();
  const existing = await getGroupWatchStatus(groupName);
  if (!existing) {
    await db.insert(groupWatchStatus).values({ groupName, status: "Auto", problematicSince: now, updatedBy: null, updatedAt: now });
    return now;
  }
  if (existing.problematicSince == null) {
    await db.update(groupWatchStatus).set({ problematicSince: now, updatedAt: now }).where(eq(groupWatchStatus.groupName, groupName));
    return now;
  }
  return existing.problematicSince;
}
/** Clear the escalation clock when a group is no longer problematic (rule stopped firing under Auto). */
export async function clearProblematicSince(groupName: string) {
  const db = await requireDb();
  await db.update(groupWatchStatus).set({ problematicSince: null, updatedAt: Date.now() }).where(eq(groupWatchStatus.groupName, groupName));
}

// ---------- Audit & sync logs ----------
export async function addAudit(entry: typeof auditLogs.$inferInsert) {
  const db = await requireDb();
  await db.insert(auditLogs).values(entry);
}

export async function listAudit(limit = 200) {
  const db = await requireDb();
  return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
}

export async function addSyncLog(entry: typeof syncLogs.$inferInsert) {
  const db = await requireDb();
  await db.insert(syncLogs).values(entry);
}

export async function listSyncLogs(limit = 50) {
  const db = await requireDb();
  return db.select().from(syncLogs).orderBy(desc(syncLogs.createdAt)).limit(limit);
}

// ---------- Email history ----------
export async function addEmailHistory(entry: InsertEmailHistory) {
  const db = await requireDb();
  const result = await db.insert(emailHistory).values(entry);
  return Number((result as any)[0].insertId);
}

export async function listEmailHistory(customerId: number, limit = 50) {
  const db = await requireDb();
  return db
    .select()
    .from(emailHistory)
    .where(eq(emailHistory.customerId, customerId))
    .orderBy(desc(emailHistory.createdAt))
    .limit(limit);
}

export async function getEmailHistory(id: number) {
  const db = await requireDb();
  return db.select().from(emailHistory).where(eq(emailHistory.id, id)).limit(1);
}

// ---------- Activity Log ----------
export async function addActivityLog(entry: InsertActivityLog) {
  const db = await requireDb();
  const res = await db.insert(activityLog).values(entry);
  return Number((res as any)[0].insertId);
}

export async function listActivityLog(groupName: string, limit = 100) {
  const db = await requireDb();
  return db
    .select()
    .from(activityLog)
    .where(eq(activityLog.groupName, groupName))
    .orderBy(desc(activityLog.createdAt))
    .limit(limit);
}

export async function getActivityLog(id: number) {
  const db = await requireDb();
  return db.select().from(activityLog).where(eq(activityLog.id, id)).limit(1);
}

// ---------- Group Confirmation Status ----------
export async function getGroupConfirmationStatus(groupName: string) {
  const db = await requireDb();
  const result = await db
    .select()
    .from(groupConfirmationStatus)
    .where(eq(groupConfirmationStatus.groupName, groupName))
    .limit(1);
  return result[0] || null;
}

export async function upsertGroupConfirmationStatus(
  groupName: string,
  updates: Omit<InsertGroupConfirmationStatus, "groupName">
) {
  const db = await requireDb();
  const existing = await getGroupConfirmationStatus(groupName);
  
  if (existing) {
    await db
      .update(groupConfirmationStatus)
      .set(updates)
      .where(eq(groupConfirmationStatus.groupName, groupName));
  } else {
    await db.insert(groupConfirmationStatus).values({
      groupName,
      ...updates,
    });
  }
}

// ---------- Payment Contacts ----------
export async function addPaymentContact(contact: InsertPaymentContact) {
  const db = await requireDb();
  const result = await db.insert(paymentContacts).values(contact);
  return result[0].insertId;
}

/**
 * Insert many payment contacts in chunks. Used by the ERP contact import, where
 * inserting one row at a time would mean thousands of round trips.
 */
export async function addPaymentContactsBulk(contacts: InsertPaymentContact[], chunkSize = 200) {
  if (contacts.length === 0) return 0;
  const db = await requireDb();
  let inserted = 0;
  for (let i = 0; i < contacts.length; i += chunkSize) {
    const chunk = contacts.slice(i, i + chunkSize);
    await db.insert(paymentContacts).values(chunk);
    inserted += chunk.length;
  }
  return inserted;
}

export async function listPaymentContacts(customerId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(paymentContacts)
    .where(eq(paymentContacts.customerId, customerId))
    .orderBy(desc(paymentContacts.createdAt));
}
export async function listAllPaymentContacts() {
  const db = await requireDb();
  return db.select().from(paymentContacts).orderBy(desc(paymentContacts.createdAt));
}

export async function getPaymentContact(id: number) {
  const db = await requireDb();
  return db.select().from(paymentContacts).where(eq(paymentContacts.id, id)).limit(1);
}

export async function updatePaymentContact(id: number, updates: Partial<InsertPaymentContact>) {
  const db = await requireDb();
  return db.update(paymentContacts).set(updates).where(eq(paymentContacts.id, id));
}

export async function deletePaymentContact(id: number) {
  const db = await requireDb();
  return db.delete(paymentContacts).where(eq(paymentContacts.id, id));
}

// ---------- Aggregations ----------
export async function sumReceiptsInRange(start: number, end: number) {
  const db = await requireDb();
  const r = await db
    .select({ total: sql<string>`COALESCE(SUM(${receipts.amount}), 0)` })
    .from(receipts)
    .where(and(gte(receipts.receiptDate, start), lt(receipts.receiptDate, end)));
  return Number(r[0]?.total ?? 0);
}

export async function sumInvoicedInRange(start: number, end: number) {
  const db = await requireDb();
  const r = await db
    .select({ total: sql<string>`COALESCE(SUM(${invoices.amount}), 0)` })
    .from(invoices)
    .where(and(gte(invoices.issueDate, start), lt(invoices.issueDate, end)));
  return Number(r[0]?.total ?? 0);
}

/** Global search across customers, invoices, group notes, and tasks (case-insensitive LIKE). */
export async function globalSearch(query: string, limitPerType = 8) {
  const db = await requireDb();
  const q = `%${query}%`;
  const [custRows, invRows, noteRows, taskRows] = await Promise.all([
    db
      .select({ id: customers.id, name: customers.name, code: customers.code, customerGroup: customers.customerGroup })
      .from(customers)
      .where(or(like(customers.name, q), like(customers.code, q), like(customers.customerGroup, q), like(customers.vatNumber, q)))
      .limit(limitPerType * 3),
    db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        customerId: invoices.customerId,
        amount: invoices.amount,
        status: invoices.status,
        dueDate: invoices.dueDate,
        vesselName: vessels.name,
      })
      .from(invoices)
      .leftJoin(vessels, eq(invoices.vesselId, vessels.id))
      .where(or(like(invoices.invoiceNumber, q), like(vessels.name, q)))
      .limit(limitPerType),
    db
      .select({ id: groupNotes.id, groupName: groupNotes.groupName, content: groupNotes.content, createdAt: groupNotes.createdAt })
      .from(groupNotes)
      .where(or(like(groupNotes.content, q), like(groupNotes.groupName, q)))
      .orderBy(desc(groupNotes.createdAt))
      .limit(limitPerType),
    db
      .select({ id: tasks.id, title: tasks.title, status: tasks.status, dueDate: tasks.dueDate, customerId: tasks.customerId })
      .from(tasks)
      .where(or(like(tasks.title, q), like(tasks.description, q)))
      .orderBy(desc(tasks.dueDate))
      .limit(limitPerType),
  ]);
  // Wire transfers & payments (allocations): match by transfer reference, customer name,
  // or the invoice number an allocation settled — so searching "INV-000013" also surfaces
  // the payment/transfer that settled that invoice.
  const transferRows = await db
    .select({
      id: wireTransfers.id,
      customerId: wireTransfers.customerId,
      amount: wireTransfers.amount,
      currency: wireTransfers.currency,
      transferDate: wireTransfers.transferDate,
      status: wireTransfers.status,
      branch: wireTransfers.branch,
      referenceNumber: wireTransfers.referenceNumber,
      isInternal: wireTransfers.isInternal,
      customerName: customers.name,
    })
    .from(wireTransfers)
    .innerJoin(customers, eq(wireTransfers.customerId, customers.id))
    .where(or(like(wireTransfers.referenceNumber, q), like(customers.name, q)))
    .orderBy(desc(wireTransfers.transferDate))
    .limit(limitPerType);
  const allocationRows = await db
    .select({
      id: wireTransferAllocations.id,
      wireTransferId: wireTransferAllocations.wireTransferId,
      amount: wireTransferAllocations.amount,
      invoiceNumber: invoices.invoiceNumber,
      invoiceId: invoices.id,
      transferAmount: wireTransfers.amount,
      transferCurrency: wireTransfers.currency,
      transferDate: wireTransfers.transferDate,
      transferReference: wireTransfers.referenceNumber,
      payerName: customers.name,
      creditedName: sql<string>`(SELECT c2.name FROM customers c2 WHERE c2.id = ${invoices.customerId})`,
    })
    .from(wireTransferAllocations)
    .innerJoin(invoices, eq(wireTransferAllocations.invoiceId, invoices.id))
    .innerJoin(wireTransfers, eq(wireTransferAllocations.wireTransferId, wireTransfers.id))
    .innerJoin(customers, eq(wireTransfers.customerId, customers.id))
    .where(like(invoices.invoiceNumber, q))
    .orderBy(desc(wireTransferAllocations.createdAt))
    .limit(limitPerType);
  return { customers: custRows, invoices: invRows, notes: noteRows, tasks: taskRows, transfers: transferRows, allocations: allocationRows };
}

export async function listGroupConfirmationStatuses() {
  const db = await requireDb();
  return db.select().from(groupConfirmationStatus);
}

// ---------------------------------------------------------------------------
// Vessels (ships) — registry usable on all invoices
// ---------------------------------------------------------------------------

export async function listVessels() {
  const db = await requireDb();
  return db.select().from(vessels).orderBy(vessels.name);
}

export async function createVessel(data: InsertVessel) {
  const db = await requireDb();
  const [res] = await db.insert(vessels).values(data);
  return res.insertId;
}

export async function updateVessel(id: number, data: Partial<InsertVessel>) {
  const db = await requireDb();
  await db.update(vessels).set(data).where(eq(vessels.id, id));
}

export async function deleteVessel(id: number) {
  const db = await requireDb();
  // Detach from invoices first, then delete the vessel.
  await db.update(invoices).set({ vesselId: null }).where(eq(invoices.vesselId, id));
  await db.delete(vessels).where(eq(vessels.id, id));
  invalidateCache("invoices:");
}

export async function getVesselById(id: number) {
  const db = await requireDb();
  const rows = await db.select().from(vessels).where(eq(vessels.id, id)).limit(1);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Team members — collaborators who manage customers and take on tasks
// ---------------------------------------------------------------------------

export async function listTeamMembers(includeInactive = false) {
  const db = await requireDb();
  if (includeInactive) return db.select().from(teamMembers).orderBy(teamMembers.name);
  return db.select().from(teamMembers).where(eq(teamMembers.active, true)).orderBy(teamMembers.name);
}

export async function createTeamMember(data: InsertTeamMember) {
  const db = await requireDb();
  const [res] = await db.insert(teamMembers).values(data);
  return res.insertId;
}

export async function updateTeamMember(id: number, data: Partial<InsertTeamMember>) {
  const db = await requireDb();
  await db.update(teamMembers).set(data).where(eq(teamMembers.id, id));
}

export async function getTeamMemberById(id: number) {
  const db = await requireDb();
  const rows = await db.select().from(teamMembers).where(eq(teamMembers.id, id)).limit(1);
  return rows[0] ?? null;
}
/** Team member linked to a signed-in auth user (teamMembers.userId), if any. */
export async function getTeamMemberByUserId(userId: number) {
  const db = await requireDb();
  const rows = await db.select().from(teamMembers).where(eq(teamMembers.userId, userId)).limit(1);
  return rows[0] ?? null;
}
export async function deleteTeamMember(id: number) {
  const db = await requireDb();
  // Detach from customers and tasks first, then delete.
  await db.update(customers).set({ accountManagerId: null }).where(eq(customers.accountManagerId, id));
  await db.update(customers).set({ collectorId: null }).where(eq(customers.collectorId, id));
  await db.update(tasks).set({ assigneeId: null }).where(eq(tasks.assigneeId, id));
  await db.delete(teamMembers).where(eq(teamMembers.id, id));
  invalidateCache("customers:");
}

/** Assign an account manager to every company of a customer group. */
export async function setGroupAccountManager(groupName: string, managerId: number | null) {
  const db = await requireDb();
  const trimmed = groupName.trim();
  await db
    .update(customers)
    .set({ accountManagerId: managerId })
    .where(or(eq(customers.customerGroup, trimmed), eq(customers.name, trimmed)));
  invalidateCache("customers:");
}

/** Assign a collector (credit controller) to every company of a customer group. */
export async function setGroupCollector(groupName: string, collectorId: number | null) {
  const db = await requireDb();
  const trimmed = groupName.trim();
  await db
    .update(customers)
    .set({ collectorId })
    .where(or(eq(customers.customerGroup, trimmed), eq(customers.name, trimmed)));
  invalidateCache("customers:");
}

/** Test/maintenance helper: overwrite a confirmation row's updatedAt (bypasses onUpdateNow via raw SQL). */
export async function setGroupConfirmationUpdatedAt(groupName: string, updatedAt: Date) {
  const db = await requireDb();
  const ts = updatedAt.toISOString().slice(0, 19).replace("T", " ");
  await db.execute(sql`UPDATE group_confirmation_status SET updatedAt = ${ts} WHERE groupName = ${groupName}`);
}

// ---------- Payment Bank Details ----------
export async function getBankDetailsByCustomerId(customerId: number) {
  const db = await requireDb();
  const r = await db.select().from(paymentBankDetails).where(eq(paymentBankDetails.customerId, customerId)).limit(1);
  return r[0] || null;
}

export async function createBankDetails(data: InsertPaymentBankDetails) {
  const db = await requireDb();
  const res = await db.insert(paymentBankDetails).values(data);
  return Number((res as any)[0].insertId);
}

export async function updateBankDetails(customerId: number, data: Partial<InsertPaymentBankDetails>) {
  const db = await requireDb();
  await db.update(paymentBankDetails).set(data).where(eq(paymentBankDetails.customerId, customerId));
}

export async function deleteBankDetails(customerId: number) {
  const db = await requireDb();
  await db.delete(paymentBankDetails).where(eq(paymentBankDetails.customerId, customerId));
}


// ---------- Wire Transfers ----------
import { wireTransfers, InsertWireTransfer, WireTransfer } from "../drizzle/schema";

export async function createWireTransfer(data: InsertWireTransfer) {
  const db = await requireDb();
  const res = await db.insert(wireTransfers).values(data);
  return Number((res as any)[0].insertId);
}

export async function getWireTransfer(id: number) {
  const db = await requireDb();
  const r = await db.select().from(wireTransfers).where(eq(wireTransfers.id, id)).limit(1);
  return r[0] || null;
}

export async function listWireTransfersByCustomerId(customerId: number) {
  const db = await requireDb();
  return db.select().from(wireTransfers).where(eq(wireTransfers.customerId, customerId)).orderBy(desc(wireTransfers.transferDate));
}

export async function listAllWireTransfers() {
  const db = await requireDb();
  return db.select().from(wireTransfers).orderBy(desc(wireTransfers.transferDate));
}

export async function listWireTransfersByStatus(status: "Pending" | "Received") {
  const db = await requireDb();
  return db.select().from(wireTransfers).where(eq(wireTransfers.status, status)).orderBy(desc(wireTransfers.transferDate));
}

/**
 * Received wire transfers whose effective date (receivedDate, falling back to
 * transferDate) is within [start, end). Used to include received transfers in
 * "collected this month" figures. EUR-equivalent handling is done by callers.
 */
export async function listReceivedWireTransfersInRange(start: number, end: number) {
  const db = await requireDb();
  const rows = await db.select().from(wireTransfers).where(eq(wireTransfers.status, "Received"));
  return rows.filter(w => {
    // Internal inter-office transfers are bookkeeping mirrors of an already-counted
    // customer transfer — excluding them prevents double counting in collected figures.
    if ((w as any).isInternal) return false;
    const ts = w.receivedDate ?? w.transferDate;
    return ts >= start && ts < end;
  });
}

export async function updateWireTransfer(id: number, data: Partial<InsertWireTransfer>) {
  const db = await requireDb();
  await db.update(wireTransfers).set(data).where(eq(wireTransfers.id, id));
}

export async function deleteWireTransfer(id: number) {
  const db = await requireDb();
  await db.delete(wireTransfers).where(eq(wireTransfers.id, id));
}

// ---------- Wire transfer allocations (συμψηφισμός) ----------
import { wireTransferAllocations, InsertWireTransferAllocation } from "../drizzle/schema";

export async function createWireTransferAllocation(data: InsertWireTransferAllocation) {
  const db = await requireDb();
  const res = await db.insert(wireTransferAllocations).values(data);
  return Number((res as any)[0].insertId);
}

/** Delete internal inter-office transfers that were auto-created for a given allocation. */
export async function deleteInternalTransfersByAllocation(allocationId: number) {
  const db = await requireDb();
  await db
    .delete(wireTransfers)
    .where(and(eq(wireTransfers.isInternal, true), eq(wireTransfers.sourceAllocationId, allocationId)));
}

/** Delete internal inter-office transfers derived from a given source wire transfer. */
export async function deleteInternalTransfersBySource(sourceWireTransferId: number) {
  const db = await requireDb();
  await db
    .delete(wireTransfers)
    .where(and(eq(wireTransfers.isInternal, true), eq(wireTransfers.sourceWireTransferId, sourceWireTransferId)));
}

export async function listAllocationsByWireTransfer(wireTransferId: number) {
  const db = await requireDb();
  return db
    .select({
      id: wireTransferAllocations.id,
      wireTransferId: wireTransferAllocations.wireTransferId,
      invoiceId: wireTransferAllocations.invoiceId,
      amount: wireTransferAllocations.amount,
      createdAt: wireTransferAllocations.createdAt,
      invoiceNumber: invoices.invoiceNumber,
      invoiceCompany: invoices.company,
      invoiceCurrency: invoices.currency,
      invoiceAmount: invoices.amount,
      invoiceStatus: invoices.status,
      invoiceCustomerId: invoices.customerId,
    })
    .from(wireTransferAllocations)
    .leftJoin(invoices, eq(wireTransferAllocations.invoiceId, invoices.id))
    .where(eq(wireTransferAllocations.wireTransferId, wireTransferId))
    .orderBy(desc(wireTransferAllocations.createdAt));
}

export async function getWireTransferAllocation(id: number) {
  const db = await requireDb();
  const r = await db.select().from(wireTransferAllocations).where(eq(wireTransferAllocations.id, id)).limit(1);
  return r[0] || null;
}

/** All wire-transfer allocations that settled a given invoice (for cancelling the payment). */
export async function listWtAllocationsByInvoice(invoiceId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(wireTransferAllocations)
    .where(eq(wireTransferAllocations.invoiceId, invoiceId))
    .orderBy(desc(wireTransferAllocations.createdAt));
}

export async function deleteWireTransferAllocation(id: number) {
  const db = await requireDb();
  await db.delete(wireTransferAllocations).where(eq(wireTransferAllocations.id, id));
}

/** Sum of allocated amounts per wire transfer id (for "unallocated" computations). */
export async function sumAllocationsByWireTransferIds(ids: number[]) {
  if (ids.length === 0) return new Map<number, number>();
  const db = await requireDb();
  const rows = await db
    .select({ wireTransferId: wireTransferAllocations.wireTransferId, amount: wireTransferAllocations.amount })
    .from(wireTransferAllocations)
    .where(inArray(wireTransferAllocations.wireTransferId, ids));
  const m = new Map<number, number>();
  for (const r of rows) m.set(r.wireTransferId, (m.get(r.wireTransferId) ?? 0) + Number(r.amount));
  return m;
}

/** Allocation details (invoice + credited company) for a set of wire transfers — for breakdown rows. */
export async function listAllocationsByWireTransferIds(ids: number[]) {
  if (ids.length === 0) return [];
  const db = await requireDb();
  return db
    .select({
      id: wireTransferAllocations.id,
      wireTransferId: wireTransferAllocations.wireTransferId,
      invoiceId: wireTransferAllocations.invoiceId,
      amount: wireTransferAllocations.amount,
      createdAt: wireTransferAllocations.createdAt,
      invoiceNumber: invoices.invoiceNumber,
      invoiceCompany: invoices.company,
      invoiceCurrency: invoices.currency,
      invoiceStatus: invoices.status,
      invoiceCustomerId: invoices.customerId,
    })
    .from(wireTransferAllocations)
    .leftJoin(invoices, eq(wireTransferAllocations.invoiceId, invoices.id))
    .where(inArray(wireTransferAllocations.wireTransferId, ids))
    .orderBy(desc(wireTransferAllocations.createdAt));
}

/** Incoming allocations for a customer: amounts credited to THEIR invoices from any wire transfer. */
export async function listIncomingAllocationsByCustomer(customerId: number) {
  const db = await requireDb();
  return db
    .select({
      id: wireTransferAllocations.id,
      wireTransferId: wireTransferAllocations.wireTransferId,
      invoiceId: wireTransferAllocations.invoiceId,
      amount: wireTransferAllocations.amount,
      createdAt: wireTransferAllocations.createdAt,
      invoiceNumber: invoices.invoiceNumber,
      invoiceCompany: invoices.company,
      invoiceCurrency: invoices.currency,
      invoiceStatus: invoices.status,
      sourceCustomerId: wireTransfers.customerId,
      sourceAmount: wireTransfers.amount,
      sourceCurrency: wireTransfers.currency,
      sourceTransferDate: wireTransfers.transferDate,
      sourceReference: wireTransfers.referenceNumber,
      sourceBranch: wireTransfers.branch,
    })
    .from(wireTransferAllocations)
    .innerJoin(invoices, eq(wireTransferAllocations.invoiceId, invoices.id))
    .innerJoin(wireTransfers, eq(wireTransferAllocations.wireTransferId, wireTransfers.id))
    .where(eq(invoices.customerId, customerId))
    .orderBy(desc(wireTransferAllocations.createdAt));
}

/* ------------------------------------------------------------------ *
 * Credit notes (πιστωτικά) — open documents not yet matched to invoices
 * ------------------------------------------------------------------ */

/** All credit notes, newest document first. */
export async function listCreditNotes() {
  const db = await requireDb();
  return db.select().from(creditNotes).orderBy(desc(creditNotes.docDate));
}

/** Credit notes of one customer, newest document first. */
export async function listCreditNotesByCustomerId(customerId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(creditNotes)
    .where(eq(creditNotes.customerId, customerId))
    .orderBy(desc(creditNotes.docDate));
}

/** Credit notes of several customers (a group), newest document first. */
export async function listCreditNotesByCustomerIds(customerIds: number[]) {
  if (customerIds.length === 0) return [];
  const db = await requireDb();
  return db
    .select()
    .from(creditNotes)
    .where(inArray(creditNotes.customerId, customerIds))
    .orderBy(desc(creditNotes.docDate));
}

export async function getCreditNote(id: number) {
  const db = await requireDb();
  const rows = await db.select().from(creditNotes).where(eq(creditNotes.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createCreditNote(data: InsertCreditNote) {
  const db = await requireDb();
  const res = await db.insert(creditNotes).values(data);
  return Number((res as any)[0].insertId);
}

export async function updateCreditNote(id: number, data: Partial<InsertCreditNote>) {
  const db = await requireDb();
  await db.update(creditNotes).set(data).where(eq(creditNotes.id, id));
}

export async function deleteCreditNote(id: number) {
  const db = await requireDb();
  await db.delete(creditNotes).where(eq(creditNotes.id, id));
}

/** Sum of manual allocations per credit note id (for "still open" computations). */
export async function sumAllocationsByCreditNoteIds(ids: number[]) {
  const map = new Map<number, number>();
  if (ids.length === 0) return map;
  const db = await requireDb();
  const rows = await db
    .select({
      creditNoteId: creditNoteAllocations.creditNoteId,
      total: sql<string>`SUM(${creditNoteAllocations.amount})`,
    })
    .from(creditNoteAllocations)
    .where(inArray(creditNoteAllocations.creditNoteId, ids))
    .groupBy(creditNoteAllocations.creditNoteId);
  for (const r of rows) map.set(r.creditNoteId, Number(r.total ?? 0));
  return map;
}

export async function listAllocationsByCreditNote(creditNoteId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(creditNoteAllocations)
    .where(eq(creditNoteAllocations.creditNoteId, creditNoteId));
}

/**
 * Allocations of a credit note joined with the invoice they were matched to, so
 * the matching dialog can show what has already been settled without a second
 * round of queries.
 */
export async function listAllocationsByCreditNoteJoined(creditNoteId: number) {
  const db = await requireDb();
  return db
    .select({
      id: creditNoteAllocations.id,
      creditNoteId: creditNoteAllocations.creditNoteId,
      invoiceId: creditNoteAllocations.invoiceId,
      amount: creditNoteAllocations.amount,
      createdAt: creditNoteAllocations.createdAt,
      invoiceNumber: invoices.invoiceNumber,
      invoiceCompany: invoices.company,
      invoiceCurrency: invoices.currency,
      invoiceStatus: invoices.status,
      invoiceCustomerId: invoices.customerId,
    })
    .from(creditNoteAllocations)
    .leftJoin(invoices, eq(creditNoteAllocations.invoiceId, invoices.id))
    .where(eq(creditNoteAllocations.creditNoteId, creditNoteId));
}

/** One allocation row by id (used when removing an allocation). */
export async function getCreditNoteAllocation(id: number) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(creditNoteAllocations)
    .where(eq(creditNoteAllocations.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function createCreditNoteAllocation(data: InsertCreditNoteAllocation) {
  const db = await requireDb();
  const res = await db.insert(creditNoteAllocations).values(data);
  return Number((res as any)[0].insertId);
}

export async function deleteCreditNoteAllocation(id: number) {
  const db = await requireDb();
  await db.delete(creditNoteAllocations).where(eq(creditNoteAllocations.id, id));
}
