import { describe, it, expect, beforeAll, afterAll } from "vitest";
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

/**
 * Manual matching (συμψηφισμός) of an open credit note against invoices of the
 * same group: partial matches leave a remainder, the invoice status follows the
 * matched amount, removing a match reverts the invoice, and a fully matched
 * credit note disappears from the transactions list.
 */
describe("credit note matching against invoices", () => {
  let fx: TestCustomerFixture;
  let snap: IdSnapshot | null = null;
  let invoiceId = 0;
  let creditNoteId = 0;

  beforeAll(async () => {
    snap = await snapshotIds();
    fx = await createTestCustomer("cnalloc");
    invoiceId = await db.createInvoice({
      customerId: fx.id,
      invoiceNumber: `VT-CNA-${Date.now()}`,
      issueDate: Date.now() - 10 * 86400000,
      dueDate: Date.now() + 20 * 86400000,
      amount: "1000.00",
      amountEur: "1000.00",
      paidAmount: "0.00",
      currency: "EUR",
      status: "Open",
      company: "Prime Products LTD",
    } as any);
    creditNoteId = await db.createCreditNote({
      customerId: fx.id,
      docNumber: `VT-CNAV-${Date.now()}`,
      docDate: Date.now() - 3 * 86400000,
      amount: "400.00",
      openAmount: "400.00",
      openAmountEur: "400.00",
      currency: "EUR",
      branch: "Prime Products LTD",
    } as any);
  });

  afterAll(async () => {
    const allocs = await db.listAllocationsByCreditNote(creditNoteId).catch(() => []);
    for (const a of allocs) await db.deleteCreditNoteAllocation(a.id).catch(() => {});
    await db.deleteCreditNote(creditNoteId).catch(() => {});
    if (snap) await cleanupSince(snap);
    if (fx) await cleanupTestCustomer(fx);
  });

  it("rejects a match larger than the credit note open amount", async () => {
    const caller = makeCaller();
    await expect(
      caller.customers.allocateCreditNote({ creditNoteId, allocations: [{ invoiceId, amount: 500 }] })
    ).rejects.toThrow(/exceeds the credit note open amount/i);
  });

  it("matches part of the credit note and moves the invoice to Partially Paid", async () => {
    const caller = makeCaller();
    const res = await caller.customers.allocateCreditNote({
      creditNoteId,
      allocations: [{ invoiceId, amount: 250 }],
    });
    expect(res.success).toBe(true);
    expect(res.results[0]?.newStatus).toBe("Partially Paid");

    const inv = await db.getInvoice(invoiceId);
    expect(Number(inv!.paidAmount)).toBeCloseTo(250, 2);

    const payload: any = await caller.customers.get360({ id: fx.id });
    const row = (payload.openCreditNotes ?? []).find((c: any) => c.id === creditNoteId);
    expect(row).toBeTruthy();
    expect(Number(row.allocated)).toBeCloseTo(250, 2);
    expect(Number(row.open)).toBeCloseTo(150, 2);
  });

  it("lists the existing match with its invoice number", async () => {
    const caller = makeCaller();
    const rows = await caller.customers.listCreditNoteAllocations({ creditNoteId });
    expect(rows.length).toBe(1);
    expect(rows[0].invoiceId).toBe(invoiceId);
    expect(rows[0].amount).toBeCloseTo(250, 2);
  });

  it("removes the match and reverts the invoice to Open", async () => {
    const caller = makeCaller();
    const rows = await caller.customers.listCreditNoteAllocations({ creditNoteId });
    await caller.customers.removeCreditNoteAllocation({ allocationId: rows[0].id });

    const inv = await db.getInvoice(invoiceId);
    expect(Number(inv!.paidAmount)).toBeCloseTo(0, 2);
    expect(inv!.status).toBe("Open");

    const payload: any = await caller.customers.get360({ id: fx.id });
    const row = (payload.openCreditNotes ?? []).find((c: any) => c.id === creditNoteId);
    expect(Number(row.open)).toBeCloseTo(400, 2);
  });

  it("fully matching the credit note removes it from the transactions list", async () => {
    const caller = makeCaller();
    await caller.customers.allocateCreditNote({
      creditNoteId,
      allocations: [{ invoiceId, amount: 400 }],
    });
    const payload: any = await caller.customers.get360({ id: fx.id });
    const row = (payload.openCreditNotes ?? []).find((c: any) => c.id === creditNoteId);
    expect(row).toBeUndefined();

    // Revert so the invoice can be cleaned up in afterAll.
    const rows = await caller.customers.listCreditNoteAllocations({ creditNoteId });
    for (const r of rows) await caller.customers.removeCreditNoteAllocation({ allocationId: r.id });
  });
});
