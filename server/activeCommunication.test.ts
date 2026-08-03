import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import { createTestCustomer, cleanupTestCustomer, TestCustomerFixture } from "./testFixtures";

/**
 * calls.getActiveCommunication used to gate the Log Call button behind an open
 * task. Log Call is now fully independent of tasks, so logging calls must never
 * produce a task to be redirected into.
 */

function makeCaller() {
  return appRouter.createCaller({
    user: { id: 1, openId: "test-open-id", role: "admin" as const, name: "Test User" },
  } as any);
}

describe("calls.getActiveCommunication", () => {
  let fx: TestCustomerFixture;
  const caller = makeCaller();

  beforeAll(async () => {
    fx = await createTestCustomer("ACTIVECOMM");
  });

  afterAll(async () => {
    await cleanupTestCustomer(fx);
  });

  it("returns null when there is no active communication", async () => {
    const res = await caller.calls.getActiveCommunication({ group: fx.group });
    expect(res).toBeNull();
  });

  it("stays null after a Pending Follow-up call — no task is created to open", async () => {
    const due = Date.now() + 3 * 24 * 3600 * 1000;
    await caller.calls.logCall({
      group: fx.group,
      customerId: fx.id,
      outcome: "Reached",
      confirmationStatus: "Pending Follow-up",
      followUpDate: due,
    } as any);
    expect(await caller.calls.getActiveCommunication({ group: fx.group })).toBeNull();
    const status = await caller.calls.getConfirmationStatus({ group: fx.group });
    expect(status?.status).toBe("Pending Follow-up");
  });

  it("stays null after a Promise to Pay call — the promise exists without a task", async () => {
    const promisedDate = Date.now() + 7 * 24 * 3600 * 1000;
    await caller.calls.logCall({
      group: fx.group,
      customerId: fx.id,
      outcome: "Reached",
      confirmationStatus: "Confirmed",
      confirmationAmount: 1500,
      promisedDate,
    } as any);
    expect(await caller.calls.getActiveCommunication({ group: fx.group })).toBeNull();
    const open = await caller.calls.getOpenPromise({ group: fx.group });
    expect(open).toBeTruthy();
    expect(Number(open!.amount)).toBe(1500);
  });
});
