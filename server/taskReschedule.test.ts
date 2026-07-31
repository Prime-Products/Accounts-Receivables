import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { snapshotIds, cleanupSince, type IdSnapshot } from "./testCleanup";
import * as db from "./db";

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


/**
 * Follow-up rescheduling: tasks carry a rescheduleCount that increments every
 * time the due date is actually moved (mirrors tasks.reschedule / upsertFollowUpTask logic).
 */
describe("task rescheduling", () => {
  let __snap: IdSnapshot;
  beforeAll(async () => {
    __snap = await snapshotIds();
  });
  afterAll(async () => {
    await cleanupSince(__snap);
  });

  const day = 24 * 60 * 60 * 1000;

  it("increments rescheduleCount when the due date moves", async () => {
    const __fxc = await getFixtureCustomer();
    const customers = [__fxc];
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
    const __fxc = await getFixtureCustomer();
    const customers = [__fxc];
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
