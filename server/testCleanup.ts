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
