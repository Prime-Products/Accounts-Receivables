import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";
import { createTestCustomer, cleanupTestCustomer, type TestCustomerFixture } from "./testFixtures";
import { snapshotIds, cleanupSince, type IdSnapshot } from "./testCleanup";

function makeCaller() {
  return appRouter.createCaller({
    user: { id: 1, openId: "test", name: "Vitest", email: null, role: "admin" } as any,
    req: {} as any,
    res: {} as any,
  } as any);
}

describe("net open balance (invoices − unallocated payments)", () => {
  let fx: TestCustomerFixture;
  let snap: IdSnapshot | null = null;

  beforeAll(async () => {
    snap = await snapshotIds();
    fx = await createTestCustomer("netbal");
  });

  afterAll(async () => {
    if (snap) await cleanupSince(snap);
    if (fx) await cleanupTestCustomer(fx);
  });

  it("groupDetail totals expose unallocatedPayments and netOpenBalance", async () => {
    const caller = makeCaller();
    // one open invoice €1,000
    const invId = await db.createInvoice({
      customerId: fx.id,
      invoiceNumber: `VT-NB-${Date.now()}`,
      issueDate: Date.now() - 10 * 86400000,
      dueDate: Date.now() + 20 * 86400000,
      amount: "1000.00",
      amountEur: "1000.00",
      currency: "EUR",
      status: "Open",
    } as any);
    // one wire transfer €400, €100 allocated → €300 unallocated
    const wtId = await db.createWireTransfer({
      customerId: fx.id,
      amount: "400.00",
      currency: "EUR",
      transferDate: Date.now() - 5 * 86400000,
      status: "Received",
    } as any);
    await db.createWireTransferAllocation({ wireTransferId: wtId, invoiceId: invId, amount: "100.00" } as any);

    const detail = await caller.customers.groupDetail({ group: fx.group });
    const totals = detail.totals as any;
    expect(totals.openBalance).toBeCloseTo(1000, 1);
    expect(totals.unallocatedPayments).toBeCloseTo(300, 1);
    expect(totals.netOpenBalance).toBeCloseTo(totals.openBalance - totals.unallocatedPayments, 1);
  });

  it("get360 exposes unallocatedPayments for the single customer", async () => {
    const caller = makeCaller();
    const res = await caller.customers.get360({ id: fx.id });
    expect((res as any).unallocatedPayments).toBeGreaterThan(0);
    expect((res as any).openTransfers.length).toBeGreaterThan(0);
    expect((res as any).openTransfers[0].unallocatedEur).toBeGreaterThan(0);
  });
});
