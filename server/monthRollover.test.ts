import { describe, expect, it } from "vitest";
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

/** Backdate a group's confirmation-status updatedAt to the middle of the previous month (raw SQL to bypass onUpdateNow). */
async function backdateConfirmation(group: string) {
  const now = new Date();
  const prevMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15, 12, 0, 0));
  await db.setGroupConfirmationUpdatedAt(group, prevMonth);
}

describe("promise carryover — statuses stay active until their target date", () => {
  it("a Promise to Pay recorded last month with a future date stays Confirmed; an expired one falls back to Not Contacted", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const customers = await db.listCustomers();
    const cust = customers[0];
    expect(cust).toBeTruthy();
    const group = (cust.customerGroup ?? "").trim() || cust.name;

    // Record a Confirmed (Promise to Pay) status with a future promise date
    const futureDate = Date.now() + 10 * 24 * 60 * 60 * 1000;
    await caller.calls.updateConfirmationStatus({ group, status: "Confirmed", amount: 12345, followUpDate: futureDate });
    const fresh = await caller.calls.getConfirmationStatus({ group });
    expect(fresh?.status).toBe("Confirmed");

    // Backdate the row's updatedAt to last month → status must STILL be Confirmed
    // because the promise date is in the future (carryover across month boundary).
    await backdateConfirmation(group);
    const carried = await caller.calls.getConfirmationStatus({ group });
    expect(carried?.status).toBe("Confirmed");
    expect(Number(carried?.amount ?? 0)).toBe(12345);

    // groups list must also keep the promise (expected = promised amount)
    let groups = await caller.customers.groups();
    let row = groups.find((g: any) => g.group === group) as any;
    expect(row).toBeTruthy();
    expect(row.confirmationStatus).toBe("Confirmed");
    expect(row.expectedToCollect).toBeCloseTo(12345, 2);

    // Now set the promise date to the past → the status must fall back to Not Contacted
    const pastDate = Date.now() - 2 * 24 * 60 * 60 * 1000;
    await caller.calls.updateConfirmationStatus({ group, status: "Confirmed", amount: 12345, followUpDate: pastDate });
    const stale = await caller.calls.getConfirmationStatus({ group });
    expect(stale?.status).toBe("Not Contacted");
    expect(Number(stale?.amount ?? 0)).toBe(0);

    // groups list must also treat it as Not Contacted (expected = forecast, not the stale promise)
    groups = await caller.customers.groups();
    row = groups.find((g: any) => g.group === group) as any;
    expect(row).toBeTruthy();
    expect(row.confirmationStatus).toBe("Not Contacted");
    expect(row.expectedToCollect).toBe(row.forecastExpected);

    // Cleanup: reset to Not Contacted "now" so no state leaks to other tests
    await caller.calls.updateConfirmationStatus({ group, status: "Not Contacted" });
  });
});

describe("stale open promises — Not Contacted sweeps them", () => {
  it("a promise created directly (no Confirmed status) is cancelled when status is set to Not Contacted", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const customers = await db.listCustomers();
    const groupOf = (c: { customerGroup: string | null; name: string }) => (c.customerGroup ?? "").trim() || c.name;
    const firstGroup = customers[0] ? groupOf(customers[0]) : "";
    // Pick a customer whose group differs from customers[0]'s group — groupForecast.test.ts
    // uses customers[0] concurrently, and our Not Contacted sweep would cancel its promise task.
    const cust = customers.find(c => groupOf(c) !== firstGroup) ?? customers[0];
    expect(cust).toBeTruthy();
    const group = groupOf(cust);

    // Create a promise directly (like the Promises page does) — confirmation status never set to Confirmed
    const promised = Date.now() + 5 * 24 * 60 * 60 * 1000;
    await caller.forecast.addPromise({ customerId: cust.id, amount: 4321, promisedDate: promised, notes: "regression test promise" });
    const openBefore = await caller.calls.getOpenPromise({ group });
    expect(openBefore).toBeTruthy();

    // Set status to Not Contacted — previous status may be null or already Not Contacted
    await caller.calls.updateConfirmationStatus({ group, status: "Not Contacted" });

    // The open promise must be swept: dialog should no longer offer a reschedule
    const openAfter = await caller.calls.getOpenPromise({ group });
    expect(openAfter).toBeNull();
  });
});

describe("groups payload — promise date under badge", () => {
  it("a Confirmed group with an open promise exposes confirmationPromiseDate", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const customers = await db.listCustomers();
    const groupOf = (c: { customerGroup: string | null; name: string }) => (c.customerGroup ?? "").trim() || c.name;
    const firstGroup = customers[0] ? groupOf(customers[0]) : "";
    const candidates = customers.filter(c => groupOf(c) !== firstGroup);
    const cust = candidates[1] ?? candidates[0] ?? customers[0];
    expect(cust).toBeTruthy();
    const group = groupOf(cust);

    const promised = Date.now() + 7 * 24 * 60 * 60 * 1000;
    await caller.calls.updateConfirmationStatus({ group, status: "Confirmed", amount: 1234, followUpDate: promised });
    await caller.forecast.addPromise({ customerId: cust.id, amount: 1234, promisedDate: promised, notes: "badge date test" });

    const groups = await caller.customers.groups();
    const row = groups.find(g => g.group === group);
    expect(row).toBeTruthy();
    expect(row!.confirmationStatus).toBe("Confirmed");
    expect(row!.confirmationPromiseDate).toBeTruthy();

    // Cleanup: back to Not Contacted sweeps the promise
    await caller.calls.updateConfirmationStatus({ group, status: "Not Contacted" });
    const after = await caller.calls.getOpenPromise({ group });
    expect(after).toBeNull();
  });
});
