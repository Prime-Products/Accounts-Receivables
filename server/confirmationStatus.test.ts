import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { snapshotIds, cleanupSince, type IdSnapshot } from "./testCleanup";
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
  let __snap: IdSnapshot;
  beforeAll(async () => {
    __snap = await snapshotIds();
  });
  afterAll(async () => {
    await cleanupSince(__snap);
  });

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
      // Promise to Pay now carries a target date and stays active until it passes.
      await db.upsertGroupConfirmationStatus(groupName, {
        status: "Confirmed",
        amount: "50000",
        followUpDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
        notes: "Test confirmation",
        updatedBy: 1,
      });

      // Query via tRPC
      const result = await caller.calls.getConfirmationStatus({ group: groupName });
      expect(result).toBeDefined();
      expect(result?.status).toBe("Confirmed");
      expect(Number(result?.amount)).toBe(50000);
    });

    it("paymentContacts.listByGroup returns group contacts with company names", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      // Use a real customer that has payment contacts
      const customers = await db.listCustomers();
      let target: { group: string } | null = null;
      for (const c of customers.slice(0, 50)) {
        const contacts = await db.listPaymentContacts(c.id);
        if (contacts.length > 0) {
          target = { group: (c.customerGroup ?? "").trim() || c.name };
          break;
        }
      }
      if (!target) return; // no contacts in DB — nothing to assert

      const result = await caller.paymentContacts.listByGroup({ group: target.group });
      expect(result.length).toBeGreaterThan(0);
      for (const contact of result) {
        expect(contact.name).toBeTruthy();
        expect(contact.email).toBeTruthy();
        expect(contact.companyName).toBeTruthy();
      }
    });

    it("paymentContacts.listByGroup returns empty array for unknown group", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.paymentContacts.listByGroup({ group: `no-such-group-${Date.now()}` });
      expect(result).toEqual([]);
    });

    it("paymentContacts.listAll returns every contact with company and group names", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.paymentContacts.listAll();
      expect(Array.isArray(result)).toBe(true);
      for (const c of result) {
        expect(c.name).toBeTruthy();
        expect(c.email).toBeTruthy();
        expect(c.companyName).toBeTruthy();
        expect(c.groupName).toBeTruthy();
      }
      // sorted alphabetically by name
      const names = result.map(c => c.name);
      expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
    });

    it("calls.getConfirmationStatus returns data for a second distinct group", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const groupName = `trpc-test-${Date.now()}`;

      // Insert confirmation status
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7); // 7 days in the future
      await db.upsertGroupConfirmationStatus(groupName, {
        status: "Confirmed",
        amount: "50000",
        followUpDate: futureDate.getTime(),
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

      // Second call: customer confirms — promise date is now mandatory and is stored
      // as the confirmation's target date (status stays active until it passes).
      const promisedDate = Date.now() + 5 * 24 * 60 * 60 * 1000;
      await caller.calls.logCall({
        group: groupName,
        outcome: "Reached",
        confirmationStatus: "Confirmed",
        confirmationAmount: 15000,
        promisedDate,
      });

      result = await db.getGroupConfirmationStatus(groupName);
      expect(result?.status).toBe("Confirmed");
      expect(result?.followUpDate).toBe(promisedDate);
    });

    it("logCall with Confirmed creates a Promise-to-Pay for the group's customer", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      // Use a real customer so the promise can attach to it
      const customers = await db.listCustomers();
      expect(customers.length).toBeGreaterThan(0);
      const cust = customers[0];
      const groupName = (cust.customerGroup ?? "").trim() || cust.name;
      const promisedDate = Date.now() + 10 * 24 * 60 * 60 * 1000;
      const amount = 1234.56;

      const before = (await db.listPromises()).filter(p => p.customerId === cust.id).length;

      await caller.calls.logCall({
        group: groupName,
        customerId: cust.id,
        outcome: "Reached",
        confirmationStatus: "Confirmed",
        confirmationAmount: amount,
        promisedDate,
      });

      const promises = (await db.listPromises()).filter(p => p.customerId === cust.id);
      expect(promises.length).toBe(before + 1);
      const latest = promises.sort((a, b) => b.id - a.id)[0];
      expect(Number(latest.amount)).toBeCloseTo(amount, 2);
      expect(latest.promisedDate).toBe(promisedDate);

      // Cleanup: remove the test promise + follow-up task + confirmation row
      const tasks = await db.listTasks({ customerId: cust.id });
      const followUp = tasks.find(t => t.description?.includes(`(Promise #${latest.id})`));
      if (followUp) {
        await db.updateTask(followUp.id, { status: "Completed", completionNotes: "test cleanup", completedAt: Date.now() });
      }
      await db.updatePromise(latest.id, { status: "Kept" });
    });

    it("logCall with Pending Follow-up creates a follow-up task (and reschedules instead of duplicating)", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const customers = await db.listCustomers();
      expect(customers.length).toBeGreaterThan(0);
      const cust = customers[0];
      const groupName = (cust.customerGroup ?? "").trim() || cust.name;
      const marker = `(Follow-up: ${groupName})`;
      const followUpDate = Date.now() + 5 * 24 * 60 * 60 * 1000;

      // First pending call → creates the task
      await caller.calls.logCall({
        group: groupName,
        customerId: cust.id,
        outcome: "Reached",
        confirmationStatus: "Pending Follow-up",
        confirmationAmount: 10000,
        followUpDate,
      });

      let openTasks = await db.listTasks({ statuses: ["Pending", "In Progress"] });
      let followUps = openTasks.filter(t => t.description?.includes(marker));
      expect(followUps.length).toBe(1);
      expect(followUps[0].dueDate).toBe(followUpDate);

      // Second pending call with a new date → reschedules, no duplicate
      const newDate = Date.now() + 12 * 24 * 60 * 60 * 1000;
      await caller.calls.logCall({
        group: groupName,
        customerId: cust.id,
        outcome: "Reached",
        confirmationStatus: "Pending Follow-up",
        confirmationAmount: 12000,
        followUpDate: newDate,
      });

      openTasks = await db.listTasks({ statuses: ["Pending", "In Progress"] });
      followUps = openTasks.filter(t => t.description?.includes(marker));
      expect(followUps.length).toBe(1);
      expect(followUps[0].dueDate).toBe(newDate);

      // Cleanup: complete the test task
      await db.updateTask(followUps[0].id, { status: "Completed", completionNotes: "test cleanup", completedAt: Date.now() });
    });

    it("should reset amount when status changes to Not Contacted or Broken", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const groupName = `trpc-amount-reset-${Date.now()}`;

      // Confirmed with amount
      await caller.calls.updateConfirmationStatus({
        group: groupName,
        status: "Confirmed",
        amount: 50000,
      });
      let result = await db.getGroupConfirmationStatus(groupName);
      expect(Number(result?.amount)).toBe(50000);

      // Change to Not Contacted → amount must reset to 0
      await caller.calls.updateConfirmationStatus({
        group: groupName,
        status: "Not Contacted",
      });
      result = await db.getGroupConfirmationStatus(groupName);
      expect(result?.status).toBe("Not Contacted");
      expect(Number(result?.amount)).toBe(0);

      // Pending Follow-up with a new amount → uses the new value
      await caller.calls.updateConfirmationStatus({
        group: groupName,
        status: "Pending Follow-up",
        amount: 12000,
        followUpDate: Date.now() + 3 * 24 * 60 * 60 * 1000,
      });
      result = await db.getGroupConfirmationStatus(groupName);
      expect(Number(result?.amount)).toBe(12000);

      // Broken → amount resets to 0
      await caller.calls.updateConfirmationStatus({
        group: groupName,
        status: "Broken",
      });
      result = await db.getGroupConfirmationStatus(groupName);
      expect(Number(result?.amount)).toBe(0);
      expect(result?.followUpDate).toBeNull();

      // Cleanup any follow-up task created during this test
      const marker = `(Follow-up: ${groupName})`;
      const openTasks = await db.listTasks({ statuses: ["Pending", "In Progress"] });
      const followUp = openTasks.find(t => t.description?.includes(marker));
      if (followUp) {
        await db.updateTask(followUp.id, { status: "Completed", completionNotes: "test cleanup", completedAt: Date.now() });
      }
    });

    it("reschedules an existing open promise instead of creating a duplicate", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      // Use a real customer so group promise resolution works
      const customers = await db.listCustomers();
      const cust = customers[0];
      expect(cust).toBeTruthy();
      const groupName = (cust.customerGroup ?? "").trim() || cust.name;

      const day = 24 * 60 * 60 * 1000;
      const firstDate = Date.now() + 5 * day;
      const secondDate = Date.now() + 12 * day;

      // First confirmed call → creates a promise
      await caller.calls.logCall({
        group: groupName,
        customerId: cust.id,
        outcome: "Reached",
        confirmationStatus: "Confirmed",
        confirmationAmount: 4321.5,
        promisedDate: firstDate,
      });

      const open1 = await caller.calls.getOpenPromise({ group: groupName });
      expect(open1).toBeTruthy();
      expect(Number(open1!.amount)).toBeCloseTo(4321.5, 1);

      const beforeCount = (await db.listPromises(cust.id)).filter(p => p.status === "Pending").length;

      // Second confirmed call with reschedule → same promise moved, no duplicate
      await caller.calls.logCall({
        group: groupName,
        customerId: cust.id,
        outcome: "Reached",
        confirmationStatus: "Confirmed",
        confirmationAmount: 5000,
        promisedDate: secondDate,
        reschedulePromiseId: open1!.id,
      });

      const afterPending = (await db.listPromises(cust.id)).filter(p => p.status === "Pending");
      expect(afterPending.length).toBe(beforeCount); // no new promise created

      const moved = await db.getPromise(open1!.id);
      expect(Number(moved?.amount)).toBeCloseTo(5000, 1);
      expect(moved?.promisedDate).toBe(secondDate);

      // Linked follow-up task moved to the new date
      const marker = `(Promise #${open1!.id})`;
      const openTasks = await db.listTasks({ statuses: ["Pending", "In Progress"] });
      const linked = openTasks.find(t => t.description?.includes(marker));
      expect(linked).toBeTruthy();
      expect(linked?.dueDate).toBe(secondDate);

      // Cleanup: cancel test promise + complete test task, reset confirmation row
      await db.updatePromise(open1!.id, { status: "Broken", notes: "test cleanup" });
      if (linked) {
        await db.updateTask(linked.id, { status: "Completed", completionNotes: "test cleanup", completedAt: Date.now() });
      }
    });

    it("cancels the follow-up task when status changes away from Pending Follow-up", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const customers = await db.listCustomers();
      const cust = customers[0];
      expect(cust).toBeTruthy();
      const groupName = (cust.customerGroup ?? "").trim() || cust.name;
      const marker = `(Follow-up: ${groupName})`;

      // Pending Follow-up → follow-up task created
      await caller.calls.logCall({
        group: groupName,
        customerId: cust.id,
        outcome: "Reached",
        confirmationStatus: "Pending Follow-up",
        confirmationAmount: 8000,
        followUpDate: Date.now() + 4 * 24 * 60 * 60 * 1000,
      });

      let openTasks = await db.listTasks({ statuses: ["Pending", "In Progress"] });
      expect(openTasks.some(t => t.description?.includes(marker))).toBe(true);

      // Status changes to Not Contacted → follow-up task must be cancelled
      await caller.calls.updateConfirmationStatus({
        group: groupName,
        status: "Not Contacted",
      });

      openTasks = await db.listTasks({ statuses: ["Pending", "In Progress"] });
      expect(openTasks.some(t => t.description?.includes(marker))).toBe(false);
    });

    it("cancels the open promise and its check task when status changes away from Confirmed", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const customers = await db.listCustomers();
      const cust = customers[0];
      expect(cust).toBeTruthy();
      const groupName = (cust.customerGroup ?? "").trim() || cust.name;

      // Confirmed → creates a promise + check task
      await caller.calls.logCall({
        group: groupName,
        customerId: cust.id,
        outcome: "Reached",
        confirmationStatus: "Confirmed",
        confirmationAmount: 7777,
        promisedDate: Date.now() + 9 * 24 * 60 * 60 * 1000,
      });

      const open = await caller.calls.getOpenPromise({ group: groupName });
      expect(open).toBeTruthy();
      const marker = `(Promise #${open!.id})`;

      let openTasks = await db.listTasks({ statuses: ["Pending", "In Progress"] });
      expect(openTasks.some(t => t.description?.includes(marker))).toBe(true);

      // Status changes to Broken → promise cancelled + check task cancelled
      await caller.calls.updateConfirmationStatus({
        group: groupName,
        status: "Broken",
        notes: "customer cannot pay (test)",
      });

      const promiseAfter = await db.getPromise(open!.id);
      expect(promiseAfter?.status).toBe("Broken");

      openTasks = await db.listTasks({ statuses: ["Pending", "In Progress"] });
      expect(openTasks.some(t => t.description?.includes(marker))).toBe(false);
    });
  });

  describe("Expected to Collect / Variance", () => {
    it("groups payload exposes expectedToCollect and expectedVariance", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const groups = await caller.customers.groups();
      expect(groups.length).toBeGreaterThan(0);
      for (const g of groups.slice(0, 20)) {
        expect(typeof (g as any).expectedToCollect).toBe("number");
        expect(typeof (g as any).expectedVariance).toBe("number");
        expect((g as any).expectedVariance).toBeCloseTo(
          (g as any).expectedToCollect - g.forecastExpected,
          2,
        );
      }
    });

    it("Not Contacted → expected equals forecast; Broken → expected is 0; Promise to Pay → expected equals promised amount", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const customers = await db.listCustomers();
      const cust = customers[0];
      expect(cust).toBeTruthy();
      const groupName = (cust.customerGroup ?? "").trim() || cust.name;

      const findGroup = async () => {
        const groups = await caller.customers.groups();
        const g = groups.find(x => x.group === groupName);
        expect(g).toBeTruthy();
        return g! as any;
      };

      // Not Contacted → expected = forecast
      await caller.calls.updateConfirmationStatus({ group: groupName, status: "Not Contacted" });
      let g = await findGroup();
      expect(g.expectedToCollect).toBeCloseTo(g.forecastExpected, 2);
      expect(g.expectedVariance).toBeCloseTo(0, 2);

      // Promise to Pay (DB: Confirmed) → expected = promised amount
      await caller.calls.logCall({
        group: groupName,
        customerId: cust.id,
        outcome: "Reached",
        confirmationStatus: "Confirmed",
        confirmationAmount: 12345,
        promisedDate: Date.now() + 5 * 24 * 60 * 60 * 1000,
      });
      g = await findGroup();
      expect(g.expectedToCollect).toBeCloseTo(12345, 2);
      expect(g.expectedVariance).toBeCloseTo(12345 - g.forecastExpected, 2);

      // Broken → expected = 0
      await caller.calls.updateConfirmationStatus({
        group: groupName,
        status: "Broken",
        notes: "cannot pay (expected/variance test)",
      });
      g = await findGroup();
      expect(g.expectedToCollect).toBe(0);
      expect(g.expectedVariance).toBeCloseTo(-g.forecastExpected, 2);

      // Reset back to Not Contacted so we don't leave test state behind
      await caller.calls.updateConfirmationStatus({ group: groupName, status: "Not Contacted" });
    });

    it("Pending Follow-up → expected equals the pending amount", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const customers = await db.listCustomers();
      const cust = customers[0];
      expect(cust).toBeTruthy();
      const groupName = (cust.customerGroup ?? "").trim() || cust.name;

      await caller.calls.logCall({
        group: groupName,
        customerId: cust.id,
        outcome: "Reached",
        confirmationStatus: "Pending Follow-up",
        confirmationAmount: 6500,
        followUpDate: Date.now() + 3 * 24 * 60 * 60 * 1000,
      });

      const groups = await caller.customers.groups();
      const g = groups.find(x => x.group === groupName) as any;
      expect(g).toBeTruthy();
      expect(g.expectedToCollect).toBeCloseTo(6500, 2);
      expect(g.expectedVariance).toBeCloseTo(6500 - g.forecastExpected, 2);

      // groupDetail must agree with the groups list
      const detail = (await caller.customers.groupDetail({ group: groupName })) as any;
      expect(detail.expectedToCollect).toBeCloseTo(6500, 2);
      expect(detail.expectedVariance).toBeCloseTo(detail.expectedToCollect - detail.forecastExpected, 2);
      expect(typeof detail.forecastInitial).toBe("number");

      // Cleanup: reset to Not Contacted
      await caller.calls.updateConfirmationStatus({ group: groupName, status: "Not Contacted" });
    });
  });
});
