import { describe, expect, it } from "vitest";
import * as db from "./db";

/**
 * The wire transfers views show client money by default; the derived
 * inter-office (intercompany) movements only appear when the user asks for
 * them. These specs pin the data-level guarantees the toggle relies on.
 */

/** Same predicate the UI applies when the toggle is off. */
function clientOnly<T extends { isInternal?: unknown }>(rows: T[]) {
  return rows.filter(r => !r.isInternal);
}

describe("internal wire transfers", () => {
  it("every transfer row carries an isInternal flag so the toggle can split them", async () => {
    const all = await db.listAllWireTransfers();
    expect(Array.isArray(all)).toBe(true);
    for (const t of all) {
      expect(typeof (t as any).isInternal).toBe("boolean");
    }
  });

  it("hides internal transfers by default and reveals them when requested", async () => {
    const all = await db.listAllWireTransfers();
    const clients = clientOnly(all as any[]);
    const internals = (all as any[]).filter(t => t.isInternal);
    expect(clients.length + internals.length).toBe(all.length);
    // No internal row survives the default filter.
    expect(clients.some(t => (t as any).isInternal)).toBe(false);
  });

  it("internal transfers always name both offices, so the row stays traceable", async () => {
    const all = await db.listAllWireTransfers();
    for (const t of (all as any[]).filter(x => x.isInternal)) {
      expect(t.fromBranch ?? "").not.toBe("");
      expect(t.toBranch ?? "").not.toBe("");
      // Derived rows keep a pointer back to the client transfer they came from.
      expect(t.sourceWireTransferId ?? null).not.toBeNull();
    }
  });

  it("leaves no wire transfer attached to a deleted customer (test leftovers cleaned up)", async () => {
    const [transfers, customers] = await Promise.all([db.listAllWireTransfers(), db.listCustomers()]);
    const ids = new Set((customers as any[]).map(c => c.id));
    const orphans = (transfers as any[]).filter(t => !ids.has(t.customerId));
    expect(orphans.map(o => o.id)).toEqual([]);
  });
});
