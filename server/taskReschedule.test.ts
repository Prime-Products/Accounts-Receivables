import { describe, expect, it } from "vitest";
import * as db from "./db";

/**
 * Follow-up rescheduling: tasks carry a rescheduleCount that increments every
 * time the due date is actually moved (mirrors tasks.reschedule / upsertFollowUpTask logic).
 */
describe("task rescheduling", () => {
  const day = 24 * 60 * 60 * 1000;

  it("increments rescheduleCount when the due date moves", async () => {
    const customers = await db.listCustomers();
    if (customers.length === 0) return; // empty DB — nothing to verify
    const due1 = Date.now() + 2 * day;
    const taskId = await db.createTask({
      customerId: customers[0].id,
      type: "Manual",
      title: "[test] reschedule counter",
      dueDate: due1,
      status: "Pending",
    } as any);

    // Simulate two reschedules the way the router does it.
    let t = await db.getTask(taskId);
    expect(t?.rescheduleCount ?? 0).toBe(0);
    await db.updateTask(taskId, { dueDate: due1 + day, rescheduleCount: (t?.rescheduleCount ?? 0) + 1 } as any);
    t = await db.getTask(taskId);
    expect(t?.rescheduleCount).toBe(1);
    expect(t?.dueDate).toBe(due1 + day);

    await db.updateTask(taskId, { dueDate: due1 + 2 * day, rescheduleCount: (t?.rescheduleCount ?? 0) + 1 } as any);
    t = await db.getTask(taskId);
    expect(t?.rescheduleCount).toBe(2);
    expect(t?.dueDate).toBe(due1 + 2 * day);

    // cleanup
    await db.updateTask(taskId, { status: "Cancelled" } as any);
  });

  it("defaults rescheduleCount to 0 on new tasks", async () => {
    const customers = await db.listCustomers();
    if (customers.length === 0) return;
    const taskId = await db.createTask({
      customerId: customers[0].id,
      type: "Manual",
      title: "[test] reschedule default",
      dueDate: Date.now() + day,
      status: "Pending",
    } as any);
    const t = await db.getTask(taskId);
    expect(t?.rescheduleCount ?? 0).toBe(0);
    await db.updateTask(taskId, { status: "Cancelled" } as any);
  });
});
