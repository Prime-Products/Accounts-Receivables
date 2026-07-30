import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { snapshotIds, cleanupSince, type IdSnapshot } from "./testCleanup";
import * as db from "./db";

/**
 * Internal collaboration via tasks:
 * - tasks can carry attached invoices (task_invoices)
 * - tasks have a comment thread (task_comments)
 */
describe("task collaboration", () => {
  let __snap: IdSnapshot;
  beforeAll(async () => {
    __snap = await snapshotIds();
  });
  afterAll(async () => {
    await cleanupSince(__snap);
  });

  it("attaches invoices to a task and lists them back", async () => {
    const customers = await db.listCustomers();
    const invoices = await db.listInvoices();
    if (customers.length === 0 || invoices.length < 2) return; // empty DB — nothing to verify

    const taskId = await db.createTask({
      customerId: customers[0].id,
      type: "Manual",
      title: "[test] collab attach invoices",
      dueDate: Date.now(),
      status: "Pending",
    } as any);
    const invoiceIds = [invoices[0].id, invoices[1].id];
    await db.addTaskInvoices(taskId, invoiceIds);

    const attached = await db.listTaskInvoices(taskId);
    expect(attached.map(a => a.invoiceId).sort()).toEqual([...invoiceIds].sort());

    // listAllTaskInvoices includes this task's rows (used by tasks.list aggregation)
    const all = await db.listAllTaskInvoices();
    expect(all.filter(a => a.taskId === taskId)).toHaveLength(2);

    // cleanup
    await db.updateTask(taskId, { status: "Cancelled" } as any);
  });

  it("adds and lists comments on a task", async () => {
    const customers = await db.listCustomers();
    if (customers.length === 0) return;

    const taskId = await db.createTask({
      customerId: customers[0].id,
      type: "Manual",
      title: "[test] collab comments",
      dueDate: Date.now(),
      status: "Pending",
    } as any);

    const c1 = await db.addTaskComment({ taskId, authorId: null, authorName: "Tester A", body: "Can you check this customer?" });
    await db.addTaskComment({ taskId, authorId: null, authorName: "Tester B", body: "On it — will call them today." });

    const comments = await db.listTaskComments(taskId);
    expect(comments.length).toBe(2);
    expect(comments[0].authorName).toBe("Tester A");
    expect(comments[0].body).toContain("check this customer");
    expect(comments[1].authorName).toBe("Tester B");

    // deleting works
    await db.deleteTaskComment(c1);
    const after = await db.listTaskComments(taskId);
    expect(after.length).toBe(1);

    // cleanup
    await db.deleteTaskComment(after[0].id);
    await db.updateTask(taskId, { status: "Cancelled" } as any);
  });
});
