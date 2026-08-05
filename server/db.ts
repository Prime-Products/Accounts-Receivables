import { and, desc, eq, gte, inArray, isNotNull, like, lt, notInArray, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { monthRange } from "./lib/arLogic";
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
  InsertInvoiceVesselAllocation,
  InsertPaymentContact,
  InsertReceipt,
  InsertTask,
  InsertUser,
  invoices,
  invoiceVesselAllocations,
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
  customerWatchers,
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
import {
  opsContracts,
  opsQuotations,
  opsAssets,
  opsCertificates,
  opsAssetCatalog,
  opsConsumableCatalog,
} from "../drizzle/schema";
import { noteMentions, InsertNoteMention } from "../drizzle/schema";
import { contactGifts, giftImportReview, type GiftTier } from "../drizzle/schema";
import { queryTokens } from "../shared/textMatch";
import {
  customFieldDefs,
  customFieldValues,
  savedViews,
  listLayouts,
  type AddressBookEntity,
  type InsertCustomFieldDef,
  type InsertSavedView,
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

export async function upsertSoftOneCustomers(records: InsertCustomer[]) {
  const database = await requireDb();
  const batchSize = 250;

  await database.transaction(async tx => {
    for (let index = 0; index < records.length; index += batchSize) {
      const batch = records.slice(index, index + batchSize);
      await tx
        .insert(customers)
        .values(batch)
        .onDuplicateKeyUpdate({
          set: {
            name: sql`VALUES(${customers.name})`,
            customerGroup: sql`VALUES(${customers.customerGroup})`,
            masterSoftoneId: sql`VALUES(${customers.masterSoftoneId})`,
            turnoverYtd: sql`VALUES(${customers.turnoverYtd})`,
            turnoverLastYear: sql`VALUES(${customers.turnoverLastYear})`,
            turnoverTwoYearsAgo: sql`VALUES(${customers.turnoverTwoYearsAgo})`,
            balance: sql`VALUES(${customers.balance})`,
            uncovered: sql`VALUES(${customers.uncovered})`,
            unpaid: sql`VALUES(${customers.unpaid})`,
            overdue: sql`VALUES(${customers.overdue})`,
            overdueEndOfMonth: sql`VALUES(${customers.overdueEndOfMonth})`,
            averageOverdueDays: sql`VALUES(${customers.averageOverdueDays})`,
            openOrders: sql`VALUES(${customers.openOrders})`,
            ordersAmount: sql`VALUES(${customers.ordersAmount})`,
            collections: sql`VALUES(${customers.collections})`,
            softoneId: sql`VALUES(${customers.softoneId})`,
            softoneSyncedAt: sql`VALUES(${customers.softoneSyncedAt})`,
          },
        });
    }
  });
}

export async function insertMissingSoftOneCustomers(records: InsertCustomer[]) {
  if (records.length === 0) return;
  const database = await requireDb();
  const batchSize = 250;
  await database.transaction(async tx => {
    for (let index = 0; index < records.length; index += batchSize) {
      await tx
        .insert(customers)
        .values(records.slice(index, index + batchSize))
        .onDuplicateKeyUpdate({
          // Preserve every field of an existing customer. This statement only
          // supplies invoice-only TRDR rows that CustomerGroupFinData omitted.
          set: { code: sql`${customers.code}` },
        });
    }
  });
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

export type SoftOneInvoiceUpsert = Omit<InsertInvoice, "customerId"> & {
  customerSoftoneId: string;
  vesselId?: number | null;
  vesselAllocations?: Array<{
    softoneInstallmentId: string;
    contractSoftoneId: string;
    vesselId: number;
    amount: string;
  }>;
};

export async function upsertSoftOneInvoices(
  records: SoftOneInvoiceUpsert[],
  options: { reconcileOpenSnapshot?: boolean } = {},
) {
  const database = await requireDb();
  const syncVesselAllocations = records.some(record => record.vesselAllocations !== undefined);
  const customerRows = await database
    .select({ id: customers.id, softoneId: customers.softoneId })
    .from(customers);
  const customerIdBySoftOneId = new Map(
    customerRows
      .filter(row => row.softoneId)
      .map(row => [row.softoneId!, row.id]),
  );
  const missingCustomers = Array.from(
    new Set(
      records
        .filter(record => !customerIdBySoftOneId.has(record.customerSoftoneId))
        .map(record => record.customerSoftoneId),
    ),
  );
  if (missingCustomers.length > 0) {
    throw new Error(
      `SoftOne invoices reference ${missingCustomers.length} customers that are not synchronized.`,
    );
  }

  const vesselRows = await database.select({ id: vessels.id }).from(vessels);
  const vesselIds = new Set(vesselRows.map(row => row.id));
  const missingVessels = Array.from(
    new Set(
      records.flatMap(record => record.vesselAllocations ?? [])
        .map(allocation => allocation.vesselId)
        .filter(vesselId => !vesselIds.has(vesselId)),
    ),
  );
  if (missingVessels.length > 0) {
    throw new Error(
      `SoftOne installment invoices reference ${missingVessels.length} vessels that are not synchronized.`,
    );
  }

  const values = records.map(({ customerSoftoneId, vesselAllocations: _allocations, ...record }) => ({
    ...record,
    customerId: customerIdBySoftOneId.get(customerSoftoneId)!,
  }));
  const batchSize = 250;
  await database.transaction(async tx => {
    for (let index = 0; index < values.length; index += batchSize) {
      await tx
        .insert(invoices)
        .values(values.slice(index, index + batchSize))
        .onDuplicateKeyUpdate({
          set: {
            customerId: sql`VALUES(${invoices.customerId})`,
            invoiceNumber: sql`VALUES(${invoices.invoiceNumber})`,
            company: sql`VALUES(${invoices.company})`,
            currency: sql`VALUES(${invoices.currency})`,
            amountEur: sql`VALUES(${invoices.amountEur})`,
            issueDate: sql`VALUES(${invoices.issueDate})`,
            dueDate: sql`VALUES(${invoices.dueDate})`,
            amount: sql`VALUES(${invoices.amount})`,
            paidAmount: sql`VALUES(${invoices.paidAmount})`,
            status: sql`VALUES(${invoices.status})`,
            ...(syncVesselAllocations
              ? { isContractInstallment: sql`VALUES(${invoices.isContractInstallment})` }
              : {}),
            vesselId: sql`VALUES(${invoices.vesselId})`,
            softoneId: sql`VALUES(${invoices.softoneId})`,
          },
        });
    }
    if (options.reconcileOpenSnapshot) {
      const snapshotIds = records
        .map(record => record.softoneId)
        .filter((value): value is string => Boolean(value));
      if (snapshotIds.length === 0) {
        throw new Error("Cannot reconcile an empty SoftOne open-invoice snapshot.");
      }
      await tx
        .update(invoices)
        .set({
          paidAmount: sql`${invoices.amount}`,
          status: "Paid",
        })
        .where(and(
          isNotNull(invoices.softoneId),
          notInArray(invoices.softoneId, snapshotIds),
          notInArray(invoices.status, ["Paid"]),
        ));
    }
    const softoneIds = records.map(record => record.softoneId).filter((value): value is string => Boolean(value));
    if (syncVesselAllocations && softoneIds.length > 0) {
      const invoiceRows: Array<{ id: number; softoneId: string | null }> = [];
      for (let index = 0; index < softoneIds.length; index += batchSize) {
        invoiceRows.push(...await tx
          .select({ id: invoices.id, softoneId: invoices.softoneId })
          .from(invoices)
          .where(inArray(invoices.softoneId, softoneIds.slice(index, index + batchSize))));
      }
      const invoiceIdBySoftoneId = new Map(
        invoiceRows.filter(row => row.softoneId).map(row => [row.softoneId!, row.id]),
      );
      const affectedInvoiceIds = invoiceRows.map(row => row.id);
      for (let index = 0; index < affectedInvoiceIds.length; index += batchSize) {
        await tx.delete(invoiceVesselAllocations).where(
          inArray(invoiceVesselAllocations.invoiceId, affectedInvoiceIds.slice(index, index + batchSize)),
        );
      }
      const allocations: InsertInvoiceVesselAllocation[] = records.flatMap(record => {
        const invoiceId = record.softoneId ? invoiceIdBySoftoneId.get(record.softoneId) : undefined;
        if (!invoiceId) return [];
        return (record.vesselAllocations ?? []).map(allocation => ({ ...allocation, invoiceId }));
      });
      for (let index = 0; index < allocations.length; index += batchSize) {
        await tx.insert(invoiceVesselAllocations).values(allocations.slice(index, index + batchSize));
      }
    }
  });
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
// ---------- Customer-group watchers ----------
/**
 * Watchers follow a group's receivables card without owning it: they see the
 * account in their watch list, but the account manager and the collector remain
 * the responsible people.
 */
export async function listCustomerWatchers(groupName: string) {
  const db = await requireDb();
  return db
    .select({
      id: customerWatchers.id,
      groupName: customerWatchers.groupName,
      memberId: customerWatchers.memberId,
      name: teamMembers.name,
      title: teamMembers.title,
    })
    .from(customerWatchers)
    .innerJoin(teamMembers, eq(customerWatchers.memberId, teamMembers.id))
    .where(eq(customerWatchers.groupName, groupName))
    .orderBy(customerWatchers.createdAt);
}
export async function addCustomerWatcher(groupName: string, memberId: number) {
  const db = await requireDb();
  const existing = await db
    .select({ id: customerWatchers.id })
    .from(customerWatchers)
    .where(and(eq(customerWatchers.groupName, groupName), eq(customerWatchers.memberId, memberId)));
  if (existing.length > 0) return existing[0].id;
  const res = await db.insert(customerWatchers).values({ groupName, memberId });
  return Number((res as any)[0].insertId);
}
export async function removeCustomerWatcher(groupName: string, memberId: number) {
  const db = await requireDb();
  await db
    .delete(customerWatchers)
    .where(and(eq(customerWatchers.groupName, groupName), eq(customerWatchers.memberId, memberId)));
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

/**
 * Record @mentions found in a note. Mentions are references, not work items:
 * nothing here creates or touches a task.
 */
export async function addNoteMentions(rows: InsertNoteMention[]) {
  if (rows.length === 0) return 0;
  const db = await requireDb();
  await db.insert(noteMentions).values(rows);
  return rows.length;
}

/** Mentions addressed to one team member, newest first. */
export async function listMentionsForMember(memberId: number, opts?: { unreadOnly?: boolean; limit?: number }) {
  const db = await requireDb();
  const where = opts?.unreadOnly
    ? and(eq(noteMentions.memberId, memberId), sql`${noteMentions.readAt} is null`)
    : eq(noteMentions.memberId, memberId);
  return db
    .select()
    .from(noteMentions)
    .where(where)
    .orderBy(desc(noteMentions.createdAt))
    .limit(opts?.limit ?? 100);
}

export async function countUnreadMentions(memberId: number) {
  const rows = await listMentionsForMember(memberId, { unreadOnly: true, limit: 500 });
  return rows.length;
}

/** Mark one mention, or every mention of a member, as seen. */
export async function markMentionsRead(memberId: number, mentionId?: number) {
  const db = await requireDb();
  const where = mentionId
    ? and(eq(noteMentions.memberId, memberId), eq(noteMentions.id, mentionId))
    : eq(noteMentions.memberId, memberId);
  await db.update(noteMentions).set({ readAt: new Date() }).where(where);
}

/** Every mention written on a group's notes, for the group card. */
export async function listMentionsByGroup(groupName: string, limit = 100) {
  const db = await requireDb();
  return db
    .select()
    .from(noteMentions)
    .where(eq(noteMentions.groupName, groupName))
    .orderBy(desc(noteMentions.createdAt))
    .limit(limit);
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

/**
 * Activity log for a group with the author's display name resolved, so the
 * communication timeline can show "who did this" without a second round-trip.
 */
export async function listActivityLogWithAuthors(groupName: string, limit = 200) {
  const rows = await listActivityLog(groupName, limit);
  if (rows.length === 0) return [] as (typeof rows[number] & { authorName: string | null })[];
  const users = await listUsersWithProfiles().catch(() => []);
  const names = new Map(users.map(u => [u.id, u.name ?? null]));
  return rows.map(r => ({ ...r, authorName: r.createdBy ? (names.get(r.createdBy) ?? null) : null }));
}

/**
 * Per-group call summary in a single query: when the group was last called, by
 * whom, and how many calls were logged. Used by the Collections Desk so contact
 * activity is visible without opening each card. `No Answer` attempts are counted
 * separately, because a run of unanswered calls is itself the signal.
 *
 * A logged call is stored with the activity type of its *outcome* — a call that ends
 * in a confirmed promise is written as `promise`, not `call`. Filtering on the type
 * alone therefore lost real calls and the card claimed "Never contacted" while the
 * same call had just set a Promise to Pay. The call log is identified by its title
 * prefix instead, which every logCall entry carries.
 */
export async function callSummaryByGroup() {
  const db = await requireDb();
  const rows = await db
    .select({
      groupName: activityLog.groupName,
      title: activityLog.title,
      description: activityLog.description,
      createdAt: activityLog.createdAt,
      createdBy: activityLog.createdBy,
    })
    .from(activityLog)
    .where(or(eq(activityLog.activityType, "call"), like(activityLog.title, "Call %")))
    .orderBy(desc(activityLog.createdAt));
  const out = new Map<
    string,
    {
      lastCallAt: Date;
      lastCallBy: number | null;
      lastCallTitle: string;
      lastCallNote: string | null;
      calls: number;
      noAnswer: number;
    }
  >();
  for (const r of rows) {
    const key = r.groupName;
    const entry = out.get(key);
    const isNoAnswer = (r.title ?? "").includes("No Answer");
    if (!entry) {
      // Rows arrive newest first, so the first row per group is the latest call.
      out.set(key, {
        lastCallAt: r.createdAt,
        lastCallBy: r.createdBy ?? null,
        lastCallTitle: r.title ?? "",
        lastCallNote: r.description ?? null,
        calls: 1,
        noAnswer: isNoAnswer ? 1 : 0,
      });
    } else {
      entry.calls++;
      if (isNoAnswer) entry.noAnswer++;
    }
  }
  return out;
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

/**
 * Set the Person/Department type on many contacts in one statement. Returns how
 * many ids matched an existing row.
 */
/**
 * Gift records, optionally narrowed to one year. Kept as a plain list so the
 * caller can index it by contact; the table is small (a few hundred rows).
 */
export async function listContactGifts(year?: number) {
  const db = await requireDb();
  if (year === undefined) return db.select().from(contactGifts);
  return db.select().from(contactGifts).where(eq(contactGifts.year, year));
}

/** Add a contact to a year's gift list, or change the tier if already there. */
export async function upsertContactGift(input: {
  contactId: number;
  year: number;
  tier: GiftTier;
  region?: string | null;
  sourceName?: string | null;
  sourceGroup?: string | null;
  notes?: string | null;
}) {
  const db = await requireDb();
  const existing = await db
    .select({ id: contactGifts.id })
    .from(contactGifts)
    .where(and(eq(contactGifts.contactId, input.contactId), eq(contactGifts.year, input.year)))
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(contactGifts)
      .set({
        tier: input.tier,
        ...(input.region !== undefined ? { region: input.region } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      })
      .where(eq(contactGifts.id, existing[0].id));
    return existing[0].id;
  }
  await db.insert(contactGifts).values({
    contactId: input.contactId,
    year: input.year,
    tier: input.tier,
    region: input.region ?? null,
    sourceName: input.sourceName ?? null,
    sourceGroup: input.sourceGroup ?? null,
    notes: input.notes ?? null,
  });
  return input.contactId;
}

/** Remove a contact from a year's gift list. */
export async function deleteContactGift(contactId: number, year: number) {
  const db = await requireDb();
  await db.delete(contactGifts).where(and(eq(contactGifts.contactId, contactId), eq(contactGifts.year, year)));
  return { ok: true } as const;
}

/** Gift-list rows awaiting a human decision, newest year first. */
export async function listGiftReview(status?: "pending" | "resolved" | "dismissed") {
  const db = await requireDb();
  const q = db.select().from(giftImportReview);
  if (!status) return q.orderBy(desc(giftImportReview.year), giftImportReview.sourceName);
  return q.where(eq(giftImportReview.status, status)).orderBy(desc(giftImportReview.year), giftImportReview.sourceName);
}

export async function getGiftReviewRow(id: number) {
  const db = await requireDb();
  return db.select().from(giftImportReview).where(eq(giftImportReview.id, id)).limit(1);
}

/** Mark a review row resolved against a chosen contact, or dismissed. */
export async function setGiftReviewStatus(
  id: number,
  status: "pending" | "resolved" | "dismissed",
  resolvedContactId?: number | null,
) {
  const db = await requireDb();
  await db
    .update(giftImportReview)
    .set({ status, resolvedContactId: resolvedContactId ?? null })
    .where(eq(giftImportReview.id, id));
  return { ok: true } as const;
}

/** Dismiss many review rows at once (used by "dismiss all namesakes"). */
export async function dismissGiftReviewBulk(ids: number[]) {
  if (ids.length === 0) return 0;
  const db = await requireDb();
  await db.update(giftImportReview).set({ status: "dismissed" }).where(inArray(giftImportReview.id, ids));
  return ids.length;
}

export async function setPaymentContactTypeBulk(ids: number[], contactType: "Person" | "Department") {
  if (ids.length === 0) return 0;
  const db = await requireDb();
  const existing = await db
    .select({ id: paymentContacts.id })
    .from(paymentContacts)
    .where(inArray(paymentContacts.id, ids));
  if (existing.length === 0) return 0;
  await db
    .update(paymentContacts)
    .set({ contactType })
    .where(inArray(paymentContacts.id, existing.map(r => r.id)));
  return existing.length;
}

export async function deletePaymentContact(id: number) {
  const db = await requireDb();
  return db.delete(paymentContacts).where(eq(paymentContacts.id, id));
}

/**
 * Address Book uses archive instead of delete: the row stays for history but
 * leaves every directory list and mailing list. `mergedIntoId` is set when the
 * contact was archived as part of a duplicate merge.
 */
export async function archivePaymentContact(id: number, mergedIntoId?: number) {
  const db = await requireDb();
  return db
    .update(paymentContacts)
    .set({ archived: 1, archivedAt: new Date(), ...(mergedIntoId ? { mergedIntoId } : {}) })
    .where(eq(paymentContacts.id, id));
}

export async function restorePaymentContact(id: number) {
  const db = await requireDb();
  return db
    .update(paymentContacts)
    .set({ archived: 0, archivedAt: null, mergedIntoId: null })
    .where(eq(paymentContacts.id, id));
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
  // SQL prefilters loosely on the longest word (accents and word order are then
  // settled in TypeScript via matchesAllTokens), so a query like
  // "Μπουκόλος Αντρέας" still reaches rows stored as "Andreas Boukolos".
  const tokens = queryTokens(query);
  const longest = tokens.slice().sort((a, b) => b.length - a.length)[0] ?? "";
  const loose = `%${longest}%`;
  const [custRows, invRows, noteRows, taskRows] = await Promise.all([
    db
      .select({ id: customers.id, name: customers.name, code: customers.code, customerGroup: customers.customerGroup })
      .from(customers)
      .where(
        or(
          like(customers.name, q),
          like(customers.code, q),
          like(customers.customerGroup, q),
          like(customers.vatNumber, q),
          like(customers.name, loose),
          like(customers.customerGroup, loose),
        ),
      )
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
      .where(or(like(invoices.invoiceNumber, q), like(vessels.name, q), like(vessels.name, loose)))
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
  // Contacts and vessels: people and ships are what users search for most, so
  // both are prefiltered loosely and then filtered precisely below.
  const [contactRows, vesselRows] = await Promise.all([
    db
      .select({
        id: paymentContacts.id,
        name: paymentContacts.name,
        email: paymentContacts.email,
        phone: paymentContacts.phone,
        title: paymentContacts.title,
        contactType: paymentContacts.contactType,
        customerId: paymentContacts.customerId,
        customerName: customers.name,
        customerGroup: customers.customerGroup,
      })
      .from(paymentContacts)
      .leftJoin(customers, eq(paymentContacts.customerId, customers.id))
      .where(
        and(
          eq(paymentContacts.archived, 0),
          or(
            like(paymentContacts.name, q),
            like(paymentContacts.email, q),
            like(paymentContacts.title, q),
            like(paymentContacts.name, loose),
            like(paymentContacts.email, loose),
          ),
        ),
      )
      .limit(limitPerType * 6),
    db
      .select({
        id: vessels.id,
        name: vessels.name,
        imo: vessels.imo,
        vesselType: vessels.vesselType,
        flag: vessels.flag,
        customerId: vessels.customerId,
        customerName: customers.name,
        customerGroup: customers.customerGroup,
      })
      .from(vessels)
      .leftJoin(customers, eq(vessels.customerId, customers.id))
      .where(or(like(vessels.name, q), like(vessels.imo, q), like(vessels.name, loose)))
      .limit(limitPerType * 4),
  ]);
  // Prime 247 operations records and financial documents. Keep the unified
  // Manus search while querying the hub's real database records.
  const [contractRows, quotationRows, creditNoteRows, assetRows, certificateRows, catalogRows, consumableRows] =
    await Promise.all([
      db.select({
        id: opsContracts.id, contractNumber: opsContracts.contractNumber,
        title: opsContracts.title, status: opsContracts.status,
        totalValue: opsContracts.totalValue, customerId: opsContracts.customerId,
        customerName: customers.name, customerGroup: customers.customerGroup,
      }).from(opsContracts).leftJoin(customers, eq(opsContracts.customerId, customers.id))
        .where(or(like(opsContracts.contractNumber, q), like(opsContracts.title, q), like(customers.name, q), like(opsContracts.title, loose), like(customers.name, loose)))
        .limit(limitPerType * 3),
      db.select({
        id: opsQuotations.id, quotationNumber: opsQuotations.quotationNumber,
        status: opsQuotations.status, sellingPrice: opsQuotations.sellingPrice,
        customerId: opsQuotations.customerId, customerName: customers.name,
      }).from(opsQuotations).leftJoin(customers, eq(opsQuotations.customerId, customers.id))
        .where(or(like(opsQuotations.quotationNumber, q), like(customers.name, q), like(customers.name, loose)))
        .limit(limitPerType),
      db.select({
        id: creditNotes.id, docNumber: creditNotes.docNumber, docDate: creditNotes.docDate,
        amount: creditNotes.amount, openAmount: creditNotes.openAmount, currency: creditNotes.currency,
        customerId: creditNotes.customerId, customerName: customers.name, vesselName: vessels.name,
      }).from(creditNotes).leftJoin(customers, eq(creditNotes.customerId, customers.id))
        .leftJoin(vessels, eq(creditNotes.vesselId, vessels.id))
        .where(or(like(creditNotes.docNumber, q), like(customers.name, q), like(vessels.name, q)))
        .orderBy(desc(creditNotes.docDate)).limit(limitPerType),
      db.select({
        id: opsAssets.id, serialNumber: opsAssets.serialNumber, name: opsAssets.name,
        status: opsAssets.status, vesselId: opsAssets.vesselId, contractId: opsAssets.contractId,
        vesselName: vessels.name,
      }).from(opsAssets).leftJoin(vessels, eq(opsAssets.vesselId, vessels.id))
        .where(or(like(opsAssets.serialNumber, q), like(opsAssets.name, q), like(opsAssets.name, loose)))
        .limit(limitPerType * 2),
      db.select({
        id: opsCertificates.id, certificateNumber: opsCertificates.certificateNumber,
        expiryDate: opsCertificates.expiryDate, assetId: opsCertificates.assetId,
        assetName: opsAssets.name, serialNumber: opsAssets.serialNumber,
        vesselId: opsAssets.vesselId, vesselName: vessels.name,
      }).from(opsCertificates).leftJoin(opsAssets, eq(opsCertificates.assetId, opsAssets.id))
        .leftJoin(vessels, eq(opsAssets.vesselId, vessels.id))
        .where(or(like(opsCertificates.certificateNumber, q), like(opsAssets.serialNumber, q)))
        .orderBy(desc(opsCertificates.expiryDate)).limit(limitPerType),
      db.select({ id: opsAssetCatalog.id, name: opsAssetCatalog.name, category: opsAssetCatalog.category, price: opsAssetCatalog.sellingPrice })
        .from(opsAssetCatalog).where(or(like(opsAssetCatalog.name, q), like(opsAssetCatalog.name, loose))).limit(limitPerType),
      db.select({ id: opsConsumableCatalog.id, name: opsConsumableCatalog.name, category: opsConsumableCatalog.category, price: opsConsumableCatalog.sellingPricePerUnit })
        .from(opsConsumableCatalog).where(or(like(opsConsumableCatalog.name, q), like(opsConsumableCatalog.name, loose))).limit(limitPerType),
    ]);
  return {
    customers: custRows,
    invoices: invRows,
    notes: noteRows,
    tasks: taskRows,
    transfers: transferRows,
    allocations: allocationRows,
    contacts: contactRows,
    vessels: vesselRows,
    contracts: contractRows,
    quotations: quotationRows,
    creditNotes: creditNoteRows,
    assets: assetRows,
    certificates: certificateRows,
    products: [
      ...catalogRows.map(r => ({ ...r, kind: "Equipment" as const })),
      ...consumableRows.map(r => ({ ...r, kind: "Consumable" as const })),
    ],
  };
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

export type SoftOneVesselUpsert = {
  id: number;
  customerSoftoneId: string;
  name: string;
  imo: string | null;
  vesselType: string | null;
};

/**
 * Upsert the read-only SoftOne vessel registry. CCCCUSTSHIP is used as the
 * vessel primary key, which also lets invoice rows link directly and avoids a
 * second source-id column/migration. Existing non-SoftOne ids are protected.
 */
export async function upsertSoftOneVessels(records: SoftOneVesselUpsert[]) {
  if (records.length === 0) return { synced: 0 };
  const database = await requireDb();
  const [customerRows, existingVessels] = await Promise.all([
    database.select({ id: customers.id, softoneId: customers.softoneId }).from(customers),
    database.select().from(vessels),
  ]);
  const customerIdBySoftOneId = new Map(
    customerRows.filter(row => row.softoneId).map(row => [row.softoneId!, row.id]),
  );
  const existingById = new Map(existingVessels.map(vessel => [vessel.id, vessel]));
  const missingOwners = new Set<string>();
  const values: InsertVessel[] = records.map(record => {
    const customerId = customerIdBySoftOneId.get(record.customerSoftoneId) ?? null;
    if (!customerId) missingOwners.add(record.customerSoftoneId);
    const marker = `SoftOne CCCCUSTSHIP:${record.id}`;
    const existing = existingById.get(record.id);
    if (existing && existing.notes !== marker) {
      throw new Error(
        `Vessel id ${record.id} already belongs to a non-SoftOne record (${existing.name}).`,
      );
    }
    return {
      id: record.id,
      customerId,
      name: record.name,
      imo: record.imo,
      vesselType: record.vesselType,
      flag: existing?.flag ?? null,
      notes: marker,
    };
  });
  if (missingOwners.size > 0) {
    throw new Error(
      `SoftOne vessels reference ${missingOwners.size} customers that are not synchronized: ${Array.from(missingOwners).slice(0, 20).join(", ")}.`,
    );
  }
  const batchSize = 250;
  await database.transaction(async tx => {
    for (let index = 0; index < values.length; index += batchSize) {
      await tx
        .insert(vessels)
        .values(values.slice(index, index + batchSize))
        .onDuplicateKeyUpdate({
          set: {
            customerId: sql`VALUES(${vessels.customerId})`,
            name: sql`VALUES(${vessels.name})`,
            imo: sql`VALUES(${vessels.imo})`,
            vesselType: sql`VALUES(${vessels.vesselType})`,
            notes: sql`VALUES(${vessels.notes})`,
          },
        });
    }

  });
  return { synced: values.length };
}

export async function listInvoiceVesselAllocations(invoiceIds?: number[]) {
  const database = await requireDb();
  if (invoiceIds && invoiceIds.length === 0) return [];
  const query = database.select().from(invoiceVesselAllocations);
  return invoiceIds
    ? query.where(inArray(invoiceVesselAllocations.invoiceId, invoiceIds))
    : query;
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
  await db.delete(invoiceVesselAllocations).where(eq(invoiceVesselAllocations.vesselId, id));
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

export type SoftOneCreditNoteUpsert = Omit<InsertCreditNote, "customerId"> & {
  customerSoftoneId: string;
};

/** Idempotently mirror SoftOne credit-note state into Hub only. */
export async function upsertSoftOneCreditNotes(records: SoftOneCreditNoteUpsert[]) {
  const database = await requireDb();
  const customerRows = await database
    .select({ id: customers.id, softoneId: customers.softoneId })
    .from(customers);
  const customerIdBySoftoneId = new Map(
    customerRows.filter(row => row.softoneId).map(row => [row.softoneId!, row.id]),
  );
  const missingCustomers = Array.from(new Set(records
    .filter(record => !customerIdBySoftoneId.has(record.customerSoftoneId))
    .map(record => record.customerSoftoneId)));
  if (missingCustomers.length > 0) {
    throw new Error(
      `SoftOne credit notes reference ${missingCustomers.length} customers that are not synchronized: ${missingCustomers.join(", ")}.`,
    );
  }
  const vesselRows = await database.select({ id: vessels.id }).from(vessels);
  const vesselIds = new Set(vesselRows.map(row => row.id));
  const values = records.map(({ customerSoftoneId, ...record }) => ({
    ...record,
    customerId: customerIdBySoftoneId.get(customerSoftoneId)!,
    vesselId: record.vesselId && vesselIds.has(record.vesselId) ? record.vesselId : null,
  }));
  for (let index = 0; index < values.length; index += 250) {
    await database.insert(creditNotes).values(values.slice(index, index + 250))
      .onDuplicateKeyUpdate({ set: {
        customerId: sql`VALUES(${creditNotes.customerId})`,
        docNumber: sql`VALUES(${creditNotes.docNumber})`,
        docDate: sql`VALUES(${creditNotes.docDate})`,
        branch: sql`VALUES(${creditNotes.branch})`,
        currency: sql`VALUES(${creditNotes.currency})`,
        amount: sql`VALUES(${creditNotes.amount})`,
        openAmount: sql`VALUES(${creditNotes.openAmount})`,
        closedAt: sql`VALUES(${creditNotes.closedAt})`,
        openAmountEur: sql`VALUES(${creditNotes.openAmountEur})`,
        vesselId: sql`VALUES(${creditNotes.vesselId})`,
        softoneId: sql`VALUES(${creditNotes.softoneId})`,
      }});
  }
  return { synced: values.length };
}

/** Remove ERP-sourced ordinary ΔΑΤ invoices that were previously misclassified as credits. */
export async function deleteMisclassifiedSoftOneCreditNotes() {
  const database = await requireDb();
  const invalid = await database
    .select({ id: creditNotes.id })
    .from(creditNotes)
    .where(and(
      isNotNull(creditNotes.softoneId),
      like(creditNotes.docNumber, "ΔΑΤ-%"),
    ));
  const ids = invalid.map(row => row.id);
  if (ids.length === 0) return { deleted: 0 };
  await database.delete(creditNoteAllocations).where(inArray(creditNoteAllocations.creditNoteId, ids));
  await database.delete(creditNotes).where(inArray(creditNotes.id, ids));
  return { deleted: ids.length };
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

// ---------------------------------------------------------------------------
// Address Book: custom field definitions, values, saved views, list layouts
// ---------------------------------------------------------------------------

/** All non-archived field definitions, optionally for a single entity. */
export async function listCustomFieldDefs(entity?: AddressBookEntity) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(customFieldDefs)
    .where(entity ? and(eq(customFieldDefs.archived, 0), eq(customFieldDefs.entity, entity)) : eq(customFieldDefs.archived, 0))
    .orderBy(customFieldDefs.sortOrder, customFieldDefs.id);
  return rows;
}

export async function getCustomFieldDef(id: number) {
  const db = await requireDb();
  const rows = await db.select().from(customFieldDefs).where(eq(customFieldDefs.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createCustomFieldDef(data: InsertCustomFieldDef) {
  const db = await requireDb();
  const res = await db.insert(customFieldDefs).values(data);
  return Number((res as any)[0].insertId);
}

export async function updateCustomFieldDef(id: number, data: Partial<InsertCustomFieldDef>) {
  const db = await requireDb();
  await db.update(customFieldDefs).set(data).where(eq(customFieldDefs.id, id));
}

/** Soft delete: values are kept so the field can be restored. */
export async function archiveCustomFieldDef(id: number) {
  const db = await requireDb();
  await db.update(customFieldDefs).set({ archived: 1 }).where(eq(customFieldDefs.id, id));
}

/** All custom values for one entity type, keyed by `recordKey` then `fieldId`. */
export async function listCustomFieldValues(entity: AddressBookEntity, recordKeys?: string[]) {
  const db = await requireDb();
  const where =
    recordKeys && recordKeys.length > 0
      ? and(eq(customFieldValues.entity, entity), inArray(customFieldValues.recordKey, recordKeys))
      : eq(customFieldValues.entity, entity);
  return db.select().from(customFieldValues).where(where);
}

/**
 * Upsert one custom-field value. An empty string clears the value so the record
 * shows the field as blank rather than keeping a stale entry.
 */
export async function setCustomFieldValue(args: {
  fieldId: number;
  entity: AddressBookEntity;
  recordKey: string;
  value: string | null;
  updatedBy?: number | null;
}) {
  const db = await requireDb();
  const existing = await db
    .select()
    .from(customFieldValues)
    .where(and(eq(customFieldValues.fieldId, args.fieldId), eq(customFieldValues.recordKey, args.recordKey)))
    .limit(1);
  if (existing[0]) {
    await db
      .update(customFieldValues)
      .set({ value: args.value, updatedBy: args.updatedBy ?? null })
      .where(eq(customFieldValues.id, existing[0].id));
    return existing[0].id;
  }
  const res = await db.insert(customFieldValues).values({
    fieldId: args.fieldId,
    entity: args.entity,
    recordKey: args.recordKey,
    value: args.value,
    updatedBy: args.updatedBy ?? null,
  });
  return Number((res as any)[0].insertId);
}

/** Saved views visible to a user: their own plus every shared one. */
export async function listSavedViews(entity: AddressBookEntity, userId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(savedViews)
    .where(and(eq(savedViews.entity, entity), or(eq(savedViews.shared, 1), eq(savedViews.ownerId, userId))))
    .orderBy(savedViews.name);
}

export async function getSavedView(id: number) {
  const db = await requireDb();
  const rows = await db.select().from(savedViews).where(eq(savedViews.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createSavedView(data: InsertSavedView) {
  const db = await requireDb();
  const res = await db.insert(savedViews).values(data);
  return Number((res as any)[0].insertId);
}

export async function updateSavedView(id: number, data: Partial<InsertSavedView>) {
  const db = await requireDb();
  await db.update(savedViews).set(data).where(eq(savedViews.id, id));
}

export async function deleteSavedView(id: number) {
  const db = await requireDb();
  await db.delete(savedViews).where(eq(savedViews.id, id));
}

/** Per-user column visibility/order for one list. */
export async function getListLayout(userId: number, listKey: string) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(listLayouts)
    .where(and(eq(listLayouts.userId, userId), eq(listLayouts.listKey, listKey)))
    .limit(1);
  return rows[0] ?? null;
}

export async function setListLayout(userId: number, listKey: string, config: string) {
  const db = await requireDb();
  const existing = await getListLayout(userId, listKey);
  if (existing) {
    await db.update(listLayouts).set({ config }).where(eq(listLayouts.id, existing.id));
    return existing.id;
  }
  const res = await db.insert(listLayouts).values({ userId, listKey, config });
  return Number((res as any)[0].insertId);
}

/** Historical forecast performance for a group (last N months). */
export async function getForecastHistory(groupKey: string, limit = 6) {
  const db = await requireDb();
  const entries = await db
    .select()
    .from(forecastEntries)
    .where(eq(forecastEntries.customerGroup, groupKey))
    .orderBy(desc(forecastEntries.year), desc(forecastEntries.month))
    .limit(limit);
  
  // Get group members
  const members = await db.select({ id: customers.id }).from(customers).where(or(eq(customers.customerGroup, groupKey), eq(customers.name, groupKey)));
  const groupMemberIds = members.map(m => m.id);

  if (groupMemberIds.length === 0) return [];

  const results = [];
  for (const e of entries) {
    const { start, end } = monthRange(e.year, e.month);
    const [receiptsRows, wires] = await Promise.all([
      db.select().from(receipts).where(
        and(
          inArray(receipts.customerId, groupMemberIds),
          gte(receipts.receiptDate, start),
          lt(receipts.receiptDate, end)
        )
      ),
      db.select().from(wireTransfers).where(
        and(
          inArray(wireTransfers.customerId, groupMemberIds),
          eq(wireTransfers.status, "Received")
        )
      )
    ]);

    const collectedWires = wires.filter(w => {
      const ts = w.receivedDate ?? w.transferDate;
      return ts >= start && ts < end;
    });

    const collected = receiptsRows.reduce((s, r) => s + Number(r.amount), 0) +
                    collectedWires.reduce((s, w) => s + Number(w.amount), 0);

    results.push({
      year: e.year,
      month: e.month,
      aiSuggested: Number(e.aiSuggestedAmount),
      expected: Number(e.expectedAmount),
      collected,
      userAdjusted: !!e.userAdjusted,
    });
  }
  return results;
}
