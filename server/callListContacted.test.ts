import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { snapshotIds, cleanupSince, type IdSnapshot } from "./testCleanup";
import { eq } from "drizzle-orm";
import { appRouter } from "./routers";
import * as db from "./db";
import { getDb } from "./db";
import { tasks } from "../drizzle/schema";

function makeCaller() {
  return appRouter.createCaller({
    user: { id: 1, openId: "test-open-id", role: "admin" as const, name: "Tester" },
  } as any);
}

const createdTaskIds: number[] = [];

afterAll(async () => {
  const d = await getDb();
  for (const id of createdTaskIds) {
    await d.delete(tasks).where(eq(tasks.id, id));
  }
});

describe("callList contacted flag", () => {
  let __snap: IdSnapshot;
  beforeAll(async () => {
    __snap = await snapshotIds();
  });
  afterAll(async () => {
    await cleanupSince(__snap);
  });

  it("marks a group contacted when it has an open task, and clears when completed", async () => {
    const caller = makeCaller();
    const before = await caller.customers.callList();
    expect(before.length).toBeGreaterThan(0);

    // Pick a group that is NOT contacted yet and has member ids
    const target = before.find(r => !r.contacted && r.memberIds.length > 0);
    if (!target) return; // all contacted — nothing deterministic to assert

    const customerId = target.memberIds[0];
    const due = Date.now() + 3 * 24 * 60 * 60 * 1000;
    const taskId = await db.createTask({
      title: "Test call follow-up",
      type: "Manual",
      status: "Pending",
      dueDate: due,
      customerId,
    } as any);
    createdTaskIds.push(taskId);

    const after = await caller.customers.callList();
    const row = after.find(r => r.group === target.group);
    expect(row).toBeDefined();
    expect(row!.contacted).toBe(true);
    expect(row!.followUpDate).toBe(due);

    // Complete the task → contacted clears (assuming no other open tasks/promises)
    const d = await getDb();
    await d.update(tasks).set({ status: "Completed" }).where(eq(tasks.id, taskId));

    const final = await caller.customers.callList();
    const rowFinal = final.find(r => r.group === target.group);
    expect(rowFinal).toBeDefined();
    expect(rowFinal!.contacted).toBe(false);
  });
});
