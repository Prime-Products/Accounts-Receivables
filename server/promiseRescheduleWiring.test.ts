import { describe, it, expect, afterAll } from "vitest";

/**
 * One open promise per group.
 *
 * The Log Call dialog used to ask "reschedule the open promise or create a
 * separate one?" whenever a group already had an open Promise to Pay. The
 * question added a step without adding information, and answering "separate"
 * left two open promises for the same money — the live data had two identical
 * EVALEND (TANKERS) rows created a minute apart, which double-counted in the
 * Desk's promised figures and in the kept/broken statistics.
 *
 * The question is gone: a newly logged Promise to Pay always moves the group's
 * open promise and bumps its reschedule counter. These tests pin that, with and
 * without the legacy `reschedulePromiseId` flag older clients may still send.
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

const openPromisesOf = async (customerId: number) =>
  (await db.listPromises()).filter(p => p.customerId === customerId && p.status === "Pending");

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

    // Second call: the customer named a new date. No client flag is sent any more.
    const movedDate = Date.now() + 20 * 86400000;
    await caller.calls.logCall({
      group,
      customerId: fixture.id,
      outcome: "Reached",
      confirmationStatus: "Confirmed",
      promisedDate: movedDate,
      notes: "moved to later date",
    });

    const mine = await openPromisesOf(fixture.id);
    expect(mine.length, "a new promise date must not create a duplicate row").toBe(1);
    expect(mine[0].id).toBe(promiseId);
    expect(mine[0].promisedDate).toBe(movedDate);
    expect(mine[0].rescheduleCount).toBe(1);
  });

  it("still honours the legacy reschedulePromiseId flag", async () => {
    const group = fixture!.group;
    const existing = (await openPromisesOf(fixture!.id))[0];
    const nextDate = Date.now() + 40 * 86400000;

    await caller.calls.logCall({
      group,
      customerId: fixture!.id,
      outcome: "Reached",
      confirmationStatus: "Confirmed",
      promisedDate: nextDate,
      confirmationAmount: 1500,
      reschedulePromiseId: existing.id,
      notes: "older client sends the id explicitly",
    });

    const mine = await openPromisesOf(fixture!.id);
    expect(mine.length).toBe(1);
    expect(mine[0].id).toBe(existing.id);
    expect(mine[0].promisedDate).toBe(nextDate);
    expect(mine[0].rescheduleCount).toBe(2);
    expect(Number(mine[0].amount)).toBe(1500);
  });

  it("creates the first promise when the group has none open", async () => {
    const fresh = await createTestCustomer("VITESTFIX PromiseFirst");
    try {
      expect(await openPromisesOf(fresh.id)).toHaveLength(0);
      await caller.calls.logCall({
        group: fresh.group,
        customerId: fresh.id,
        outcome: "Reached",
        confirmationStatus: "Confirmed",
        promisedDate: Date.now() + 7 * 86400000,
        notes: "first ever promise",
      });
      const mine = await openPromisesOf(fresh.id);
      expect(mine).toHaveLength(1);
      expect(mine[0].rescheduleCount ?? 0).toBe(0);
    } finally {
      await cleanupTestCustomer(fresh);
    }
  });
});
