import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as db from "./db";
import { appRouter } from "./routers";
import { snapshotIds, cleanupSince, type IdSnapshot } from "./testCleanup";
import { createTestCustomer, cleanupTestCustomer, type TestCustomerFixture } from "./testFixtures";
import type { TrpcContext } from "./_core/context";

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
 * A customer who refuses to commit is the most important collections signal there
 * is. The dialog makes the collector choose a way forward straight away (a new
 * call-back date, or a rescheduled promise), which changes the status — but the
 * refusal itself must never disappear from the history.
 */
describe("a refusal stays in the timeline even when the call ends on another status", () => {
  let snap: IdSnapshot;
  let fixture: TestCustomerFixture;

  beforeAll(async () => {
    snap = await snapshotIds();
    fixture = await createTestCustomer("Not Confirmed Timeline");
  });

  afterAll(async () => {
    await cleanupTestCustomer(fixture);
    await cleanupSince(snap);
  });

  it("records 'Did not confirm → Pending Follow-up' when a call-back date is set after a refusal", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const followUpDate = Date.now() + 3 * 86400000;
    await caller.calls.logCall({
      group: fixture.group,
      outcome: "Reached",
      confirmationStatus: "Pending Follow-up",
      customerResponse: "Broken",
      followUpDate,
      notes: "Says he cannot commit to anything yet.",
    });

    const timeline = await db.listActivityLog(fixture.group, 20);
    const entry = timeline[0];
    expect(entry.title).toContain("Did not confirm");
    expect(entry.title).toContain("Pending Follow-up");
    expect(entry.description ?? "").toContain("Customer response: Did not confirm");

    // The status the group ends on is still the plan, not the refusal.
    const status = await db.getGroupConfirmationStatus(fixture.group);
    expect(status?.status).toBe("Pending Follow-up");
  });

  it("records 'Did not confirm → Promise to Pay' when a promise is rescheduled after a refusal", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const promisedDate = Date.now() + 10 * 86400000;
    await caller.calls.logCall({
      group: fixture.group,
      outcome: "Reached",
      confirmationStatus: "Confirmed",
      customerResponse: "Broken",
      confirmationAmount: 5000,
      promisedDate,
      notes: "Broke the previous promise, agreed a new date under pressure.",
    });

    const timeline = await db.listActivityLog(fixture.group, 20);
    const entry = timeline[0];
    expect(entry.title).toContain("Did not confirm");
    expect(entry.title).toContain("Promise to Pay");
    expect(entry.description ?? "").toContain("Customer response: Did not confirm");
  });

  it("does not duplicate the response when the call ends where it started", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await caller.calls.logCall({
      group: fixture.group,
      outcome: "Reached",
      confirmationStatus: "Broken",
      customerResponse: "Broken",
      notes: "Refused outright, no new date.",
    });

    const timeline = await db.listActivityLog(fixture.group, 20);
    const entry = timeline[0];
    // One mention of the refusal, not "Did not confirm → Did not confirm".
    expect(entry.title).toContain("Did not confirm");
    expect(entry.title).not.toContain("→");
    expect(entry.description ?? "").not.toContain("Customer response:");
  });
});
