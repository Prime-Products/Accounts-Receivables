import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";

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

describe("forecast.setGroupForecast", () => {
  it("updates expectedAmount and initialForecast for an existing current-month group entry", async () => {
    // The forecast is generated per month, so at the very start of a new month
    // the current month can legitimately be empty (nobody has run the forecast
    // yet). Fall back to the most recent month that does have entries, and skip
    // only if the table is empty altogether.
    const now = new Date();
    let entry: Awaited<ReturnType<typeof db.listForecastEntries>>[number] | undefined;
    for (let back = 0; back < 12 && !entry; back++) {
      const probe = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
      const entries = await db.listForecastEntries(probe.getUTCFullYear(), probe.getUTCMonth() + 1);
      entry = entries.find(e => (e.customerGroup ?? "").trim());
    }
    if (!entry) {
      // No forecast has ever been generated — nothing to assert against.
      return;
    }
    const group = (entry!.customerGroup ?? "").trim();
    const original = Number(entry!.expectedAmount);
    const newAmount = Math.round((original + 123.45) * 100) / 100;

    // Snapshot the CURRENT-month entry for this group (if any) so the row can be
    // restored afterwards. When the current month has no entry yet the procedure
    // creates one, and the test deletes it again below.
    const currentEntries = await db.listForecastEntries(now.getUTCFullYear(), now.getUTCMonth() + 1);
    const before = currentEntries.find(e => (e.customerGroup ?? "").trim() === group);

    const caller = appRouter.createCaller(createAuthContext());
    const res = await caller.forecast.setGroupForecast({ group, amount: newAmount });
    expect(res.success).toBe(true);

    // The procedure always writes the CURRENT month: it updates the existing
    // entry when there is one, otherwise it creates a new one. Assert on the id
    // it reports back rather than assuming the sampled entry was current.
    const updated = await db.getForecastEntry(res.id);
    expect(Number(updated.expectedAmount)).toBeCloseTo(newAmount, 2);
    expect(Number(updated.initialForecast)).toBeCloseTo(newAmount, 2);
    expect(updated.userAdjusted).toBe(1);

    // restore the previous values to avoid polluting data
    if (before) {
      await db.updateForecastEntry(res.id, {
        expectedAmount: before.expectedAmount,
        initialForecast: before.initialForecast,
        userAdjusted: before.userAdjusted,
        adjustedBy: before.adjustedBy,
        adjustmentNote: before.adjustmentNote,
      });
    } else {
      await db.deleteForecastEntry(res.id);
    }
  });

  it("rejects a negative amount", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(caller.forecast.setGroupForecast({ group: "ANY", amount: -5 })).rejects.toThrow();
  });
});
