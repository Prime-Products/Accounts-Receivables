/**
 * Task watchers — add/remove/list and tasks.list inclusion.
 * Uses ONLY fixture data (see testFixtures.ts) — never touches real customers.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as db from "./db";
import { appRouter } from "./routers";
import { createTestCustomer, cleanupTestCustomer } from "./testFixtures";
import { getDb } from "./db";
import { teamMembers, taskWatchers } from "../drizzle/schema";
import { eq } from "drizzle-orm";

function makeCaller() {
  return appRouter.createCaller({
    user: { id: 1, openId: "test-open-id", role: "admin" as const, name: "Test User" },
  } as any);
}

describe("Task Watchers", () => {
  let fx: Awaited<ReturnType<typeof createTestCustomer>>;
  let memberA: number;
  let memberB: number;
  let taskId: number;
  const caller = makeCaller();

  beforeAll(async () => {
    fx = await createTestCustomer();
    const d = await getDb();
    if (!d) throw new Error("DB unavailable");
    const [ra] = await d
      .insert(teamMembers)
      .values({ name: `VITESTFIX Watcher Alpha ${Date.now()}`, active: 1 } as any)
      .$returningId();
    const [rb] = await d
      .insert(teamMembers)
      .values({ name: `VITESTFIX Watcher Beta ${Date.now()}`, active: 1 } as any)
      .$returningId();
    memberA = ra.id;
    memberB = rb.id;
    taskId = await db.createTask({
      customerId: fx.id,
      title: "VITESTFIX watcher task",
      description: `(Follow-up: ${fx.group})`,
      dueDate: Date.now() + 86400000,
      status: "Pending",
      type: "Follow-up +2",
      assigneeId: 1,
    } as any);
  });

  afterAll(async () => {
    const d = await getDb();
    if (d) {
      for (const tid of [taskId].filter(Boolean)) {
        await d.delete(taskWatchers).where(eq(taskWatchers.taskId, tid));
      }
      await d.delete(teamMembers).where(eq(teamMembers.id, memberA));
      await d.delete(teamMembers).where(eq(teamMembers.id, memberB));
    }
    await cleanupTestCustomer(fx);
  });

  it("adds watchers (deduped) and lists them", async () => {
    await caller.tasks.addWatcher({ taskId, memberId: memberA });
    await caller.tasks.addWatcher({ taskId, memberId: memberA }); // duplicate — must dedupe
    await caller.tasks.addWatcher({ taskId, memberId: memberB });
    const watchers = await caller.tasks.watchers({ taskId });
    expect(watchers.length).toBe(2);
    expect(watchers.map(w => w.memberId).sort()).toEqual([memberA, memberB].sort());
  });

  it("includes watchers in tasks.list", async () => {
    const list = await caller.tasks.list({});
    const t = list.find((x: any) => x.id === taskId) as any;
    expect(t).toBeTruthy();
    expect(t.watchers?.length).toBe(2);
    expect(t.watchers.map((w: any) => w.memberId).sort()).toEqual([memberA, memberB].sort());
  });

  it("removes a watcher", async () => {
    await caller.tasks.removeWatcher({ taskId, memberId: memberB });
    const watchers = await caller.tasks.watchers({ taskId });
    expect(watchers.length).toBe(1);
    expect(watchers[0].memberId).toBe(memberA);
  });
});
