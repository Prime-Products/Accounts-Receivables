import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import { createTestCustomer, cleanupTestCustomer, type TestCustomerFixture } from "./testFixtures";
import { snapshotIds, cleanupSince, type IdSnapshot } from "./testCleanup";
import { getDb } from "./db";
import { wireTransfers, wireTransferAllocations } from "../drizzle/schema";
import { inArray } from "drizzle-orm";

function makeCaller() {
  return appRouter.createCaller({ user: { id: 1, openId: "test", name: "Vitest", role: "admin" } } as any);
}

describe("openTransfers in groupDetail / get360", () => {
  let fx: TestCustomerFixture;
  let snap: IdSnapshot | null = null;
  const createdTransferIds: number[] = [];

  beforeAll(async () => {
    snap = await snapshotIds();
    fx = await createTestCustomer("VITESTFIX-OPENTRANSFERS");
  });

  afterAll(async () => {
    const dbi = await getDb();
    if (dbi && createdTransferIds.length > 0) {
      await dbi.delete(wireTransferAllocations).where(inArray(wireTransferAllocations.wireTransferId, createdTransferIds));
      await dbi.delete(wireTransfers).where(inArray(wireTransfers.id, createdTransferIds));
    }
    if (fx) await cleanupTestCustomer(fx);
    if (snap) await cleanupSince(snap);
  });

  it("returns every customer transfer — partially allocated with its remainder, fully allocated flagged settled — and still hides internal ones", async () => {
    const dbi = await getDb();
    expect(dbi).toBeTruthy();
    // Transfer 1: €1000, €400 allocated → unallocated €600 (visible)
    const [t1] = await dbi!
      .insert(wireTransfers)
      .values({ customerId: fx.id, amount: "1000.00" as any, currency: "EUR", transferDate: Date.now(), status: "Received" })
      .$returningId();
    createdTransferIds.push(t1.id);
    // Find any invoice to allocate against (fixture group has none; use the fixture customer's own invoice-less allocation — allocation rows only need ids)
    await dbi!.insert(wireTransferAllocations).values({ wireTransferId: t1.id, invoiceId: 1, amount: "400.00" as any });
    // Transfer 2: €500 fully allocated → still listed, flagged settled with a zero remainder
    const [t2] = await dbi!
      .insert(wireTransfers)
      .values({ customerId: fx.id, amount: "500.00" as any, currency: "EUR", transferDate: Date.now(), status: "Received" })
      .$returningId();
    createdTransferIds.push(t2.id);
    await dbi!.insert(wireTransferAllocations).values({ wireTransferId: t2.id, invoiceId: 1, amount: "500.00" as any });
    // Transfer 3: internal → hidden regardless of allocation
    const [t3] = await dbi!
      .insert(wireTransfers)
      .values({ customerId: fx.id, amount: "999.00" as any, currency: "EUR", transferDate: Date.now(), status: "Received", isInternal: true })
      .$returningId();
    createdTransferIds.push(t3.id);

    const caller = makeCaller();
    const detail = await caller.customers.groupDetail({ group: fx.group });
    const rows = (detail as any).openTransfers as any[];
    expect(rows.some(r => r.id === t1.id)).toBe(true);
    const r1 = rows.find(r => r.id === t1.id)!;
    expect(r1.unallocated).toBeCloseTo(600, 2);
    expect(r1.allocated).toBeCloseTo(400, 2);
    expect(r1.settled).toBe(false);
    // The collector must be able to audit money that has already been matched, so
    // a fully allocated transfer stays in the list instead of disappearing.
    const r2 = rows.find(r => r.id === t2.id);
    expect(r2).toBeTruthy();
    expect(r2!.settled).toBe(true);
    expect(r2!.allocated).toBeCloseTo(500, 2);
    expect(r2!.unallocated).toBeCloseTo(0, 2);
    expect(r2!.unallocatedEur).toBeCloseTo(0, 2);
    expect(rows.some(r => r.id === t3.id)).toBe(false);
    // Money on account counts only what is still unmatched: €600, not €1100.
    expect((detail as any).totals.unallocatedPayments).toBeCloseTo(600, 2);

    const c360 = await caller.customers.get360({ id: fx.id });
    const rows360 = (c360 as any).openTransfers as any[];
    expect(rows360.some(r => r.id === t1.id)).toBe(true);
    expect(rows360.find(r => r.id === t2.id)?.settled).toBe(true);
    expect((c360 as any).unallocatedPayments).toBeCloseTo(600, 2);
  });
});
