import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";

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
});
