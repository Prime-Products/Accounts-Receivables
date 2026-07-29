import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { snapshotIds, cleanupSince, type IdSnapshot } from "./testCleanup";
import { appRouter } from "./routers";
import * as db from "./db";
import type { TrpcContext } from "./_core/context";
import type { AuthenticatedUser } from "./_core/context";

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

/** Open (Pending/In Progress) follow-up call tasks carrying the group marker. */
async function openFollowUpTasks(group: string) {
  const tasks = await db.listTasks({ statuses: ["Pending", "In Progress"] });
  const marker = `(Follow-up: ${group})`;
  return tasks.filter(t => t.description?.includes(marker));
}

describe("follow-up task cleanup across status sequences", () => {
  let __snap: IdSnapshot;
  beforeAll(async () => {
    __snap = await snapshotIds();
  });
  afterAll(async () => {
    await cleanupSince(__snap);
  });

  it("Pending Follow-up → Confirmed → Broken leaves no open follow-up task (regression: MSC case)", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const customers = await db.listCustomers();
    const cust = customers[0];
    expect(cust).toBeTruthy();
    const group = (cust.customerGroup ?? "").trim() || cust.name;

    // 1) Pending Follow-up with a date → creates an open follow-up task
    await caller.calls.logCall({
      group,
      customerId: cust.id,
      outcome: "Reached",
      confirmationStatus: "Pending Follow-up",
      confirmationAmount: 1000,
      followUpDate: Date.now() + 4 * 24 * 60 * 60 * 1000,
    });
    expect((await openFollowUpTasks(group)).length).toBeGreaterThan(0);

    // 2) Confirmed (Promise to Pay) → the follow-up task must be cancelled
    await caller.calls.logCall({
      group,
      customerId: cust.id,
      outcome: "Reached",
      confirmationStatus: "Confirmed",
      confirmationAmount: 2000,
      promisedDate: Date.now() + 6 * 24 * 60 * 60 * 1000,
    });
    expect((await openFollowUpTasks(group)).length).toBe(0);

    // 3) Broken → still no open follow-up task, and the open promise is cancelled
    await caller.calls.logCall({
      group,
      customerId: cust.id,
      outcome: "Reached",
      confirmationStatus: "Broken",
    });
    expect((await openFollowUpTasks(group)).length).toBe(0);

    // Cleanup: reset to Not Contacted so no test state leaks
    await caller.calls.updateConfirmationStatus({ group, status: "Not Contacted" });
    expect((await openFollowUpTasks(group)).length).toBe(0);
  });
});
