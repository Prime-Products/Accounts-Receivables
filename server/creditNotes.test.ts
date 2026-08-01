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

/**
 * Open credit notes behave like payments on account: they show up in the
 * transactions list, they reduce the net open balance, and they are never
 * matched to invoices automatically. Fully matched ones disappear.
 */
describe("open credit notes in transactions", () => {
  let fx: TestCustomerFixture;
  let snap: IdSnapshot | null = null;
  const createdCreditNotes: number[] = [];

  beforeAll(async () => {
    snap = await snapshotIds();
    fx = await createTestCustomer("creditnote");
  });

  afterAll(async () => {
    for (const id of createdCreditNotes) await db.deleteCreditNote(id).catch(() => {});
    if (snap) await cleanupSince(snap);
    if (fx) await cleanupTestCustomer(fx);
  });

  it("shows an open credit note on the customer card and nets it off the balance", async () => {
    const caller = makeCaller();
    const invId = await db.createInvoice({
      customerId: fx.id,
      invoiceNumber: `VT-CN-${Date.now()}`,
      issueDate: Date.now() - 10 * 86400000,
      dueDate: Date.now() + 20 * 86400000,
      amount: "1000.00",
      amountEur: "1000.00",
      currency: "EUR",
      status: "Open",
    } as any);
    const cnId = await db.createCreditNote({
      customerId: fx.id,
      docNumber: `VT-CNV-${Date.now()}`,
      docDate: Date.now() - 3 * 86400000,
      amount: "250.00",
      openAmount: "250.00",
      currency: "EUR",
      branch: "Prime Products LTD",
    } as any);
    createdCreditNotes.push(cnId);

    const res: any = await caller.customers.get360({ id: fx.id });
    expect(res.openCreditNotes.length).toBe(1);
    const row = res.openCreditNotes[0];
    expect(row.open).toBeCloseTo(250, 2);
    expect(row.openEur).toBeCloseTo(250, 2);
    expect(row.allocated).toBeCloseTo(0, 2);
    expect(res.openCreditNotesTotal).toBeCloseTo(250, 2);
    expect(invId).toBeGreaterThan(0);
  });

  it("groupDetail totals subtract open credit notes from netOpenBalance", async () => {
    const caller = makeCaller();
    const detail: any = await caller.customers.groupDetail({ group: fx.group });
    const t = detail.totals;
    expect(t.openCreditNotes).toBeCloseTo(250, 2);
    expect(t.openCreditNotesCount).toBe(1);
    expect(t.netOpenBalance).toBeCloseTo(t.openBalance - t.unallocatedPayments - t.openCreditNotes, 2);
    expect(detail.openCreditNotes.length).toBe(1);
  });

  it("converts non-EUR credit notes to EUR for the totals", async () => {
    const caller = makeCaller();
    const cnId = await db.createCreditNote({
      customerId: fx.id,
      docNumber: `VT-CNAED-${Date.now()}`,
      docDate: Date.now() - 2 * 86400000,
      amount: "400.00",
      openAmount: "400.00",
      currency: "AED",
      branch: "Prime Products Distribution FZC LTD",
    } as any);
    createdCreditNotes.push(cnId);
    const res: any = await caller.customers.get360({ id: fx.id });
    const aed = res.openCreditNotes.find((r: any) => r.id === cnId);
    expect(aed.currency).toBe("AED");
    expect(aed.open).toBeCloseTo(400, 2);
    // AED converts to a smaller EUR figure
    expect(aed.openEur).toBeLessThan(400);
    expect(aed.openEur).toBeGreaterThan(0);
  });

  it("hides a credit note once it is fully matched, and shows partial matches as still open", async () => {
    const caller = makeCaller();
    const invId = await db.createInvoice({
      customerId: fx.id,
      invoiceNumber: `VT-CN2-${Date.now()}`,
      issueDate: Date.now() - 10 * 86400000,
      dueDate: Date.now() + 20 * 86400000,
      amount: "500.00",
      amountEur: "500.00",
      currency: "EUR",
      status: "Open",
    } as any);
    const cnId = await db.createCreditNote({
      customerId: fx.id,
      docNumber: `VT-CNM-${Date.now()}`,
      docDate: Date.now() - 1 * 86400000,
      amount: "100.00",
      openAmount: "100.00",
      currency: "EUR",
    } as any);
    createdCreditNotes.push(cnId);

    // partial match: 60 of 100 → still visible with 40 open
    const allocId = await db.createCreditNoteAllocation({
      creditNoteId: cnId,
      invoiceId: invId,
      amount: "60.00",
    } as any);
    let res: any = await caller.customers.get360({ id: fx.id });
    let row = res.openCreditNotes.find((r: any) => r.id === cnId);
    expect(row).toBeTruthy();
    expect(row.allocated).toBeCloseTo(60, 2);
    expect(row.open).toBeCloseTo(40, 2);

    // full match: remaining 40 → row disappears from the list
    await db.createCreditNoteAllocation({ creditNoteId: cnId, invoiceId: invId, amount: "40.00" } as any);
    res = await caller.customers.get360({ id: fx.id });
    expect(res.openCreditNotes.find((r: any) => r.id === cnId)).toBeUndefined();
    expect(allocId).toBeGreaterThan(0);
  });
});
