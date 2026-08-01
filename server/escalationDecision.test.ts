import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as db from "./db";
import { appRouter } from "./routers";
import { createTestCustomer, cleanupTestCustomer, IdSnapshot } from "./testFixtures";

function makeCaller() {
  return appRouter.createCaller({
    user: { id: 1, openId: "test-open-id", role: "admin" as const, name: "Test User" },
  } as any);
}

/** Create a follow-up task for the fixture group and escalate it, returning the escalated task id. */
async function createEscalatedTask(fx: { id: number; group: string }, snap: IdSnapshot) {
  const taskId = await db.createTask({
    customerId: fx.id,
    title: "Chase overdue balance",
    description: `(Follow-up: ${fx.group})`,
    dueDate: Date.now() + 3 * 24 * 60 * 60 * 1000,
    status: "Pending",
    type: "Follow-up +2",
    assigneeId: 1,
  } as any);
  snap.taskId = Math.max(snap.taskId, taskId);
  const esc = await makeCaller().tasks.escalate({ taskId, assigneeId: 30001, note: "exhausted all options" });
  snap.taskId = Math.max(snap.taskId, esc.newTaskId);
  return esc.newTaskId;
}

describe("Escalation summary & decision", () => {
  let fx: Awaited<ReturnType<typeof createTestCustomer>>;
  let snap: IdSnapshot;

  beforeAll(async () => {
    fx = await createTestCustomer();
    snap = { taskId: 0, promiseId: 0, activityId: 0, auditId: 0 };
  });

  afterAll(async () => {
    await db.setGroupWatchStatus(fx.group, "Auto", null).catch(() => {});
    await cleanupTestCustomer(fx, snap);
  });

  it("escalationSummary returns group snapshot with reason", async () => {
    const escTaskId = await createEscalatedTask(fx, snap);
    const summary = await makeCaller().tasks.escalationSummary({ taskId: escTaskId });
    expect(summary.group).toBe(fx.group);
    expect(typeof summary.openBalanceEur).toBe("number");
    expect(typeof summary.overdueEur).toBe("number");
    expect(summary.escalationReason).toContain("⬆ Escalated");
    expect(summary.escalationReason).toContain("exhausted all options");
    // The panel now tells the story, so the snapshot carries timeline counters
    // rather than a raw activity list.
    expect(typeof summary.stats.events).toBe("number");
    expect(typeof summary.stats.calls).toBe("number");
  });

  it("On Hold decision flags the group and keeps the task open", async () => {
    const escTaskId = await createEscalatedTask(fx, snap);
    const res = await makeCaller().tasks.escalationDecision({
      taskId: escTaskId,
      decision: "On Hold",
      note: "stop services until 50% paid",
    });
    expect(res.success).toBe(true);

    const task = await db.getTask(escTaskId);
    expect(task?.status).toBe("Pending"); // stays open
    expect(task?.description).toContain("⚖ Decision: On Hold");

    const watch = await db.getGroupWatchStatus(fx.group);
    expect(watch?.status).toBe("On Hold");
  });

  it("Legal Review decision sets the group's Legal status", async () => {
    const escTaskId = await createEscalatedTask(fx, snap);
    const res = await makeCaller().tasks.escalationDecision({
      taskId: escTaskId,
      decision: "Legal Review",
    });
    expect(res.success).toBe(true);

    const watch = await db.getGroupWatchStatus(fx.group);
    expect(watch?.status).toBe("Legal");

    const task = await db.getTask(escTaskId);
    expect(task?.description).toContain("⚖ Decision: Legal Review");
  });

  it("Return to Collector reassigns the task with instructions", async () => {
    const escTaskId = await createEscalatedTask(fx, snap);
    const res = await makeCaller().tasks.escalationDecision({
      taskId: escTaskId,
      decision: "Return to Collector",
      returnToMemberId: 30002,
      note: "offer a 3-instalment plan",
    });
    expect(res.success).toBe(true);
    expect(res.returnedToName).toBeDefined();

    const task = await db.getTask(escTaskId);
    expect(task?.status).toBe("Pending");
    expect(task?.assigneeId).toBe(30002);
    expect(task?.description).toContain("⚖ Decision: Return to Collector");
    expect(task?.description).toContain("offer a 3-instalment plan");
    // Due date is pulled to today so the returned task is immediately actionable.
    expect(Math.abs((task?.dueDate ?? 0) - Date.now())).toBeLessThan(60_000);
  });

  it("decision on a closed task is rejected", async () => {
    const escTaskId = await createEscalatedTask(fx, snap);
    await db.updateTask(escTaskId, { status: "Completed" } as any);
    await expect(
      makeCaller().tasks.escalationDecision({ taskId: escTaskId, decision: "On Hold" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
