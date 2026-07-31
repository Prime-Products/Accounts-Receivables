import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import { createTestCustomer, cleanupTestCustomer, TestCustomerFixture } from "./testFixtures";

/**
 * calls.getActiveCommunication — used by the Log Call button to decide whether
 * to show the "open the task or log a new call" choice step.
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

  it("returns the follow-up task when status is Pending Follow-up", async () => {
    const due = Date.now() + 3 * 24 * 3600 * 1000;
    await caller.calls.logCall({
      group: fx.group,
      customerId: fx.id,
      outcome: "Reached",
      confirmationStatus: "Pending Follow-up",
      followUpDate: due,
    } as any);
    const res = await caller.calls.getActiveCommunication({ group: fx.group });
    expect(res).not.toBeNull();
    expect(res!.status).toBe("Pending Follow-up");
    expect(res!.taskId).toBeGreaterThan(0);
    expect(res!.title).toContain(fx.group);
  });

  it("returns the promise-check task when status is Promise to Pay (Confirmed)", async () => {
    const promisedDate = Date.now() + 7 * 24 * 3600 * 1000;
    await caller.calls.logCall({
      group: fx.group,
      customerId: fx.id,
      outcome: "Reached",
      confirmationStatus: "Confirmed",
      confirmationAmount: 1500,
      promisedDate,
    } as any);
    const res = await caller.calls.getActiveCommunication({ group: fx.group });
    expect(res).not.toBeNull();
    expect(res!.status).toBe("Confirmed");
    expect(res!.taskId).toBeGreaterThan(0);
    expect(Number(res!.amount)).toBe(1500);
  });
});
