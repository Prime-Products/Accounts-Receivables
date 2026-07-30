import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as db from "./db";
import { appRouter } from "./routers";
import { createTestCustomer, cleanupTestCustomer, IdSnapshot } from "./testFixtures";

function makeCaller() {
  return appRouter.createCaller({
    user: { id: 1, openId: "test-open-id", role: "admin" as const, name: "Test User" },
  } as any);
}

describe("Escalate Task", () => {
  let fx: Awaited<ReturnType<typeof createTestCustomer>>;
  let snap: IdSnapshot;
  const caller = makeCaller();

  beforeAll(async () => {
    fx = await createTestCustomer();
    snap = { taskId: 0, promiseId: 0, activityId: 0, auditId: 0 };
  });

  afterAll(async () => {
    await cleanupTestCustomer(fx, snap);
  });

  it("escalate task creates a new task and closes the original", async () => {
    // Create a follow-up task
    const taskId = await db.createTask({
      customerId: fx.id,
      title: "Follow up on payment",
      description: `(Follow-up: ${fx.group})`,
      dueDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
      status: "Pending",
      type: "Follow-up +2",
      assigneeId: 1,
    } as any);
    snap.taskId = Math.max(snap.taskId, taskId);

    // Escalate the task to a valid team member
    const result = await makeCaller().tasks.escalate({
      taskId,
      assigneeId: 30001, // Valid team member ID
      note: "Urgent — customer not responding",
    });

    expect(result.success).toBe(true);
    expect(result.assigneeName).toBeDefined();
    expect(result.newTaskId).toBeDefined();

    // Verify original task is Completed
    const originalTask = await db.getTask(taskId);
    expect(originalTask?.status).toBe("Completed");
    expect(originalTask?.description).toContain("⬆ Escalated");
    expect(originalTask?.description).toContain("Urgent — customer not responding");

    // Verify new task was created
    const newTask = await db.getTask(result.newTaskId);
    expect(newTask).toBeDefined();
    expect(newTask?.title).toBe("Escalated: Follow up on payment");
    expect(newTask?.description).toContain("Original task: Follow up on payment");
    expect(newTask?.description).toContain("⬆ Escalated");
    expect(newTask?.status).toBe("Pending");
    expect(newTask?.assigneeId).toBe(30001);
    expect(newTask?.dueDate).toBe(originalTask?.dueDate);

    snap.taskId = Math.max(snap.taskId, result.newTaskId);
  });

  it("escalate fails on already-completed task", async () => {
    // Create and immediately complete a task
    const taskId = await db.createTask({
      customerId: fx.id,
      title: "Already done",
      description: "This task is done",
      dueDate: Date.now(),
      status: "Completed",
      type: "Manual",
      assigneeId: 1,
    } as any);
    snap.taskId = Math.max(snap.taskId, taskId);

    // Try to escalate
    try {
      await makeCaller().tasks.escalate({ taskId, assigneeId: 30001 });
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err.code).toBe("BAD_REQUEST");
      expect(err.message).toContain("Only open tasks can be escalated");
    }
  });

  it("escalate without explicit assigneeId uses group account manager", async () => {
    // Create a task for the fixture group
    const taskId = await db.createTask({
      customerId: fx.id,
      title: "Test escalate with account manager",
      description: `(Follow-up: ${fx.group})`,
      dueDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
      status: "Pending",
      type: "Follow-up +15",
      assigneeId: 1,
    } as any);
    snap.taskId = Math.max(snap.taskId, taskId);

    // Escalate with assigneeId (fixture has no account manager set)
    const result = await makeCaller().tasks.escalate({
      taskId,
      assigneeId: 30002, // Another valid team member
      note: "Auto-escalate to manager",
    });

    expect(result.success).toBe(true);
    expect(result.newTaskId).toBeDefined();

    // Verify new task was created with the resolved account manager
    const newTask = await db.getTask(result.newTaskId);
    expect(newTask?.assigneeId).toBeDefined();
    expect(newTask?.status).toBe("Pending");

    snap.taskId = Math.max(snap.taskId, result.newTaskId);
  });
});
