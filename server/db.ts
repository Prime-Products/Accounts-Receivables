import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  appSettings,
  auditLogs,
  collectionPlans,
  contractInstallments,
  contracts,
  customers,
  forecastEntries,
  InsertContract,
  InsertCustomer,
  InsertForecastEntry,
  InsertInvoice,
  InsertOnHoldProposal,
  InsertReceipt,
  InsertTask,
  InsertUser,
  invoices,
  onHoldProposals,
  promisesToPay,
  receiptAllocations,
  receipts,
  syncLogs,
  tasks,
  userProfiles,
  users,
} from "../drizzle/schema";
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
export async function listCustomers() {
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
  return Number((res as any)[0].insertId);
}

export async function updateCustomer(id: number, data: Partial<InsertCustomer>) {
  const db = await requireDb();
  await db.update(customers).set(data).where(eq(customers.id, id));
}

// ---------- Invoices ----------
export async function listInvoices(filter?: { customerId?: number; statuses?: string[] }) {
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
  return Number((res as any)[0].insertId);
}

export async function updateInvoice(id: number, data: Partial<InsertInvoice>) {
  const db = await requireDb();
  await db.update(invoices).set(data).where(eq(invoices.id, id));
}

// ---------- Receipts & allocations ----------
export async function listReceipts(customerId?: number) {
  const db = await requireDb();
  const q = db.select().from(receipts);
  return customerId ? q.where(eq(receipts.customerId, customerId)).orderBy(desc(receipts.receiptDate)) : q.orderBy(desc(receipts.receiptDate));
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

// ---------- On-Hold proposals ----------
export async function listOnHoldProposals() {
  const db = await requireDb();
  return db.select().from(onHoldProposals).orderBy(desc(onHoldProposals.createdAt));
}

export async function getOnHoldProposal(id: number) {
  const db = await requireDb();
  const r = await db.select().from(onHoldProposals).where(eq(onHoldProposals.id, id)).limit(1);
  return r[0];
}

export async function createOnHoldProposal(data: InsertOnHoldProposal) {
  const db = await requireDb();
  const res = await db.insert(onHoldProposals).values(data);
  return Number((res as any)[0].insertId);
}

export async function updateOnHoldProposal(id: number, data: Partial<InsertOnHoldProposal>) {
  const db = await requireDb();
  await db.update(onHoldProposals).set(data).where(eq(onHoldProposals.id, id));
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
    .where(and(eq(forecastEntries.year, data.year), eq(forecastEntries.month, data.month), eq(forecastEntries.customerId, data.customerId)))
    .limit(1);
  if (existing.length > 0) {
    // Preserve user adjustments on regeneration: only refresh due/AI fields.
    const keep = existing[0];
    await db
      .update(forecastEntries)
      .set({
        dueAmount: data.dueAmount,
        overdueAmount: data.overdueAmount,
        aiSuggestedAmount: data.aiSuggestedAmount,
        aiReasoning: data.aiReasoning,
        ...(keep.userAdjusted ? {} : { expectedAmount: data.expectedAmount }),
      })
      .where(eq(forecastEntries.id, keep.id));
    return keep.id;
  }
  const res = await db.insert(forecastEntries).values(data);
  return Number((res as any)[0].insertId);
}

export async function updateForecastEntry(id: number, data: Partial<InsertForecastEntry>) {
  const db = await requireDb();
  await db.update(forecastEntries).set(data).where(eq(forecastEntries.id, id));
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

export async function setSetting(key: string, value: string, updatedBy?: number) {
  const db = await requireDb();
  await db
    .insert(appSettings)
    .values({ key, value, updatedBy })
    .onDuplicateKeyUpdate({ set: { value, updatedBy } });
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

export async function updatePromise(id: number, data: Partial<typeof promisesToPay.$inferInsert>) {
  const db = await requireDb();
  await db.update(promisesToPay).set(data).where(eq(promisesToPay.id, id));
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
