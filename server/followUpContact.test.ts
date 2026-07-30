/**
 * The follow-up task created by Log Call (Pending Follow-up) must record the
 * contact selected during the call, so users can see who they spoke with.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { snapshotIds, cleanupSince, type IdSnapshot } from "./testCleanup";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";
import { purgeTestCustomers } from "./testCleanup";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

const GROUP = "FollowUpContact Test Group";

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

afterAll(async () => {
  await purgeTestCustomers(["FollowUpContact Test%"]);
});

describe("follow-up task contact", () => {
  let __snap: IdSnapshot;
  beforeAll(async () => {
    __snap = await snapshotIds();
  });
  afterAll(async () => {
    await cleanupSince(__snap);
  });

  it("includes the selected contact in the follow-up task created by Log Call", async () => {
    const customerId = await db.createCustomer({
      code: `FUC-${Date.now()}`,
      name: "FollowUpContact Test Co",
      customerGroup: GROUP,
    } as any);
    expect(customerId).toBeGreaterThan(0);

    const caller = appRouter.createCaller(createAuthContext());
    const followUpDate = Date.now() + 3 * 24 * 60 * 60 * 1000;
    await caller.calls.logCall({
      group: GROUP,
      customerId,
      contactName: "Maria Kontou",
      outcome: "Reached",
      confirmationStatus: "Pending Follow-up",
      followUpDate,
      notes: "vitest follow-up contact",
    });

    const tasks = await db.listTasks({ statuses: ["Pending", "In Progress"] });
    const task = tasks.find(t => t.description?.includes(`(Follow-up: ${GROUP})`));
    expect(task).toBeDefined();
    expect(task!.description).toContain("Contact: Maria Kontou");
  });

  it("includes the selected contact in the promise task created by Log Call (Promise to Pay)", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const promisedDate = Date.now() + 5 * 24 * 60 * 60 * 1000;
    await caller.calls.logCall({
      group: GROUP,
      contactName: "Nikos Pappas",
      outcome: "Reached",
      confirmationStatus: "Confirmed",
      confirmationAmount: 1000,
      promisedDate,
    });

    const tasks = await db.listTasks({ statuses: ["Pending", "In Progress"] });
    const task = tasks.find(
      t => t.title.startsWith("Promise to Pay") && t.description?.includes("FollowUpContact Test Co")
    );
    expect(task).toBeDefined();
    expect(task!.description).toContain("Contact: Nikos Pappas");
  });
});
