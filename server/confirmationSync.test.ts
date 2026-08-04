import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";
import { getDb } from "./db";
import { activityLog, auditLogs, tasks as tasksTable, promisesToPay, groupConfirmationStatus } from "../drizzle/schema";
import { gt, eq } from "drizzle-orm";

/**
 * Badge/status sync (user request 30/7):
 * 1. Cancelling a linked follow-up task must reset a "Pending Follow-up" status
 *    so the badge never points at a closed task.
 * 2. calls.resetStaleConfirmation fixes an already-stale status (MINERVA case).
 */

const TEST_GROUP = "VITEST CONFIRM SYNC GROUP";

function makeCaller() {
  return appRouter.createCaller({
    user: { id: 1, openId: "test-open-id", role: "admin" },
  } as any);
}

let snap: { task: number; promise: number; activity: number; audit: number } | null = null;

async function maxId(table: any): Promise<number> {
  const dbo = await getDb();
  const rows = await dbo.select({ id: table.id }).from(table).orderBy(table.id);
  return rows.length ? Number(rows[rows.length - 1].id) : 0;
}

beforeAll(async () => {
  snap = {
    task: await maxId(tasksTable),
    promise: await maxId(promisesToPay),
    activity: await maxId(activityLog),
    audit: await maxId(auditLogs),
  };
});

afterAll(async () => {
  // SAFETY: never delete anything if the snapshot was not captured — deleting with
  // a zero/default snapshot would wipe entire tables (id > 0 matches every row).
  if (!snap) return;
  const dbo = await getDb();
  await dbo.delete(tasksTable).where(gt(tasksTable.id, snap.task));
  await dbo.delete(promisesToPay).where(gt(promisesToPay.id, snap.promise));
  await dbo.delete(activityLog).where(gt(activityLog.id, snap.activity));
  await dbo.delete(auditLogs).where(gt(auditLogs.id, snap.audit));
  await dbo.delete(groupConfirmationStatus).where(eq(groupConfirmationStatus.groupName, TEST_GROUP));
});

describe("confirmation status sync with linked tasks", () => {
  it("cancelling a linked follow-up task resets Pending Follow-up to Not Contacted", async () => {
    const caller = makeCaller();
    // Simulate the Log Call outcome: status Pending Follow-up + auto follow-up task.
    await db.upsertGroupConfirmationStatus(TEST_GROUP, {
      status: "Pending Follow-up",
      amount: "1000.00",
      followUpDate: Date.now() + 86400000,
      updatedBy: 1,
    });
    const taskId = await db.createTask({
      customerId: 1,
      type: "Manual",
      title: `Follow-up call — ${TEST_GROUP}`,
      description: `Call ${TEST_GROUP} to confirm the expected payment. (Follow-up: ${TEST_GROUP})`,
      dueDate: Date.now() + 86400000,
      status: "Pending",
      assignedTo: 1,
    });

    await caller.tasks.updateStatus({ id: taskId, status: "Cancelled" });

    const conf = await db.getGroupConfirmationStatus(TEST_GROUP);
    expect(conf?.status).toBe("Not Contacted");
    const task = await db.getTask(taskId);
    expect(task?.status).toBe("Cancelled");
  });

  it("resetStaleConfirmation resets a stale Pending Follow-up with no open task", async () => {
    const caller = makeCaller();
    // Stale state: status says Pending Follow-up but no open linked task exists.
    await db.upsertGroupConfirmationStatus(TEST_GROUP, {
      status: "Pending Follow-up",
      amount: "500.00",
      followUpDate: Date.now() + 86400000,
      updatedBy: 1,
    });
    const res = await caller.calls.resetStaleConfirmation({ group: TEST_GROUP });
    expect(res.reset).toBe(true);
    const conf = await db.getGroupConfirmationStatus(TEST_GROUP);
    expect(conf?.status).toBe("Not Contacted");
  });

  it("resetStaleConfirmation is a no-op when an open linked task exists", async () => {
    const caller = makeCaller();
    await db.upsertGroupConfirmationStatus(TEST_GROUP, {
      status: "Pending Follow-up",
      amount: "750.00",
      followUpDate: Date.now() + 86400000,
      updatedBy: 1,
    });
    const taskId = await db.createTask({
      customerId: 1,
      type: "Manual",
      title: `Follow-up call — ${TEST_GROUP}`,
      description: `Call ${TEST_GROUP} to confirm the expected payment. (Follow-up: ${TEST_GROUP})`,
      dueDate: Date.now() + 86400000,
      status: "Pending",
      assignedTo: 1,
    });
    const res = await caller.calls.resetStaleConfirmation({ group: TEST_GROUP });
    expect(res.reset).toBe(false);
    const conf = await db.getGroupConfirmationStatus(TEST_GROUP);
    expect(conf?.status).toBe("Pending Follow-up");
    // cleanup within test: cancel task (this also resets status via sync)
    await caller.tasks.updateStatus({ id: taskId, status: "Cancelled" });
  });
});
