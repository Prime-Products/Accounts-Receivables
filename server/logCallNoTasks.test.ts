import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { appRouter } from "./routers";
import * as db from "./db";
import { createTestCustomer, createTestInvoice, cleanupTestCustomers, type TestCustomerFixture } from "./testFixtures";

/**
 * Logging a call must be completely independent of tasks (user requirement 2/8):
 * it may not create, edit or cancel a task, and it may not be blocked by one.
 */
const root = join(__dirname, "..");
const caller = () =>
  appRouter.createCaller({ user: { id: 1, openId: "test", name: "Test", role: "admin" } } as any);

const snapshotTasks = async () => {
  const tasks = await db.listTasks();
  return {
    count: tasks.length,
    fingerprint: tasks
      .map(t => `${t.id}:${t.status}:${t.dueDate ?? ""}:${t.title}`)
      .sort()
      .join("|"),
  };
};

describe("Log Call is independent of tasks", () => {
  /**
   * Calls are logged against an isolated fixture group — never against a real
   * customer — so the suite leaves no timeline entries or promises behind in the
   * live collections data.
   */
  let fx: TestCustomerFixture;
  const pickGroup = async () => ({ group: fx.group, customerId: fx.id });

  beforeAll(async () => {
    fx = await createTestCustomer("NOTASKCALL");
    await createTestInvoice(fx);
  });

  afterAll(async () => {
    await cleanupTestCustomers([fx]);
  });

  it("a no-answer call changes nothing in the task list", async () => {
    const { group, customerId } = await pickGroup();
    const before = await snapshotTasks();
    await caller().calls.logCall({ group, customerId, outcome: "No Answer", notes: "vitest: no answer" });
    const after = await snapshotTasks();
    expect(after).toEqual(before);
  }, 60_000);

  it("a Pending Follow-up call records the status but creates no task", async () => {
    const { group, customerId } = await pickGroup();
    const before = await snapshotTasks();
    const followUpDate = Date.now() + 7 * 24 * 60 * 60 * 1000;
    await caller().calls.logCall({
      group,
      customerId,
      outcome: "Reached",
      confirmationStatus: "Pending Follow-up",
      confirmationAmount: 1000,
      followUpDate,
      notes: "vitest: follow up next week",
    });
    const after = await snapshotTasks();
    expect(after).toEqual(before);
    const status = await caller().calls.getConfirmationStatus({ group });
    expect(status?.status).toBe("Pending Follow-up");
  }, 60_000);

  it("a Promise-to-Pay call stores the promise without a check task", async () => {
    const { group, customerId } = await pickGroup();
    const before = await snapshotTasks();
    const promisedDate = Date.now() + 10 * 24 * 60 * 60 * 1000;
    const promisesBefore = (await db.listPromises()).length;
    await caller().calls.logCall({
      group,
      customerId,
      outcome: "Reached",
      confirmationStatus: "Confirmed",
      confirmationAmount: 500,
      promisedDate,
      notes: "vitest: promise to pay",
    });
    const after = await snapshotTasks();
    expect(after).toEqual(before);
    // The promise itself is still recorded — only the task is gone.
    expect((await db.listPromises()).length).toBe(promisesBefore + 1);
  }, 60_000);

  it("switching the status back to Not Contacted cancels no task", async () => {
    const { group, customerId } = await pickGroup();
    const before = await snapshotTasks();
    await caller().calls.logCall({
      group,
      customerId,
      outcome: "Reached",
      confirmationStatus: "Not Contacted",
      notes: "vitest: reset status",
    });
    expect(await snapshotTasks()).toEqual(before);
  }, 60_000);

  it("the call itself is always written to the group timeline", async () => {
    const { group, customerId } = await pickGroup();
    const marker = `vitest timeline ${Date.now()}`;
    await caller().calls.logCall({ group, customerId, outcome: "Reached", confirmationStatus: "Not Contacted", notes: marker });
    const logs = await db.listActivityLog(group, 50);
    expect(logs.some(l => l.activityType === "call" && (l.description ?? "").includes(marker))).toBe(true);
  }, 60_000);

  it("the server never calls the task helpers from logCall", () => {
    const src = readFileSync(join(root, "server/routers/ar.ts"), "utf8");
    const start = src.indexOf("logCall: protectedProcedure");
    const end = src.indexOf("getConfirmationStatus: protectedProcedure", start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const body = src.slice(start, end);
    expect(body).not.toMatch(/upsertFollowUpTask\(/);
    expect(body).not.toMatch(/cleanupStatusArtifacts\(/);
    expect(body).not.toMatch(/createGroupPromise\(/);
    expect(body).not.toMatch(/rescheduleGroupPromise\(/);
    expect(body).not.toMatch(/db\.createTask\(/);
    expect(body).not.toMatch(/db\.updateTask\(/);
  });

  it("the Log Call UI offers no task assignment and no task gate", () => {
    const dialog = readFileSync(join(root, "client/src/components/LogCallDialog.tsx"), "utf8");
    expect(dialog).not.toMatch(/TeamMemberSelect/);
    expect(dialog).not.toMatch(/assigneeId/);
    expect(dialog).not.toMatch(/getOpenFollowUpTask/);
    // The status badges open the call dialog directly instead of a task dialog.
    const groupDetail = readFileSync(join(root, "client/src/pages/GroupDetail.tsx"), "utf8");
    expect(groupDetail).not.toMatch(/TaskDetailDialog/);
    const customers = readFileSync(join(root, "client/src/pages/Customers.tsx"), "utf8");
    expect(customers).not.toMatch(/TaskDetailDialog/);
    expect(customers).not.toMatch(/resetStaleConfirmation/);
  });
});
