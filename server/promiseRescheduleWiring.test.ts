import { describe, it, expect, afterAll } from "vitest";

/**
 * "Open promise exists" — reschedule vs new.
 *
 * The dialog offers two choices when the group already has an open promise:
 * move the existing one (the customer shifted the same payment) or add a second
 * one (an additional payment was promised). The choice used to be sent as a mode
 * string the server did not understand, so BOTH options created a duplicate row
 * and the reschedule counter never moved — the live data had two identical open
 * promises for EVALEND (TANKERS) created a minute apart. These tests pin the
 * wiring: reschedule must update in place, "new" must add a row.
 */
import { appRouter } from "./routers";
import * as db from "./db";
import { createTestCustomer, cleanupTestCustomer, type TestCustomerFixture } from "./testFixtures";

const caller = appRouter.createCaller({
  user: { id: 999999, name: "vitest", email: "vitest@test.local", role: "admin" },
  req: {} as any,
  res: {} as any,
} as any);

let fixture: TestCustomerFixture | null = null;

afterAll(async () => {
  if (fixture) await cleanupTestCustomer(fixture);
});

describe("promise reschedule wiring", () => {
  it("moves the existing promise instead of creating a second one", async () => {
    fixture = await createTestCustomer("VITESTFIX PromiseWiring");
    const group = fixture.group;
    const firstDate = Date.now() + 5 * 86400000;

    await caller.calls.logCall({
      group,
      customerId: fixture.id,
      outcome: "Reached",
      confirmationStatus: "Confirmed",
      promisedDate: firstDate,
      notes: "first promise",
    });

    const open = await caller.calls.getOpenPromise({ group });
    expect(open, "a promise should exist after the first call").not.toBeNull();
    const promiseId = open!.id;
    expect(open!.rescheduleCount ?? 0).toBe(0);

    // Second call: the customer moved the same payment.
    const movedDate = Date.now() + 20 * 86400000;
    await caller.calls.logCall({
      group,
      customerId: fixture.id,
      outcome: "Reached",
      confirmationStatus: "Confirmed",
      promisedDate: movedDate,
      reschedulePromiseId: promiseId,
      notes: "moved to later date",
    });

    const all = await db.listPromises();
    const mine = all.filter(p => p.customerId === fixture!.id && p.status === "Pending");
    expect(mine.length, "reschedule must not create a duplicate promise").toBe(1);
    expect(mine[0].id).toBe(promiseId);
    expect(mine[0].promisedDate).toBe(movedDate);
    expect(mine[0].rescheduleCount).toBe(1);
  });

  it("creates a second promise when the collector chooses a separate one", async () => {
    const group = fixture!.group;
    const before = (await db.listPromises()).filter(
      p => p.customerId === fixture!.id && p.status === "Pending",
    ).length;

    // No reschedulePromiseId sent = "Create a separate new promise".
    await caller.calls.logCall({
      group,
      customerId: fixture!.id,
      outcome: "Reached",
      confirmationStatus: "Confirmed",
      promisedDate: Date.now() + 40 * 86400000,
      confirmationAmount: 1500,
      notes: "additional payment promised",
    });

    const after = (await db.listPromises()).filter(
      p => p.customerId === fixture!.id && p.status === "Pending",
    ).length;
    expect(after).toBe(before + 1);
  });
});
