/**
 * Task watchers — add/remove/list, tasks.list inclusion, and escalate carry-over.
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
  let escalatedTaskId = 0;
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
      for (const tid of [taskId, escalatedTaskId].filter(Boolean)) {
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

  it("escalate carries watchers to the new task, excluding the new assignee", async () => {
    const res = await caller.tasks.escalate({
      taskId,
      assigneeId: memberB,
      note: "test escalation with watchers",
      watcherIds: [memberB], // memberB is the assignee — must be excluded
    });
    escalatedTaskId = res.newTaskId;
    const newWatchers = await caller.tasks.watchers({ taskId: res.newTaskId });
    const ids = newWatchers.map(w => w.memberId);
    // The original watcher is carried over, the new assignee is not.
    expect(ids).toContain(memberA);
    expect(ids).not.toContain(memberB);
    /*
     * The escalating collector is added automatically so they can follow
     * management's decision. That only happens when their login is linked to a
     * team member, which is now the case for real users — so the watcher list is
     * memberA plus (optionally) the escalator, and nobody else.
     */
    const escalator = await db.getTeamMemberByUserId(1).catch(() => null);
    const expected = escalator ? [memberA, escalator.id] : [memberA];
    expect(ids.sort()).toEqual(Array.from(new Set(expected)).sort());
  });
});
