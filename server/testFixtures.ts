/**
 * Shared test fixtures — create ISOLATED customers/groups for vitest suites.
 *
 * RULE (post-incident 30/7): tests must NEVER select real customers via
 * `db.listCustomers()` / `customers.find(...)` and must NEVER mutate tasks,
 * promises, or group confirmation statuses that belong to real data.
 * Always create a fixture customer with `createTestCustomer()` and operate
 * only on rows linked to it. Snapshot-based cleanup deletes inserted rows,
 * and `cleanupTestCustomer()` removes the customer + its group status rows.
 */
import { getDb, invalidateCache } from "./db";
import {
  customers,
  groupConfirmationStatus,
  tasks,
  promisesToPay,
  wireTransfers,
  wireTransferAllocations,
  invoices,
  paymentContacts,
  activityLog,
  groupNotes,
  noteMentions,
  groupWatchStatus,
  groupCollectionProfile,
} from "../drizzle/schema";
import { eq } from "drizzle-orm";

export interface TestCustomerFixture {
  id: number;
  name: string;
  group: string;
}

/** Create an isolated customer in its own unique group. */
export async function createTestCustomer(prefix = "VITESTFIX"): Promise<TestCustomerFixture> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable in test fixture");
  const uniq = `${prefix} ${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const [res] = await db
    .insert(customers)
    .values({
      code: `VTFX-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      name: uniq,
      customerGroup: uniq,
    } as typeof customers.$inferInsert)
    .$returningId();
  // The app caches listCustomers() for 10s — a fixture inserted via raw drizzle
  // would be invisible to group resolution without this.
  invalidateCache("customers");
  return { id: res.id, name: uniq, group: uniq };
}

/**
 * Give a fixture customer a minimal open invoice.
 *
 * `customers.groups` only lists groups that have been invoiced, because the CRM
 * import registers thousands of directory-only companies (contacts but no ledger)
 * that must stay out of the collections worklist. Any suite asserting on
 * `customers.groups()` therefore has to put at least one invoice on its fixture.
 */
export async function createTestInvoice(
  fx: TestCustomerFixture,
  opts: { amount?: number; dueInDays?: number } = {},
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable in test fixture");
  const now = Date.now();
  const [res] = await db
    .insert(invoices)
    .values({
      customerId: fx.id,
      invoiceNumber: `VTFX-INV-${now}-${Math.floor(Math.random() * 100000)}`,
      issueDate: now,
      dueDate: now + (opts.dueInDays ?? 30) * 24 * 60 * 60 * 1000,
      amount: String(opts.amount ?? 1000),
    } as typeof invoices.$inferInsert)
    .$returningId();
  invalidateCache("invoices");
  return res.id;
}

/** Hard-delete the fixture customer and every row tied to it. */
export async function cleanupTestCustomer(fx: TestCustomerFixture): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable in test fixture");
  await db.delete(tasks).where(eq(tasks.customerId, fx.id));
  await db.delete(promisesToPay).where(eq(promisesToPay.customerId, fx.id));
  // Contacts, timeline entries and notes written by the suite. Without these the
  // rows survive the customer deletion and become orphans that later show up in
  // data-integrity checks (payment_contacts pointing at a deleted customer).
  await db.delete(paymentContacts).where(eq(paymentContacts.customerId, fx.id));
  await db.delete(activityLog).where(eq(activityLog.groupName, fx.group));
  await db.delete(noteMentions).where(eq(noteMentions.groupName, fx.group));
  await db.delete(groupNotes).where(eq(groupNotes.groupName, fx.group));
  await db.delete(groupWatchStatus).where(eq(groupWatchStatus.groupName, fx.group));
  await db.delete(groupCollectionProfile).where(eq(groupCollectionProfile.groupName, fx.group));
  // Wire transfers + their allocations and invoices created for this fixture
  const wts = await db
    .select({ id: wireTransfers.id })
    .from(wireTransfers)
    .where(eq(wireTransfers.customerId, fx.id));
  for (const wt of wts) {
    await db
      .delete(wireTransferAllocations)
      .where(eq(wireTransferAllocations.wireTransferId, wt.id));
  }
  await db.delete(wireTransfers).where(eq(wireTransfers.customerId, fx.id));
  await db.delete(invoices).where(eq(invoices.customerId, fx.id));
  await db.delete(groupConfirmationStatus).where(eq(groupConfirmationStatus.groupName, fx.group));
  await db.delete(customers).where(eq(customers.id, fx.id));
  invalidateCache("customers");
}

/** Cleanup helper for multiple fixtures. */
export async function cleanupTestCustomers(fxs: TestCustomerFixture[]): Promise<void> {
  for (const fx of fxs) await cleanupTestCustomer(fx);
}
