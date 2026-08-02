import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";
import { snapshotIds, cleanupSince, type IdSnapshot } from "./testCleanup";

// --- isolated fixture customer (post-incident: never touch real customers) ---
import { createTestCustomer, cleanupTestCustomer, type TestCustomerFixture } from "./testFixtures";
let __fx: TestCustomerFixture | null = null;
async function getFixtureCustomer() {
  if (!__fx) __fx = await createTestCustomer();
  return { id: __fx.id, name: __fx.name, customerGroup: __fx.group };
}
afterAll(async () => {
  if (__fx) await cleanupTestCustomer(__fx);
});


function makeCaller() {
  return appRouter.createCaller({
    user: { id: 1, openId: "test", name: "Test User", email: "t@t.t", role: "admin" as const },
  } as any);
}

let snap: IdSnapshot;
beforeAll(async () => {
  snap = await snapshotIds();
});
afterAll(async () => {
  await cleanupSince(snap);
});

describe("follow-up task actions", () => {
  it("logCall accepts Promise to Pay without an amount (date still mandatory)", async () => {
    const caller = makeCaller();
    const cust = await getFixtureCustomer();
    expect(cust).toBeTruthy();
    const group = (cust!.customerGroup ?? "").trim() || cust!.name;

    // Missing date must still be rejected
    await expect(
      caller.calls.logCall({ group, outcome: "Reached", confirmationStatus: "Confirmed" }),
    ).rejects.toThrow(/promised payment date/i);

    // No amount + a date → the promise is created (a call never creates a task)
    const promisedDate = Date.now() + 3 * 24 * 3600 * 1000;
    const res = await caller.calls.logCall({
      group,
      outcome: "Reached",
      confirmationStatus: "Confirmed",
      promisedDate,
      notes: "no-amount promise test",
    });
    expect(res.success).toBe(true);

    const conf = await db.getGroupConfirmationStatus(group);
    expect(conf?.status).toBe("Confirmed");
    expect(Number(conf?.amount)).toBe(0);

    // A promise record with amount 0 exists, and no task was generated for it
    const promises = await db.listPromises();
    const open = promises
      .filter(p => p.status === "Pending" && Number(p.amount) === 0)
      .sort((a, b) => b.id - a.id);
    expect(open.length).toBeGreaterThan(0);
    const tasksAfter = await db.listTasks({ statuses: ["Pending", "In Progress"] });
    expect(tasksAfter.some(t => t.description?.includes(`(Promise #${open[0].id})`))).toBe(false);
  });

  it("converts a follow-up task to a Promise to Pay (new task, status change, old task cancelled)", async () => {
    const caller = makeCaller();
    // Pick a real group with customers
    const cust = await getFixtureCustomer();
    expect(cust).toBeTruthy();
    const group = (cust!.customerGroup ?? "").trim() || cust!.name;

    // Create a follow-up via updateConfirmationStatus → Pending Follow-up
    const followUpDate = Date.now() + 2 * 24 * 3600 * 1000;
    await caller.calls.updateConfirmationStatus({
      group,
      status: "Pending Follow-up",
      followUpDate,
      notes: "test follow-up",
    });
    const openTasks = await db.listTasks({ statuses: ["Pending", "In Progress"] });
    const fuTask = openTasks.find(t => t.description?.includes(`(Follow-up: ${group})`));
    expect(fuTask).toBeTruthy();

    // Convert it to a Promise to Pay
    const promisedDate = Date.now() + 5 * 24 * 3600 * 1000;
    const res = await caller.tasks.convertFollowUpToPromise({
      taskId: fuTask!.id,
      amount: 1234,
      promisedDate,
      notes: "converted in test",
    });
    expect(res.success).toBe(true);
    expect(res.promiseId).toBeGreaterThan(0);

    // Old task cancelled
    const oldTask = await db.getTask(fuTask!.id);
    expect(oldTask?.status).toBe("Cancelled");

    // Confirmation status is now Confirmed
    const conf = await db.getGroupConfirmationStatus(group);
    expect(conf?.status).toBe("Confirmed");
    expect(Number(conf?.amount)).toBe(1234);

    // A new Promise check task exists
    const tasksAfter = await db.listTasks({ statuses: ["Pending", "In Progress"] });
    const ptpTask = tasksAfter.find(t => t.description?.includes(`(Promise #${res.promiseId})`));
    expect(ptpTask).toBeTruthy();
  });

  it("rejects converting a non-follow-up task", async () => {
    const caller = makeCaller();
    const cust = await getFixtureCustomer();
    const taskId = await db.createTask({
      customerId: cust.id,
      type: "Manual",
      title: "Regular task (test)",
      description: "Just a regular task",
      dueDate: Date.now() + 24 * 3600 * 1000,
      status: "Pending",
      assignedTo: 1,
    });
    await expect(
      caller.tasks.convertFollowUpToPromise({
        taskId: Number(taskId),
        amount: 100,
        promisedDate: Date.now() + 24 * 3600 * 1000,
      })
    ).rejects.toThrow(/not a follow-up task/i);
  });

  it("reschedules an open promise from its check task (new date/amount, badge in sync)", async () => {
    const caller = makeCaller();
    const cust = await getFixtureCustomer();
    const group = (cust!.customerGroup ?? "").trim() || cust!.name;

    // Create a promise via a confirmed call
    const firstDate = Date.now() + 3 * 24 * 3600 * 1000;
    await caller.calls.updateConfirmationStatus({
      group,
      status: "Confirmed",
      amount: 500,
      followUpDate: firstDate,
    });
    const openTasks = await db.listTasks({ statuses: ["Pending", "In Progress"] });
    const promises = await db.listPromises({ status: "Pending" });
    const promise = promises
      .filter(p => p.customerId === cust.id)
      .sort((a, b) => b.id - a.id)[0];
    expect(promise).toBeTruthy();
    const ptpTask = openTasks.find(t => t.description?.includes(`(Promise #${promise.id})`));
    expect(ptpTask).toBeTruthy();

    // Reschedule from the task
    const newDate = Date.now() + 10 * 24 * 3600 * 1000;
    const res = await caller.tasks.reschedulePromise({
      taskId: ptpTask!.id,
      promiseId: promise.id,
      amount: 750,
      promisedDate: newDate,
      notes: "customer moved the payment (test)",
    });
    expect(res.success).toBe(true);

    // Promise updated
    const updated = await db.getPromise(promise.id);
    expect(Number(updated?.amount)).toBe(750);
    expect(Math.abs(Number(updated?.promisedDate) - newDate)).toBeLessThan(1000);

    // Linked task moved
    const movedTask = await db.getTask(ptpTask!.id);
    expect(Math.abs(Number(movedTask?.dueDate) - newDate)).toBeLessThan(1000);
    expect(movedTask?.title).toContain("750");

    // Confirmed badge stays with updated amount
    const conf = await db.getGroupConfirmationStatus(group);
    expect(conf?.status).toBe("Confirmed");
    expect(Number(conf?.amount)).toBe(750);
  });

  it("rolls a promise task into the next follow-up (createNextTask): promise resolved, old task cancelled, new follow-up created", async () => {
    const caller = makeCaller();
    const cust = await getFixtureCustomer();
    const group = (cust!.customerGroup ?? "").trim() || cust!.name;

    // Create a promise via a confirmed call
    await caller.calls.updateConfirmationStatus({
      group,
      status: "Confirmed",
      amount: 900,
      followUpDate: Date.now() + 2 * 24 * 3600 * 1000,
    });
    const openTasks = await db.listTasks({ statuses: ["Pending", "In Progress"] });
    const promises = await db.listPromises({ status: "Pending" });
    const promise = promises
      .filter(p => p.customerId === cust.id)
      .sort((a, b) => b.id - a.id)[0];
    expect(promise).toBeTruthy();
    const ptpTask = openTasks.find(t => t.description?.includes(`(Promise #${promise.id})`));
    expect(ptpTask).toBeTruthy();

    // Roll: promise Kept → next step is a Pending Follow-up
    const nextDate = Date.now() + 12 * 24 * 3600 * 1000;
    const res = await caller.tasks.createNextTask({
      taskId: ptpTask!.id,
      resolvePromise: "Kept",
      promiseId: promise.id,
      nextType: "follow-up",
      amount: 300,
      date: nextDate,
      notes: "next cycle (test)",
    });
    expect(res.success).toBe(true);
    expect(res.newTaskId).toBeGreaterThan(0);

    // Old promise resolved and old task cancelled
    expect((await db.getPromise(promise.id))?.status).toBe("Kept");
    expect((await db.getTask(ptpTask!.id))?.status).toBe("Cancelled");

    // New follow-up task exists, badge is Pending Follow-up
    const newTask = await db.getTask(res.newTaskId!);
    expect(newTask?.status).toBe("Pending");
    expect(newTask?.description).toContain(`(Follow-up: ${group})`);
    const conf = await db.getGroupConfirmationStatus(group);
    expect(conf?.status).toBe("Pending Follow-up");
  });

  it("rolls a follow-up task into the next promise (createNextTask): old task cancelled, new promise + check task created", async () => {
    const caller = makeCaller();
    const cust = await getFixtureCustomer();
    const group = (cust!.customerGroup ?? "").trim() || cust!.name;

    await caller.calls.updateConfirmationStatus({
      group,
      status: "Pending Follow-up",
      followUpDate: Date.now() + 2 * 24 * 3600 * 1000,
    });
    const openTasks = await db.listTasks({ statuses: ["Pending", "In Progress"] });
    const fuTask = openTasks.find(t => t.description?.includes(`(Follow-up: ${group})`));
    expect(fuTask).toBeTruthy();

    const nextDate = Date.now() + 9 * 24 * 3600 * 1000;
    const res = await caller.tasks.createNextTask({
      taskId: fuTask!.id,
      nextType: "promise",
      amount: 2500,
      date: nextDate,
    });
    expect(res.success).toBe(true);
    expect(res.newPromiseId).toBeGreaterThan(0);

    // Old follow-up task cancelled
    expect((await db.getTask(fuTask!.id))?.status).toBe("Cancelled");

    // New promise + check task, badge Confirmed with the amount
    const tasksAfter = await db.listTasks({ statuses: ["Pending", "In Progress"] });
    expect(tasksAfter.find(t => t.description?.includes(`(Promise #${res.newPromiseId})`))).toBeTruthy();
    const conf = await db.getGroupConfirmationStatus(group);
    expect(conf?.status).toBe("Confirmed");
    expect(Number(conf?.amount)).toBe(2500);
  });

  it("groupOpenInvoices returns the task group's open invoices sorted by due date", async () => {
    const caller = makeCaller();
    const customers = await db.listCustomers();
    const invoices = await db.listInvoices();
    // find a group that has at least one open invoice
    const withOpen = customers.find(c =>
      invoices.some(i => i.customerId === c.id && i.status !== "Paid" && i.status !== "Cancelled")
    );
    expect(withOpen).toBeTruthy();
    const group = (withOpen!.customerGroup ?? "").trim() || withOpen!.name;
    const taskId = await db.createTask({
      customerId: withOpen!.id,
      type: "Manual",
      title: "Invoice picker test",
      description: `(Follow-up: ${group})`,
      dueDate: Date.now() + 24 * 3600 * 1000,
      status: "Pending",
      assignedTo: 1,
    });
    const res = await caller.tasks.groupOpenInvoices({ taskId: Number(taskId) });
    expect(res.group).toBe(group);
    expect(res.invoices.length).toBeGreaterThan(0);
    for (let i = 1; i < res.invoices.length; i++) {
      expect((res.invoices[i].dueDate ?? 0) >= (res.invoices[i - 1].dueDate ?? 0)).toBe(true);
    }
  });
});
