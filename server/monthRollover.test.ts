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

describe("month rollover — confirmation statuses reset each month", () => {
  it("a Promise to Pay recorded last month is presented as Not Contacted this month", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const customers = await db.listCustomers();
    const cust = customers[0];
    expect(cust).toBeTruthy();
    const group = (cust.customerGroup ?? "").trim() || cust.name;

    // Record a Confirmed (Promise to Pay) status now
    await caller.calls.updateConfirmationStatus({ group, status: "Confirmed", amount: 12345 });
    const fresh = await caller.calls.getConfirmationStatus({ group });
    expect(fresh?.status).toBe("Confirmed");

    // Backdate the row to last month → the effective status must fall back to Not Contacted
    await backdateConfirmation(group);
    const stale = await caller.calls.getConfirmationStatus({ group });
    expect(stale?.status).toBe("Not Contacted");
    expect(Number(stale?.amount ?? 0)).toBe(0);

    // groups list must also treat it as Not Contacted (expected = forecast, not the stale promise)
    const groups = await caller.customers.groups();
    const row = groups.find((g: any) => g.group === group) as any;
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
    const cust = customers[1] ?? customers[0];
    expect(cust).toBeTruthy();
    const group = (cust.customerGroup ?? "").trim() || cust.name;

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
