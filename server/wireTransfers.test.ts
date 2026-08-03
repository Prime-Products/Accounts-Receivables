import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";
import { purgeTestCustomers } from "./testCleanup";

describe("Wire Transfers", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;
  let testCustomerId: number;

  beforeAll(async () => {
    const ctx: TrpcContext = {
      user: {
        id: 1,
        openId: "test-user",
        email: "test@test.com",
        name: "Test User",
        loginMethod: "test",
        role: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: {} as any,
      res: {} as any,
    };
    caller = appRouter.createCaller(ctx);

    // Create a test customer
    const res = await db.createCustomer({
      code: "WT_" + Date.now(),
      name: "Wire Transfer Test Customer",
      groupKey: "WIRE_TEST_" + Date.now(),
      branch: "Test",
      tier: "New",
      creditRating: "A",
    });
    testCustomerId = res;
  });

  afterAll(async () => {
    // Clean up test data - delete wire transfers for this customer
    if (testCustomerId) {
      const transfers = await db.listWireTransfersByCustomerId(testCustomerId);
      for (const t of transfers) {
        await db.deleteWireTransfer(t.id);
      }
    }
    await purgeTestCustomers(["Wire Transfer Test Customer%"]);
  });

  it("should create a wire transfer", async () => {
    const result = await caller.customers.createWireTransfer({
      customerId: testCustomerId,
      amount: 1000,
      currency: "EUR",
      transferDate: Date.now(),
      status: "Pending",
      referenceNumber: "REF123",
      notes: "Test wire transfer",
    });

    expect(result.success).toBe(true);
    expect(result.id).toBeDefined();
  });

  it("should list wire transfers", async () => {
    // Create a wire transfer first
    await caller.customers.createWireTransfer({
      customerId: testCustomerId,
      amount: 500,
      currency: "EUR",
      transferDate: Date.now(),
      status: "Pending",
    });

    const transfers = await caller.customers.listWireTransfers({
      customerId: testCustomerId,
    });

    expect(Array.isArray(transfers)).toBe(true);
    expect(transfers.length).toBeGreaterThan(0);
  });

  it("should update wire transfer status", async () => {
    // Create a wire transfer
    const createRes = await caller.customers.createWireTransfer({
      customerId: testCustomerId,
      amount: 750,
      currency: "EUR",
      transferDate: Date.now(),
      status: "Pending",
    });

    // Update status to Received
    const updateRes = await caller.customers.updateWireTransfer({
      id: createRes.id,
      customerId: testCustomerId,
      status: "Received",
      receivedDate: Date.now(),
    });

    expect(updateRes.success).toBe(true);

    // Verify the update
    const transfers = await caller.customers.listWireTransfers({
      customerId: testCustomerId,
    });
    const updated = transfers.find((t) => t.id === createRes.id);
    expect(updated?.status).toBe("Received");
  });

  it("should delete a wire transfer", async () => {
    // Create a wire transfer
    const createRes = await caller.customers.createWireTransfer({
      customerId: testCustomerId,
      amount: 250,
      currency: "EUR",
      transferDate: Date.now(),
      status: "Pending",
    });

    const transferId = createRes.id;

    // Delete it
    const deleteRes = await caller.customers.deleteWireTransfer({
      id: transferId,
      customerId: testCustomerId,
    });

    expect(deleteRes.success).toBe(true);

    // Verify deletion
    const transfers = await caller.customers.listWireTransfers({
      customerId: testCustomerId,
    });
    const deleted = transfers.find((t) => t.id === transferId);
    expect(deleted).toBeUndefined();
  });

  it("should persist the branch field on create and update", async () => {
    const createRes = await caller.customers.createWireTransfer({
      customerId: testCustomerId,
      amount: 1200,
      currency: "USD",
      branch: "Fujairah Test Branch",
      transferDate: Date.now(),
      status: "Pending",
    });

    let transfers = await caller.customers.listWireTransfers({ customerId: testCustomerId });
    let row = transfers.find((t) => t.id === createRes.id);
    expect(row?.branch).toBe("Fujairah Test Branch");
    expect(row?.currency).toBe("USD");

    await caller.customers.updateWireTransfer({
      id: createRes.id,
      customerId: testCustomerId,
      branch: "Rotterdam Test Branch",
    });

    transfers = await caller.customers.listWireTransfers({ customerId: testCustomerId });
    row = transfers.find((t) => t.id === createRes.id);
    expect(row?.branch).toBe("Rotterdam Test Branch");
  });

  it("should return distinct branches via listBranches", async () => {
    const branches = await caller.customers.listBranches();
    expect(Array.isArray(branches)).toBe(true);
    // Distinct + sorted, no empty values
    expect(new Set(branches).size).toBe(branches.length);
    expect(branches.every((b) => typeof b === "string" && b.length > 0)).toBe(true);
  });

  /**
   * A remittance can arrive as a bank wire, a cheque or a card payment. Callers
   * that do not say (ERP imports, older code) must keep behaving as bank wires.
   */
  it("defaults the remittance method to Transfer and persists cheque/card", async () => {
    const wire = await caller.customers.createWireTransfer({
      customerId: testCustomerId,
      amount: 400,
      currency: "EUR",
      transferDate: Date.now(),
      status: "Pending",
    });
    const cheque = await caller.customers.createWireTransfer({
      customerId: testCustomerId,
      amount: 410,
      currency: "EUR",
      transferDate: Date.now(),
      status: "Pending",
      method: "Cheque",
      referenceNumber: "CHQ-0001",
    });
    const card = await caller.customers.createWireTransfer({
      customerId: testCustomerId,
      amount: 420,
      currency: "EUR",
      transferDate: Date.now(),
      status: "Pending",
      method: "Credit Card",
    });

    const rows = await caller.customers.listWireTransfers({ customerId: testCustomerId });
    const byId = new Map(rows.map((r: any) => [r.id, r]));
    expect((byId.get(wire.id) as any).method).toBe("Transfer");
    expect((byId.get(cheque.id) as any).method).toBe("Cheque");
    expect((byId.get(card.id) as any).method).toBe("Credit Card");

    // The method can be corrected later (e.g. a cheque logged as a wire).
    await caller.customers.updateWireTransfer({
      id: wire.id,
      customerId: testCustomerId,
      method: "Cheque",
    });
    const after = await caller.customers.listWireTransfers({ customerId: testCustomerId });
    expect((after.find((r: any) => r.id === wire.id) as any).method).toBe("Cheque");

    // The method reaches the global list too, which is what the page renders.
    const all = await caller.customers.getAllWireTransfers();
    expect((all.find((r: any) => r.id === card.id) as any).method).toBe("Credit Card");
  });

  it("should count received wire transfers as collected in groupForecast", async () => {
    const cust = await db.getCustomer(testCustomerId);
    const groupKey = (cust?.customerGroup ?? "").trim() || cust?.name;
    expect(groupKey).toBeTruthy();

    const before = await caller.customers.groupForecast({ group: groupKey! });
    const baseCollected = Number(before?.collected ?? 0);

    const createRes = await caller.customers.createWireTransfer({
      customerId: testCustomerId,
      amount: 3210,
      currency: "EUR",
      branch: "Fujairah Test Branch",
      transferDate: Date.now(),
      status: "Received",
      receivedDate: Date.now(),
    });

    const after = await caller.customers.groupForecast({ group: groupKey! });
    expect(Number(after?.collected ?? 0)).toBeCloseTo(baseCollected + 3210, 2);

    // Pending transfers must NOT count as collected
    const pendingRes = await caller.customers.createWireTransfer({
      customerId: testCustomerId,
      amount: 999,
      currency: "EUR",
      transferDate: Date.now(),
      status: "Pending",
    });
    const after2 = await caller.customers.groupForecast({ group: groupKey! });
    expect(Number(after2?.collected ?? 0)).toBeCloseTo(baseCollected + 3210, 2);

    await db.deleteWireTransfer(createRes.id);
    await db.deleteWireTransfer(pendingRes.id);
  });
});

describe("Wire Transfer Allocation (Συμψηφισμός, group-level)", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;
  const groupKey = "WTALLOC_GROUP_" + Date.now();
  let senderId: number; // "DYNACOM"-like company sending the money
  let sisterId: number; // "CREST"-like sister company whose invoices get settled
  let invoiceA: number; // sister invoice 6000
  let invoiceB: number; // sister invoice 5000
  let transferId: number; // received transfer 10000 from sender
  const createdInvoices: number[] = [];
  const createdTransfers: number[] = [];

  beforeAll(async () => {
    const ctx: TrpcContext = {
      user: {
        id: 1,
        openId: "test-user",
        email: "test@test.com",
        name: "Test User",
        loginMethod: "test",
        role: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: {} as any,
      res: {} as any,
    };
    caller = appRouter.createCaller(ctx);

    senderId = await db.createCustomer({
      code: "WTA_SND_" + Date.now(),
      name: "Alloc Sender Test " + Date.now(),
      customerGroup: groupKey,
      tier: "New",
    } as any);
    sisterId = await db.createCustomer({
      code: "WTA_SIS_" + Date.now(),
      name: "Alloc Sister Test " + Date.now(),
      customerGroup: groupKey,
      tier: "New",
    } as any);

    const now = Date.now();
    invoiceA = await db.createInvoice({
      customerId: sisterId,
      invoiceNumber: "WTA-INV-A-" + now,
      company: "Prime Products LTD",
      currency: "EUR",
      issueDate: now - 40 * 86400000,
      dueDate: now - 10 * 86400000,
      amount: "6000" as any,
      paidAmount: "0" as any,
      status: "Open" as any,
    } as any);
    invoiceB = await db.createInvoice({
      customerId: sisterId,
      invoiceNumber: "WTA-INV-B-" + now,
      company: "Prime Products LTD",
      currency: "EUR",
      issueDate: now - 40 * 86400000,
      dueDate: now - 5 * 86400000,
      amount: "5000" as any,
      paidAmount: "0" as any,
      status: "Open" as any,
    } as any);
    createdInvoices.push(invoiceA, invoiceB);

    const wt = await caller.customers.createWireTransfer({
      customerId: senderId,
      amount: 10000,
      currency: "EUR",
      transferDate: now,
      status: "Received",
      receivedDate: now,
    });
    transferId = wt.id;
    createdTransfers.push(transferId);
  });

  afterAll(async () => {
    // Remove allocations first, then transfers, invoices, customers
    for (const tid of createdTransfers) {
      // Cross-branch allocations auto-create derived inter-office transfers;
      // drop them too, or they linger as orphan rows once the fixture
      // customers are purged.
      await db.deleteInternalTransfersBySource(tid);
      const allocs = await db.listAllocationsByWireTransfer(tid);
      for (const a of allocs) {
        await db.deleteInternalTransfersByAllocation(a.id);
        await db.deleteWireTransferAllocation(a.id);
      }
      await db.deleteWireTransfer(tid);
    }
    // Mark fixture invoices as Paid so they never appear in open-invoice lists
    for (const invId of createdInvoices) {
      await db.updateInvoice(invId, { status: "Paid" as any });
    }
    // Purge fixture customers whose invoices were only test fixtures: delete the
    // fixture invoices first so the safety check in purgeTestCustomers passes.
    const dbi = await db.getDb();
    if (dbi) {
      const { sql } = await import("drizzle-orm");
      await dbi.execute(sql`DELETE FROM invoices WHERE invoiceNumber LIKE 'WTA-INV-%'`);
    }
    await purgeTestCustomers(["Alloc Sender Test%", "Alloc Sister Test%", "Alloc Stranger Test%"]);
  });

  it("lists open invoices of the whole group (sister company included)", async () => {
    const rows = await caller.customers.listGroupOpenInvoices({ customerId: senderId });
    const ids = rows.map(r => r.id);
    expect(ids).toContain(invoiceA);
    expect(ids).toContain(invoiceB);
    const a = rows.find(r => r.id === invoiceA)!;
    expect(a.customerId).toBe(sisterId);
    expect(a.outstandingOriginal).toBeCloseTo(6000, 2);
  });

  it("allocates across group: full invoice → Paid, partial → Partially Paid", async () => {
    const res = await caller.customers.allocateWireTransfer({
      wireTransferId: transferId,
      allocations: [
        { invoiceId: invoiceA, amount: 6000 },
        { invoiceId: invoiceB, amount: 3000 },
      ],
    });
    expect(res.success).toBe(true);

    const invA = await db.getInvoice(invoiceA);
    const invB = await db.getInvoice(invoiceB);
    expect(invA?.status).toBe("Paid");
    expect(Number(invA?.paidAmount)).toBeCloseTo(6000, 2);
    expect(invB?.status).toBe("Partially Paid");
    expect(Number(invB?.paidAmount)).toBeCloseTo(3000, 2);

    // Transfer now shows 9000 allocated / 1000 unallocated
    const transfers = await caller.customers.getAllWireTransfers();
    const t = transfers.find(x => x.id === transferId)!;
    expect(Number(t.allocatedAmount)).toBeCloseTo(9000, 2);
    expect(Number(t.unallocatedAmount)).toBeCloseTo(1000, 2);
  });

  it("rejects allocation exceeding the transfer's remaining amount", async () => {
    await expect(
      caller.customers.allocateWireTransfer({
        wireTransferId: transferId,
        allocations: [{ invoiceId: invoiceB, amount: 1500 }], // remaining is 1000
      })
    ).rejects.toThrow(/exceeds transfer amount/i);
  });

  it("rejects allocation exceeding the invoice's outstanding", async () => {
    // invoiceB outstanding is 2000; transfer remaining 1000 — use a small transfer to isolate the invoice check
    const wt2 = await caller.customers.createWireTransfer({
      customerId: senderId,
      amount: 50000,
      currency: "EUR",
      transferDate: Date.now(),
      status: "Received",
      receivedDate: Date.now(),
    });
    createdTransfers.push(wt2.id);
    await expect(
      caller.customers.allocateWireTransfer({
        wireTransferId: wt2.id,
        allocations: [{ invoiceId: invoiceB, amount: 2500 }], // outstanding is 2000
      })
    ).rejects.toThrow(/exceeds outstanding/i);
  });

  it("rejects allocation on a Pending (not received) transfer", async () => {
    const wtP = await caller.customers.createWireTransfer({
      customerId: senderId,
      amount: 100,
      currency: "EUR",
      transferDate: Date.now(),
      status: "Pending",
    });
    createdTransfers.push(wtP.id);
    await expect(
      caller.customers.allocateWireTransfer({
        wireTransferId: wtP.id,
        allocations: [{ invoiceId: invoiceB, amount: 50 }],
      })
    ).rejects.toThrow(/only received/i);
  });

  it("rejects allocation to an invoice outside the group", async () => {
    // Create an unrelated customer + invoice
    const strangerId = await db.createCustomer({
      code: "WTA_STR_" + Date.now(),
      name: "Alloc Stranger Test " + Date.now(),
      customerGroup: "OTHER_GROUP_" + Date.now(),
      tier: "New",
    } as any);
    const strangerInv = await db.createInvoice({
      customerId: strangerId,
      invoiceNumber: "WTA-INV-S-" + Date.now(),
      currency: "EUR",
      issueDate: Date.now(),
      dueDate: Date.now(),
      amount: "100" as any,
      paidAmount: "0" as any,
      status: "Open" as any,
    } as any);
    createdInvoices.push(strangerInv);
    await expect(
      caller.customers.allocateWireTransfer({
        wireTransferId: transferId,
        allocations: [{ invoiceId: strangerInv, amount: 100 }],
      })
    ).rejects.toThrow(/does not belong to group/i);
  });

  it("removing an allocation reverts the invoice paidAmount and status", async () => {
    const allocs = await caller.customers.listWireTransferAllocations({ wireTransferId: transferId });
    const allocA = allocs.find(a => a.invoiceId === invoiceA)!;
    expect(allocA).toBeTruthy();
    expect(allocA.invoiceCustomerName).toContain("Alloc Sister Test");

    await caller.customers.removeWireTransferAllocation({ allocationId: allocA.id });

    const invA = await db.getInvoice(invoiceA);
    expect(invA?.status).toBe("Open");
    expect(Number(invA?.paidAmount)).toBeCloseTo(0, 2);

    const transfers = await caller.customers.getAllWireTransfers();
    const t = transfers.find(x => x.id === transferId)!;
    expect(Number(t.allocatedAmount)).toBeCloseTo(3000, 2);
  });

  it("getAllWireTransfers exposes an allocation breakdown (invoice, credited company, branch)", async () => {
    const transfers = await caller.customers.getAllWireTransfers();
    const t = transfers.find(x => x.id === transferId)! as any;
    expect(Array.isArray(t.allocations)).toBe(true);
    // After the previous test only the invoiceB allocation (3000) remains
    const b = t.allocations.find((a: any) => a.invoiceId === invoiceB);
    expect(b).toBeTruthy();
    expect(Number(b.amount)).toBeCloseTo(3000, 2);
    expect(b.creditedCompanyName).toContain("Alloc Sister Test");
    expect(b.creditedCustomerId).toBe(sisterId);
    expect(b.branch).toBe("Prime Products LTD");
    expect(b.invoiceNumber).toContain("WTA-INV-B-");
  });

  it("receiving company sees incoming allocations with source transfer info", async () => {
    const incoming = await caller.customers.listIncomingAllocations({ customerId: sisterId });
    expect(incoming.length).toBeGreaterThan(0);
    const row = incoming.find((r: any) => r.invoiceId === invoiceB)! as any;
    expect(row).toBeTruthy();
    expect(Number(row.amount)).toBeCloseTo(3000, 2);
    expect(row.sourceCustomerId).toBe(senderId);
    expect(row.sourceCustomerName).toContain("Alloc Sender Test");
    expect(Number(row.sourceAmount)).toBeCloseTo(10000, 2);
    expect(row.invoiceBranch).toBe("Prime Products LTD");
    expect(row.invoiceNumber).toContain("WTA-INV-B-");
  });

  it("cross-branch allocation auto-creates an internal inter-office transfer with traceable reference", async () => {
    // Transfer received at "Prime Products LTD", invoice issued by "Prime Products Distribution B.V"
    const now = Date.now();
    const crossInv = await db.createInvoice({
      customerId: sisterId,
      invoiceNumber: "WTA-INV-X-" + now,
      company: "Prime Products Distribution B.V",
      currency: "EUR",
      issueDate: now - 30 * 86400000,
      dueDate: now - 3 * 86400000,
      amount: "450" as any,
      paidAmount: "0" as any,
      status: "Open" as any,
    } as any);
    createdInvoices.push(crossInv);

    const wtX = await caller.customers.createWireTransfer({
      customerId: senderId,
      amount: 2000,
      currency: "EUR",
      transferDate: now,
      branch: "Prime Products LTD",
      status: "Received",
      receivedDate: now,
      referenceNumber: "BANKREF-42",
    });
    createdTransfers.push(wtX.id);

    await caller.customers.allocateWireTransfer({
      wireTransferId: wtX.id,
      allocations: [{ invoiceId: crossInv, amount: 450 }],
    });

    // An internal transfer should now exist referencing the origin
    const all = await caller.customers.getAllWireTransfers();
    const internal = all.find(
      (t: any) => t.isInternal && t.sourceWireTransferId === wtX.id
    ) as any;
    expect(internal).toBeTruthy();
    createdTransfers.push(internal.id);
    expect(Number(internal.amount)).toBeCloseTo(450, 2);
    expect(internal.fromBranch).toBe("Prime Products LTD");
    expect(internal.toBranch).toBe("Prime Products Distribution B.V");
    expect(internal.branch).toBe("Prime Products Distribution B.V");
    expect(internal.referenceNumber).toContain(`INT-WT${wtX.id}`);
    expect(internal.referenceNumber).toContain("BANKREF-42");
    expect(internal.sourceCustomerName).toContain("Alloc Sender Test");

    // Removing the allocation also removes the internal transfer
    const allocs = await caller.customers.listWireTransferAllocations({ wireTransferId: wtX.id });
    await caller.customers.removeWireTransferAllocation({ allocationId: allocs[0].id });
    const after = await caller.customers.getAllWireTransfers();
    expect(after.find((t: any) => t.id === internal.id)).toBeUndefined();
  });

  it("same-branch allocation does NOT create an internal transfer", async () => {
    const now = Date.now();
    const sameInv = await db.createInvoice({
      customerId: sisterId,
      invoiceNumber: "WTA-INV-Y-" + now,
      company: "Prime Products LTD",
      currency: "EUR",
      issueDate: now - 30 * 86400000,
      dueDate: now - 3 * 86400000,
      amount: "300" as any,
      paidAmount: "0" as any,
      status: "Open" as any,
    } as any);
    createdInvoices.push(sameInv);

    const wtY = await caller.customers.createWireTransfer({
      customerId: senderId,
      amount: 500,
      currency: "EUR",
      transferDate: now,
      branch: "Prime Products LTD",
      status: "Received",
      receivedDate: now,
    });
    createdTransfers.push(wtY.id);

    await caller.customers.allocateWireTransfer({
      wireTransferId: wtY.id,
      allocations: [{ invoiceId: sameInv, amount: 300 }],
    });

    const all = await caller.customers.getAllWireTransfers();
    const internal = all.find((t: any) => t.isInternal && t.sourceWireTransferId === wtY.id);
    expect(internal).toBeUndefined();
  });

  it("deleting a wire transfer cascades: reverts invoices, removes allocations and internal transfers", async () => {
    const now = Date.now();
    const inv = await db.createInvoice({
      customerId: sisterId,
      invoiceNumber: "WTA-INV-Z-" + now,
      company: "Prime Products Distribution B.V",
      currency: "EUR",
      issueDate: now - 30 * 86400000,
      dueDate: now - 3 * 86400000,
      amount: "800" as any,
      paidAmount: "0" as any,
      status: "Open" as any,
    } as any);
    createdInvoices.push(inv);

    const wtZ = await caller.customers.createWireTransfer({
      customerId: senderId,
      amount: 1000,
      currency: "EUR",
      transferDate: now,
      branch: "Prime Products LTD",
      status: "Received",
      receivedDate: now,
    });

    await caller.customers.allocateWireTransfer({
      wireTransferId: wtZ.id,
      allocations: [{ invoiceId: inv, amount: 800 }],
    });

    // Invoice became Paid and an internal transfer exists
    const paidInv = await db.getInvoice(inv);
    expect(paidInv?.status).toBe("Paid");
    let all = await caller.customers.getAllWireTransfers();
    expect(all.some((t: any) => t.isInternal && t.sourceWireTransferId === wtZ.id)).toBe(true);

    // Delete the source transfer → everything derived must go away
    await caller.customers.deleteWireTransfer({ id: wtZ.id, customerId: senderId });

    all = await caller.customers.getAllWireTransfers();
    expect(all.find((t: any) => t.id === wtZ.id)).toBeUndefined();
    expect(all.some((t: any) => t.isInternal && t.sourceWireTransferId === wtZ.id)).toBe(false);
    const revertedInv = await db.getInvoice(inv);
    expect(revertedInv?.status).toBe("Open");
    expect(Number(revertedInv?.paidAmount)).toBeCloseTo(0, 2);
  });

  it("cancelPayment on an invoice reverts its allocations, frees the transfer and removes internal transfers", async () => {
    const now = Date.now();
    const inv = await db.createInvoice({
      customerId: sisterId,
      invoiceNumber: "WTA-INV-CP-" + now,
      company: "Prime Products Distribution B.V",
      currency: "EUR",
      issueDate: now - 30 * 86400000,
      dueDate: now - 3 * 86400000,
      amount: "600" as any,
      paidAmount: "0" as any,
      status: "Open" as any,
    } as any);
    createdInvoices.push(inv);

    const wtCp = await caller.customers.createWireTransfer({
      customerId: senderId,
      amount: 900,
      currency: "EUR",
      transferDate: now,
      branch: "Prime Products LTD",
      status: "Received",
      receivedDate: now,
    });
    createdTransfers.push(wtCp.id);

    await caller.customers.allocateWireTransfer({
      wireTransferId: wtCp.id,
      allocations: [{ invoiceId: inv, amount: 600 }],
    });

    // Sanity: invoice Paid, internal transfer created, transfer partially allocated
    expect((await db.getInvoice(inv))?.status).toBe("Paid");
    let all = await caller.customers.getAllWireTransfers();
    expect(all.some((t: any) => t.isInternal && t.sourceWireTransferId === wtCp.id)).toBe(true);

    // Cancel the payment from the invoice side
    const res = await caller.invoices.cancelPayment({ invoiceId: inv });
    expect(res.success).toBe(true);
    expect(res.allocationsRemoved).toBe(1);
    expect(res.newStatus).toBe("Open");

    // Invoice reverted
    const reverted = await db.getInvoice(inv);
    expect(reverted?.status).toBe("Open");
    expect(Number(reverted?.paidAmount)).toBeCloseTo(0, 2);

    // Transfer amount freed (no allocations) and internal transfer gone
    all = await caller.customers.getAllWireTransfers();
    const t = all.find((x: any) => x.id === wtCp.id);
    expect(Number(t?.allocatedAmount ?? 0)).toBeCloseTo(0, 2);
    expect(Number(t?.unallocatedAmount ?? 0)).toBeCloseTo(900, 2);
    expect(all.some((x: any) => x.isInternal && x.sourceWireTransferId === wtCp.id)).toBe(false);

    // Cancelling again should fail (nothing to cancel)
    await expect(caller.invoices.cancelPayment({ invoiceId: inv })).rejects.toThrow();
  });
});
