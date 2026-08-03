import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as db from "./db";
import { taskGroup, taskPromiseId, isTaskOfGroup, followUpMarker } from "./taskMarkers";
import { snapshotIds, cleanupSince, type IdSnapshot } from "./testCleanup";
import { createTestCustomer, cleanupTestCustomer, type TestCustomerFixture } from "./testFixtures";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;
function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "sample-user",
    email: "sample@example.com",
    name: "Sample User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

/**
 * `tasks.customerGroup` / `tasks.promiseId` are the real link between a task and
 * the collections workflow. The `(Follow-up: <group>)` text marker stays in the
 * description for readability and for rows written before the columns existed,
 * but no logic may depend on parsing it any more.
 */
describe("task ↔ group linking uses real columns", () => {
  it("prefers the column over the description marker", () => {
    const task = {
      customerGroup: "EVALEND (TANKERS)",
      description: `Call someone. ${followUpMarker("WRONG GROUP")}`,
    };
    expect(taskGroup(task)).toBe("EVALEND (TANKERS)");
    expect(isTaskOfGroup(task, "EVALEND (TANKERS)")).toBe(true);
    expect(isTaskOfGroup(task, "WRONG GROUP")).toBe(false);
  });

  it("still reads legacy rows that only carry the marker", () => {
    const legacy = {
      customerGroup: null,
      description: `Call them on 05/08/2026. ${followUpMarker("MINERVA (MARTINOS)")}`,
    };
    expect(taskGroup(legacy)).toBe("MINERVA (MARTINOS)");
    expect(isTaskOfGroup(legacy, "MINERVA (MARTINOS)")).toBe(true);
  });

  it("prefers the promise column over the marker", () => {
    expect(taskPromiseId({ promiseId: 42, description: "check it (Promise #7)" })).toBe(42);
    expect(taskPromiseId({ promiseId: null, description: "check it (Promise #7)" })).toBe(7);
    expect(taskPromiseId({ promiseId: null, description: "no marker here" })).toBeNull();
  });

  it("treats a blank column as absent rather than as a group named ''", () => {
    expect(taskGroup({ customerGroup: "   ", description: null })).toBeNull();
    expect(taskGroup({ customerGroup: null, description: null })).toBeNull();
  });
});

describe("created tasks carry the group column", () => {
  let snap: IdSnapshot;
  let fx: TestCustomerFixture;

  beforeAll(async () => {
    snap = await snapshotIds();
    fx = await createTestCustomer("VITESTGRP");
  });

  afterAll(async () => {
    await cleanupSince(snap);
    await cleanupTestCustomer(fx);
  });

  it("a manually created task stores its group", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const created = await caller.tasks.create({
      customerId: fx.id,
      type: "Manual",
      title: "Audit check — group column",
      dueDate: Date.now() + 86400000,
    });
    const taskId = typeof created === "number" ? created : (created as any).id;
    const task = await db.getTask(taskId);
    expect(task).toBeTruthy();
    expect((task as any).customerGroup).toBe(fx.group);
    expect(taskGroup(task as any)).toBe(fx.group);
  });
});
