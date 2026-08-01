import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { snapshotIds, cleanupSince, type IdSnapshot } from "./testCleanup";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";
import { createTestCustomer, cleanupTestCustomer, type TestCustomerFixture } from "./testFixtures";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

/**
 * A call logged as "Promise to Pay" / "Pending Follow-up" auto-creates a task.
 * That task must land on the colleague picked in the Log Call dialog ("Assigned
 * to"), otherwise nobody owns the promise check.
 */
describe("calls.logCall — assignee for the auto-created task", () => {
  let snap: IdSnapshot;
  let fx: TestCustomerFixture;
  let memberA = 0;
  let memberB = 0;

  beforeAll(async () => {
    snap = await snapshotIds();
    fx = await createTestCustomer();
    memberA = await db.createTeamMember({ name: "VT Assignee A" } as any);
    memberB = await db.createTeamMember({ name: "VT Assignee B" } as any);
  });

  afterAll(async () => {
    await cleanupTestCustomer(fx);
    for (const id of [memberA, memberB]) {
      if (id) await db.deleteTeamMember(id).catch(() => {});
    }
    await cleanupSince(snap);
  });

  it("creates the follow-up call task for the chosen team member", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const followUpDate = Date.now() + 5 * 86_400_000;
    await caller.calls.logCall({
      group: fx.group,
      customerId: fx.id,
      outcome: "Reached",
      confirmationStatus: "Pending Follow-up",
      followUpDate,
      assigneeId: memberA,
    });
    const tasks = await db.listTasks({ statuses: ["Pending", "In Progress"] });
    const task = tasks.find(t => t.description?.includes(`(Follow-up: ${fx.group})`));
    expect(task).toBeDefined();
    expect((task as any).assigneeId).toBe(memberA);
  });

  it("hands the follow-up over when a different member is picked, keeping the previous owner as watcher", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const followUpDate = Date.now() + 9 * 86_400_000;
    await caller.calls.logCall({
      group: fx.group,
      customerId: fx.id,
      outcome: "Reached",
      confirmationStatus: "Pending Follow-up",
      followUpDate,
      assigneeId: memberB,
    });
    const tasks = await db.listTasks({ statuses: ["Pending", "In Progress"] });
    const task = tasks.find(t => t.description?.includes(`(Follow-up: ${fx.group})`));
    expect(task).toBeDefined();
    expect((task as any).assigneeId).toBe(memberB);
    const watchers = await db.listTaskWatchers(task!.id);
    expect(watchers.some(w => w.memberId === memberA)).toBe(true);
  });

  it("creates the promise-check task for the chosen team member", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const promisedDate = Date.now() + 12 * 86_400_000;
    await caller.calls.logCall({
      group: fx.group,
      customerId: fx.id,
      outcome: "Reached",
      confirmationStatus: "Confirmed",
      confirmationAmount: 1234,
      promisedDate,
      assigneeId: memberA,
    });
    const tasks = await db.listTasks({ statuses: ["Pending", "In Progress"] });
    const task = tasks.filter(t => t.description?.includes("(Promise #")).sort((a, b) => b.id - a.id)[0];
    expect(task).toBeDefined();
    expect((task as any).assigneeId).toBe(memberA);
  });

  it("rejects an unknown team member", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(
      caller.calls.logCall({
        group: fx.group,
        customerId: fx.id,
        outcome: "Reached",
        confirmationStatus: "Pending Follow-up",
        followUpDate: Date.now() + 86_400_000,
        assigneeId: 999_999,
      })
    ).rejects.toThrow();
  });
});
