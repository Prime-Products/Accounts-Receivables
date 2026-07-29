/**
 * Marking a promise Kept or Broken from the task dialog must update the
 * group's confirmation badge (Promise to Pay → Not Contacted / Not Confirmed).
 */
import { afterAll, describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";
import { purgeTestCustomers } from "./testCleanup";

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

afterAll(async () => {
  await purgeTestCustomers(["PromiseConfSync Test%"]);
});

async function setup(suffix: string) {
  const group = `PromiseConfSync Test ${suffix}`;
  const customerId = await db.createCustomer({
    code: `PCS-${suffix}-${Date.now()}`,
    name: `PromiseConfSync Test ${suffix} Co`,
    customerGroup: group,
  } as any);
  const caller = appRouter.createCaller(createAuthContext());
  await caller.calls.logCall({
    group,
    customerId,
    outcome: "Reached",
    confirmationStatus: "Confirmed",
    confirmationAmount: 500,
    promisedDate: Date.now() + 5 * 24 * 60 * 60 * 1000,
  });
  const conf = await db.getGroupConfirmationStatus(group);
  expect(conf?.status).toBe("Confirmed");
  const promises = await db.listPromises();
  const promise = promises.find(p => p.customerId === customerId && p.status === "Pending");
  expect(promise).toBeDefined();
  return { caller, group, promiseId: promise!.id };
}

describe("promise resolution syncs the confirmation badge", () => {
  it("Kept → badge returns to Not Contacted with amount 0", async () => {
    const { caller, group, promiseId } = await setup("Kept");
    await caller.forecast.updatePromise({ id: promiseId, status: "Kept" });
    const conf = await db.getGroupConfirmationStatus(group);
    expect(conf?.status).toBe("Not Contacted");
    expect(Number(conf?.amount ?? 0)).toBe(0);
  });

  it("Broken → badge becomes Broken (Not Confirmed)", async () => {
    const { caller, group, promiseId } = await setup("Broken");
    await caller.forecast.updatePromise({ id: promiseId, status: "Broken" });
    const conf = await db.getGroupConfirmationStatus(group);
    expect(conf?.status).toBe("Broken");
  });
});
