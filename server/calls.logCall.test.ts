import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { snapshotIds, cleanupSince, type IdSnapshot } from "./testCleanup";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";

// --- isolated fixture customer (post-incident: never touch real customers) ---
import { createTestCustomer, cleanupTestCustomer, type TestCustomerFixture } from "./testFixtures";
let __fx: TestCustomerFixture | null = null;
async function getFixtureCustomer() {
  if (!__fx) __fx = await createTestCustomer();
  return { id: __fx.id, name: __fx.name, customerGroup: __fx.group };
}
afterAll(async () => {
  if (__fx) await cleanupTestCustomer(__fx);
});


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

describe("calls.logCall", () => {
  let __snap: IdSnapshot;
  beforeAll(async () => {
    __snap = await snapshotIds();
  });
  afterAll(async () => {
    await cleanupSince(__snap);
  });

  it("records a call in the activity log with outcome and details", async () => {
    const target = await getFixtureCustomer();
    expect(target).toBeDefined();
    const group = (target.customerGroup ?? "").trim() || target.name;
    const caller = appRouter.createCaller(createAuthContext());

    const res = await caller.calls.logCall({
      group,
      customerId: target.id,
      contactName: "Vitest Contact",
      outcome: "Reached",
      notes: "Automated test call log",
    });
    expect(res.success).toBe(true);

    const logs = await db.listActivityLog(group, 50);
    const entry = logs.find(
      l => l.activityType === "call" && l.title.includes("Reached") && (l.description ?? "").includes("Vitest Contact")
    );
    expect(entry).toBeDefined();
    expect(entry!.description).toContain("Automated test call log");
  });

  it("rejects an invalid outcome", async () => {
    const target = await getFixtureCustomer();
    const group = (target.customerGroup ?? "").trim() || target.name;
    const caller = appRouter.createCaller(createAuthContext());
    await expect(caller.calls.logCall({ group, outcome: "Nonsense" as any })).rejects.toThrow();
  });
});
