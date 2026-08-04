import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import { createTestCustomer, createTestInvoice, cleanupTestCustomer, type TestCustomerFixture } from "./testFixtures";
import type { TrpcContext } from "./_core/context";

/**
 * The Collections Desk replaced the separate Call Back page: a promise or
 * follow-up date that has arrived must surface on the group's own Desk row via
 * `actionDate` / `actionDue`. These are derived live from the dates, so moving a
 * date in the Log Call moves the marker — nothing is generated or cancelled.
 */
function createAuthContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "sample-user",
      email: "sample@example.com",
      name: "Sample User",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  } as TrpcContext;
}

const DAY = 24 * 60 * 60 * 1000;
/** Dates are stored at UTC midnight; build them the same way the UI does. */
function utcMidnight(offsetDays: number) {
  const d = new Date(Date.now() + offsetDays * DAY);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

describe("Collections Desk action-due flags (replaces the Call Back page)", () => {
  let fx: TestCustomerFixture;
  const caller = appRouter.createCaller(createAuthContext());

  beforeAll(async () => {
    fx = await createTestCustomer("DESKDUE");
    // `customers.groups` only lists invoiced groups, so the fixture needs a ledger row.
    await createTestInvoice(fx, { amount: 5000, dueInDays: -10 });
  });
  afterAll(async () => {
    await cleanupTestCustomer(fx);
  });

  const row = async () => {
    const groups = await caller.customers.groups();
    return groups.find(g => g.group === fx.group) as any;
  };

  it("a future follow-up date is shown but not flagged as due", async () => {
    const future = utcMidnight(5);
    await caller.calls.logCall({
      group: fx.group,
      customerId: fx.id,
      outcome: "Reached",
      confirmationStatus: "Pending Follow-up",
      confirmationAmount: 1000,
      followUpDate: future,
    } as any);
    const g = await row();
    expect(g).toBeTruthy();
    expect(g.actionDate).toBe(future);
    expect(g.actionDue).toBeNull();
  });

  it("a follow-up date of today is flagged as due today", async () => {
    await caller.calls.logCall({
      group: fx.group,
      customerId: fx.id,
      outcome: "Reached",
      confirmationStatus: "Pending Follow-up",
      confirmationAmount: 1000,
      followUpDate: utcMidnight(0),
    } as any);
    const g = await row();
    expect(g.actionDue).toBe("today");
  });

  it("a past follow-up date is flagged as overdue", async () => {
    await caller.calls.logCall({
      group: fx.group,
      customerId: fx.id,
      outcome: "Reached",
      confirmationStatus: "Pending Follow-up",
      confirmationAmount: 1000,
      followUpDate: utcMidnight(-3),
    } as any);
    const g = await row();
    expect(g.actionDue).toBe("overdue");
    expect(g.actionDate).toBe(utcMidnight(-3));
  });

  it("for a Promise to Pay the promised date drives the marker", async () => {
    const promised = utcMidnight(-2);
    await caller.calls.logCall({
      group: fx.group,
      customerId: fx.id,
      outcome: "Reached",
      confirmationStatus: "Confirmed",
      confirmationAmount: 2500,
      promisedDate: promised,
    } as any);
    const g = await row();
    expect(g.confirmationStatus).toBe("Confirmed");
    expect(g.actionDate).toBe(promised);
    expect(g.actionDue).toBe("overdue");
    // Still no task behind it — the marker is pure date arithmetic.
    expect(g.confirmationTaskId ?? null).toBeNull();
  });

  it("the Call Back procedure is gone — the Desk is the only queue", async () => {
    // The router no longer exposes a call-back queue at all.
    expect(Object.keys((appRouter as any)._def.procedures).some(p => p.includes("callBackList"))).toBe(false);
  });
});
