import { describe, it, expect, afterAll } from "vitest";
import { appRouter } from "./routers";
import { createTestCustomer, createTestInvoice, cleanupTestCustomers, type TestCustomerFixture } from "./testFixtures";
import type { TrpcContext } from "./_core/context";

/**
 * A logged call must produce exactly ONE line in the group's communication
 * timeline. It used to produce two — "Call logged" plus a separate
 * "Promise-to-Pay" — so a single conversation looked like two events.
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
const caller = appRouter.createCaller(createAuthContext());
const created: TestCustomerFixture[] = [];

async function freshGroup(): Promise<TestCustomerFixture> {
  const fx = await createTestCustomer("VTFXLOG");
  await createTestInvoice(fx, { amount: 5000, dueInDays: -5 });
  created.push(fx);
  return fx;
}

async function logs(group: string) {
  const detail: any = await caller.customers.groupDetail({ group });
  return (detail.activityLogs ?? []) as Array<{ title: string; description?: string | null }>;
}

describe("one logged call = one timeline entry", () => {
  afterAll(async () => {
    await cleanupTestCustomers(created);
  });

  it("a call that records a promise writes a single activity-log entry", async () => {
    const fx = await freshGroup();
    const before = (await logs(fx.group)).length;
    await caller.calls.logCall({
      group: fx.group,
      customerId: fx.id,
      outcome: "Reached",
      notes: "Will pay next week",
      confirmationStatus: "Confirmed",
      confirmationAmount: 1500,
      promisedDate: Date.now() + 10 * DAY,
    });
    const after = await logs(fx.group);
    expect(after.length).toBe(before + 1);
    // The single entry names both the call and its outcome.
    expect(after[0].title).toContain("Call");
    expect(after[0].title).toContain("Promise");
    // No standalone promise line alongside it.
    expect(after.filter(l => l.title.startsWith("Promise-to-Pay")).length).toBe(0);
  });

  it("two consecutive promise calls give two entries, not four", async () => {
    const fx = await freshGroup();
    const before = (await logs(fx.group)).length;
    for (const days of [7, 14]) {
      await caller.calls.logCall({
        group: fx.group,
        customerId: fx.id,
        outcome: "Reached",
        confirmationStatus: "Confirmed",
        confirmationAmount: 1000,
        promisedDate: Date.now() + days * DAY,
      });
    }
    expect((await logs(fx.group)).length).toBe(before + 2);
  });

  it("a no-answer call writes exactly one plain entry", async () => {
    const fx = await freshGroup();
    const before = (await logs(fx.group)).length;
    await caller.calls.logCall({ group: fx.group, customerId: fx.id, outcome: "No Answer" });
    const after = await logs(fx.group);
    expect(after.length).toBe(before + 1);
    expect(after[0].title).toBe("Call logged — No Answer");
  });

  it("a follow-up call names the follow-up in its single entry", async () => {
    const fx = await freshGroup();
    const before = (await logs(fx.group)).length;
    await caller.calls.logCall({
      group: fx.group,
      customerId: fx.id,
      outcome: "Reached",
      confirmationStatus: "Pending Follow-up",
      followUpDate: Date.now() + 3 * DAY,
    });
    const after = await logs(fx.group);
    expect(after.length).toBe(before + 1);
    expect(after[0].title).toContain("Follow-up");
  });
});
