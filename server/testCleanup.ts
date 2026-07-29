/**
 * Shared test-data cleanup helpers.
 *
 * Vitest specs in this project run against the real development database, so
 * every spec that inserts customers/tasks/etc. MUST purge what it created.
 * Call `purgeTestCustomers(prefixes)` from an `afterAll` hook with the name
 * prefixes the spec uses (e.g. ["TaskLink %", "Test Bank Customer%"]).
 *
 * Safety: customers that own invoices or receipts are never deleted.
 */
import { sql } from "drizzle-orm";
import { getDb } from "./db";

export async function purgeTestCustomers(namePatterns: string[]) {
  const db = await getDb();
  if (!db || namePatterns.length === 0) return;
  for (const pattern of namePatterns) {
    await db.execute(sql`DELETE tc FROM task_comments tc JOIN tasks t ON t.id = tc.taskId JOIN customers c ON c.id = t.customerId WHERE c.name LIKE ${pattern}`);
    await db.execute(sql`DELETE ti FROM task_invoices ti JOIN tasks t ON t.id = ti.taskId JOIN customers c ON c.id = t.customerId WHERE c.name LIKE ${pattern}`);
    await db.execute(sql`DELETE t FROM tasks t JOIN customers c ON c.id = t.customerId WHERE c.name LIKE ${pattern}`);
    await db.execute(sql`DELETE p FROM promises_to_pay p JOIN customers c ON c.id = p.customerId WHERE c.name LIKE ${pattern}`);
    await db.execute(sql`DELETE FROM activity_log WHERE customerId IN (SELECT id FROM customers WHERE name LIKE ${pattern})`);
    await db.execute(sql`DELETE FROM group_confirmation_status WHERE groupName LIKE ${pattern}`);
    await db.execute(
      sql`DELETE FROM customers WHERE name LIKE ${pattern} AND id NOT IN (SELECT customerId FROM invoices WHERE customerId IS NOT NULL) AND id NOT IN (SELECT customerId FROM receipts WHERE customerId IS NOT NULL)`,
    );
  }
}

/**
 * Snapshot-based hard cleanup for specs that exercise REAL customers/groups
 * (e.g. calls.logCall against customers[0]). Marking rows Cancelled/Completed
 * is not enough — users still see the junk in the UI. Instead, snapshot max
 * IDs in beforeAll and hard-delete every newer row in afterAll.
 *
 * Usage:
 *   let snap: IdSnapshot;
 *   beforeAll(async () => { snap = await snapshotIds(); });
 *   afterAll(async () => { await cleanupSince(snap); });
 */
export interface IdSnapshot {
  tasks: number;
  promises: number;
  activity: number;
  groupNotes: number;
  emailHistory: number;
  confirmations: number;
}

async function maxId(table: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const res: any = await db.execute(sql.raw(`SELECT COALESCE(MAX(id), 0) AS m FROM ${table}`));
  const rows = Array.isArray(res) ? res[0] : res;
  const first = Array.isArray(rows) ? rows[0] : rows;
  return Number(first?.m ?? 0);
}

export async function snapshotIds(): Promise<IdSnapshot> {
  const [tasks, promises, activity, groupNotes, emailHistory, confirmations] = await Promise.all([
    maxId("tasks"),
    maxId("promises_to_pay"),
    maxId("activity_log"),
    maxId("group_notes"),
    maxId("email_history"),
    maxId("group_confirmation_status"),
  ]);
  return { tasks, promises, activity, groupNotes, emailHistory, confirmations };
}

export async function cleanupSince(snap: IdSnapshot): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const run = (q: string) => db.execute(sql.raw(q)).catch(() => undefined);
  await run(`DELETE FROM task_comments WHERE taskId IN (SELECT id FROM tasks WHERE id > ${snap.tasks})`);
  await run(`DELETE FROM task_invoices WHERE taskId IN (SELECT id FROM tasks WHERE id > ${snap.tasks})`);
  await run(`DELETE FROM tasks WHERE id > ${snap.tasks}`);
  await run(`DELETE FROM promises_to_pay WHERE id > ${snap.promises}`);
  await run(`DELETE FROM activity_log WHERE id > ${snap.activity}`);
  await run(`DELETE FROM group_notes WHERE id > ${snap.groupNotes}`);
  await run(`DELETE FROM email_history WHERE id > ${snap.emailHistory}`);
  await run(`DELETE FROM group_confirmation_status WHERE id > ${snap.confirmations}`);
}
