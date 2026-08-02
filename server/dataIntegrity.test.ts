/**
 * Data hygiene guard.
 *
 * Vitest runs against the development database, so a suite that forgets to clean
 * up leaves rows the user then sees in the UI (this happened: 293 orphan
 * activity-log rows, 8 orphan contacts and 12 "vitest: promise to pay" promises
 * on a real group). These checks fail loudly when that happens again, and they
 * also catch genuine referential drift after ERP imports.
 */
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "./db";

async function count(query: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const res: any = await db.execute(sql.raw(query));
  const rows = Array.isArray(res) ? res[0] : res;
  const first = Array.isArray(rows) ? rows[0] : rows;
  return Number(first?.n ?? 0);
}

/** Resolved group name of a customer, mirroring the server's group resolution. */
const GROUP_EXPR = "TRIM(IFNULL(NULLIF(c.customerGroup,''), c.name))";

describe("referential integrity of the collections data", () => {
  it("no contact points at a deleted customer", async () => {
    expect(
      await count(
        `SELECT COUNT(*) AS n FROM payment_contacts pc LEFT JOIN customers c ON c.id = pc.customerId WHERE c.id IS NULL`,
      ),
    ).toBe(0);
  });

  it("no invoice or task points at a deleted customer", async () => {
    expect(
      await count(`SELECT COUNT(*) AS n FROM invoices i LEFT JOIN customers c ON c.id = i.customerId WHERE c.id IS NULL`),
    ).toBe(0);
    expect(
      await count(`SELECT COUNT(*) AS n FROM tasks t LEFT JOIN customers c ON c.id = t.customerId WHERE c.id IS NULL`),
    ).toBe(0);
  });

  it("no timeline entry, note, mention or status belongs to a group that no longer exists", async () => {
    for (const table of ["activity_log", "group_notes", "note_mentions", "group_confirmation_status", "group_watch_status"]) {
      const orphans = await count(
        `SELECT COUNT(*) AS n FROM ${table} x LEFT JOIN customers c ON ${GROUP_EXPR} = x.groupName WHERE c.id IS NULL`,
      );
      expect(orphans, `${table} has rows on non-existent groups`).toBe(0);
    }
  });
});

describe("no test residue in the live tables", () => {
  it("leaves no fixture customers or invoices behind", async () => {
    expect(await count(`SELECT COUNT(*) AS n FROM customers WHERE code LIKE 'VTFX-%'`)).toBe(0);
    expect(await count(`SELECT COUNT(*) AS n FROM invoices WHERE invoiceNumber LIKE 'VTFX-INV-%'`)).toBe(0);
  });

  it("leaves no vitest-authored calls, promises or notes on real groups", async () => {
    expect(
      await count(`SELECT COUNT(*) AS n FROM activity_log WHERE IFNULL(description,'') LIKE '%vitest%'`),
    ).toBe(0);
    expect(await count(`SELECT COUNT(*) AS n FROM promises_to_pay WHERE IFNULL(notes,'') LIKE '%vitest%'`)).toBe(0);
    expect(await count(`SELECT COUNT(*) AS n FROM group_notes WHERE content LIKE '%vitest%'`)).toBe(0);
  });
});
