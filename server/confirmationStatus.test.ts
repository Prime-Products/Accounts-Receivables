import { describe, it, expect } from "vitest";
import * as db from "./db";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "sample-user",
    email: "sample@example.com",
    name: "Sample User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };

  return ctx;
}

describe("Confirmation Status Tracking", () => {
  describe("Database helpers", () => {
    it("should insert and retrieve a confirmation status", async () => {
      const groupName = `test-group-${Date.now()}`;
      
      await db.upsertGroupConfirmationStatus(groupName, {
        status: "Confirmed",
        amount: "50000",
        notes: "Customer confirmed €50k payment",
        updatedBy: 1,
      });

      const result = await db.getGroupConfirmationStatus(groupName);
      expect(result).toBeDefined();
      expect(result?.status).toBe("Confirmed");
      expect(Number(result?.amount)).toBe(50000);
      expect(result?.notes).toBe("Customer confirmed €50k payment");
    });

    it("should update an existing confirmation status", async () => {
      const groupName = `test-group-update-${Date.now()}`;
      
      // Initial insert
      await db.upsertGroupConfirmationStatus(groupName, {
        status: "Not Contacted",
        amount: "0",
        updatedBy: 1,
      });

      // Update
      await db.upsertGroupConfirmationStatus(groupName, {
        status: "Pending Follow-up",
        amount: "30000",
        followUpDate: new Date().getTime() + 7 * 24 * 60 * 60 * 1000,
        notes: "Will call back next week",
        updatedBy: 1,
      });

      const result = await db.getGroupConfirmationStatus(groupName);
      expect(result?.status).toBe("Pending Follow-up");
      expect(Number(result?.amount)).toBe(30000);
      expect(result?.followUpDate).toBeDefined();
    });

    it("should handle all confirmation statuses", async () => {
      const statuses = ["Not Contacted", "Confirmed", "Pending Follow-up", "Broken"];
      
      for (const status of statuses) {
        const groupName = `test-${status}-${Date.now()}`;
        await db.upsertGroupConfirmationStatus(groupName, {
          status: status as any,
          amount: "0",
          updatedBy: 1,
        });

        const result = await db.getGroupConfirmationStatus(groupName);
        expect(result?.status).toBe(status);
      }
    });

    it("should list all confirmation statuses", async () => {
      const groupName1 = `list-test-1-${Date.now()}`;
      const groupName2 = `list-test-2-${Date.now()}`;

      await db.upsertGroupConfirmationStatus(groupName1, {
        status: "Confirmed",
        amount: "50000",
        updatedBy: 1,
      });

      await db.upsertGroupConfirmationStatus(groupName2, {
        status: "Broken",
        amount: "0",
        updatedBy: 1,
      });

      const results = await db.listGroupConfirmationStatuses();
      expect(results.length).toBeGreaterThanOrEqual(2);
      
      const found1 = results.find(r => r.groupName === groupName1);
      const found2 = results.find(r => r.groupName === groupName2);
      
      expect(found1?.status).toBe("Confirmed");
      expect(found2?.status).toBe("Broken");
    });

    it("should handle null confirmation status gracefully", async () => {
      const result = await db.getGroupConfirmationStatus("non-existent-group");
      expect(result).toBeNull();
    });

    it("should store and retrieve follow-up dates correctly", async () => {
      const groupName = `followup-test-${Date.now()}`;
      const followUpDate = new Date().getTime() + 3 * 24 * 60 * 60 * 1000;

      await db.upsertGroupConfirmationStatus(groupName, {
        status: "Pending Follow-up",
        amount: "25000",
        followUpDate,
        notes: "Call on Monday",
        updatedBy: 1,
      });

      const result = await db.getGroupConfirmationStatus(groupName);
      expect(result?.followUpDate).toBe(followUpDate);
    });

    it("should store and retrieve notes correctly", async () => {
      const groupName = `notes-test-${Date.now()}`;
      const notes = "Customer said they will pay after receiving goods. Promised date: 15th of next month.";

      await db.upsertGroupConfirmationStatus(groupName, {
        status: "Confirmed",
        amount: "75000",
        notes,
        updatedBy: 1,
      });

      const result = await db.getGroupConfirmationStatus(groupName);
      expect(result?.notes).toBe(notes);
    });

    it("should track updatedBy user ID", async () => {
      const groupName = `user-track-${Date.now()}`;
      const userId = 42;

      await db.upsertGroupConfirmationStatus(groupName, {
        status: "Confirmed",
        amount: "50000",
        updatedBy: userId,
      });

      const result = await db.getGroupConfirmationStatus(groupName);
      expect(result?.updatedBy).toBe(userId);
    });

    it("should update updatedAt timestamp on each update", async () => {
      const groupName = `timestamp-test-${Date.now()}`;

      await db.upsertGroupConfirmationStatus(groupName, {
        status: "Not Contacted",
        amount: "0",
        updatedBy: 1,
      });

      const result1 = await db.getGroupConfirmationStatus(groupName);
      const firstTimestamp = result1?.updatedAt;

      // Wait a bit and update
      await new Promise(resolve => setTimeout(resolve, 100));

      await db.upsertGroupConfirmationStatus(groupName, {
        status: "Confirmed",
        amount: "50000",
        updatedBy: 1,
      });

      const result2 = await db.getGroupConfirmationStatus(groupName);
      const secondTimestamp = result2?.updatedAt;

      expect(secondTimestamp?.getTime()).toBeGreaterThanOrEqual(firstTimestamp?.getTime() ?? 0);
    });

    it("should handle decimal amounts correctly", async () => {
      const groupName = `decimal-test-${Date.now()}`;
      const amounts = ["50000.50", "1234.99", "100000.00"];

      for (const amount of amounts) {
        const testGroup = `${groupName}-${amount}`;
        await db.upsertGroupConfirmationStatus(testGroup, {
          status: "Confirmed",
          amount,
          updatedBy: 1,
        });

        const result = await db.getGroupConfirmationStatus(testGroup);
        expect(result?.amount).toBe(amount);
      }
    });
  });

  describe("Confirmation Status Workflow", () => {
    it("should transition from Not Contacted to Confirmed", async () => {
      const groupName = `workflow-1-${Date.now()}`;

      // Initial state
      await db.upsertGroupConfirmationStatus(groupName, {
        status: "Not Contacted",
        amount: "0",
        updatedBy: 1,
      });

      let result = await db.getGroupConfirmationStatus(groupName);
      expect(result?.status).toBe("Not Contacted");

      // Transition to Confirmed
      await db.upsertGroupConfirmationStatus(groupName, {
        status: "Confirmed",
        amount: "50000",
        updatedBy: 1,
      });

      result = await db.getGroupConfirmationStatus(groupName);
      expect(result?.status).toBe("Confirmed");
      expect(Number(result?.amount)).toBe(50000);
    });

    it("should transition from Pending Follow-up to Confirmed", async () => {
      const groupName = `workflow-2-${Date.now()}`;

      // Initial state: Pending Follow-up
      await db.upsertGroupConfirmationStatus(groupName, {
        status: "Pending Follow-up",
        amount: "30000",
        followUpDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
        updatedBy: 1,
      });

      let result = await db.getGroupConfirmationStatus(groupName);
      expect(result?.status).toBe("Pending Follow-up");

      // Transition to Confirmed after follow-up call
      await db.upsertGroupConfirmationStatus(groupName, {
        status: "Confirmed",
        amount: "30000",
        followUpDate: null,
        notes: "Confirmed after follow-up call",
        updatedBy: 1,
      });

      result = await db.getGroupConfirmationStatus(groupName);
      expect(result?.status).toBe("Confirmed");
      expect(Number(result?.amount)).toBe(30000);
      expect(result?.notes).toContain("follow-up call");
    });

    it("should transition from Confirmed to Broken", async () => {
      const groupName = `workflow-3-${Date.now()}`;

      // Initial state: Confirmed
      await db.upsertGroupConfirmationStatus(groupName, {
        status: "Confirmed",
        amount: "50000",
        updatedBy: 1,
      });

      // Transition to Broken
      await db.upsertGroupConfirmationStatus(groupName, {
        status: "Broken",
        amount: "0",
        notes: "Customer unable to pay - cash flow issues",
        updatedBy: 1,
      });

      const result = await db.getGroupConfirmationStatus(groupName);
      expect(result?.status).toBe("Broken");
      expect(result?.notes).toContain("cash flow");
    });

    it("should handle multiple follow-up cycles", async () => {
      const groupName = `workflow-followup-${Date.now()}`;

      // First follow-up
      await db.upsertGroupConfirmationStatus(groupName, {
        status: "Pending Follow-up",
        amount: "25000",
        followUpDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
        notes: "First follow-up scheduled",
        updatedBy: 1,
      });

      let result = await db.getGroupConfirmationStatus(groupName);
      expect(result?.status).toBe("Pending Follow-up");

      // Reschedule follow-up
      const newFollowUpDate = Date.now() + 14 * 24 * 60 * 60 * 1000;
      await db.upsertGroupConfirmationStatus(groupName, {
        status: "Pending Follow-up",
        amount: "25000",
        followUpDate: newFollowUpDate,
        notes: "Rescheduled to next week",
        updatedBy: 1,
      });

      result = await db.getGroupConfirmationStatus(groupName);
      expect(result?.followUpDate).toBe(newFollowUpDate);
      expect(result?.notes).toContain("Rescheduled");
    });
  });

  describe("tRPC procedures", () => {
    it("calls.getConfirmationStatus should return confirmation data", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const groupName = `trpc-test-${Date.now()}`;

      // Insert confirmation status
      await db.upsertGroupConfirmationStatus(groupName, {
        status: "Confirmed",
        amount: "50000",
        notes: "Test confirmation",
        updatedBy: 1,
      });

      // Query via tRPC
      const result = await caller.calls.getConfirmationStatus({ group: groupName });
      expect(result).toBeDefined();
      expect(result?.status).toBe("Confirmed");
      expect(Number(result?.amount)).toBe(50000);
    });

    it("calls.updateConfirmationStatus should update status", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const groupName = `trpc-update-${Date.now()}`;

      // Update via tRPC
      await caller.calls.updateConfirmationStatus({
        group: groupName,
        status: "Pending Follow-up",
        amount: 30000,
        followUpDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
        notes: "Updated via tRPC",
      });

      // Verify
      const result = await db.getGroupConfirmationStatus(groupName);
      expect(result?.status).toBe("Pending Follow-up");
      expect(Number(result?.amount)).toBe(30000);
    });

    it("should clear followUpDate when status changes away from Pending Follow-up", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const groupName = `trpc-clear-followup-${Date.now()}`;

      // First: Pending Follow-up with a follow-up date
      await caller.calls.updateConfirmationStatus({
        group: groupName,
        status: "Pending Follow-up",
        amount: 20000,
        followUpDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });

      let result = await db.getGroupConfirmationStatus(groupName);
      expect(result?.status).toBe("Pending Follow-up");
      expect(result?.followUpDate).not.toBeNull();

      // Then: change to Confirmed WITHOUT passing a followUpDate
      await caller.calls.updateConfirmationStatus({
        group: groupName,
        status: "Confirmed",
        amount: 20000,
      });

      result = await db.getGroupConfirmationStatus(groupName);
      expect(result?.status).toBe("Confirmed");
      expect(result?.followUpDate).toBeNull();
    });

    it("logCall should clear followUpDate when confirming after a pending status", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const groupName = `logcall-clear-followup-${Date.now()}`;

      // First call: pending with follow-up date
      await caller.calls.logCall({
        group: groupName,
        outcome: "Reached",
        confirmationStatus: "Pending Follow-up",
        confirmationAmount: 15000,
        followUpDate: Date.now() + 3 * 24 * 60 * 60 * 1000,
      });

      let result = await db.getGroupConfirmationStatus(groupName);
      expect(result?.followUpDate).not.toBeNull();

      // Second call: customer confirms — follow-up must be cleared
      await caller.calls.logCall({
        group: groupName,
        outcome: "Promised Payment",
        confirmationStatus: "Confirmed",
        confirmationAmount: 15000,
      });

      result = await db.getGroupConfirmationStatus(groupName);
      expect(result?.status).toBe("Confirmed");
      expect(result?.followUpDate).toBeNull();
    });
  });
});
