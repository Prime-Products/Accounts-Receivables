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
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const entries = await db.listForecastEntries(year, month);
    const entry = entries.find(e => (e.customerGroup ?? "").trim());
    expect(entry).toBeDefined();
    const group = (entry!.customerGroup ?? "").trim();
    const original = Number(entry!.expectedAmount);
    const newAmount = Math.round((original + 123.45) * 100) / 100;

    const caller = appRouter.createCaller(createAuthContext());
    const res = await caller.forecast.setGroupForecast({ group, amount: newAmount });
    expect(res.success).toBe(true);

    const updated = await db.getForecastEntry(entry!.id);
    expect(Number(updated.expectedAmount)).toBeCloseTo(newAmount, 2);
    expect(Number(updated.initialForecast)).toBeCloseTo(newAmount, 2);
    expect(updated.userAdjusted).toBe(1);

    // restore original value to avoid polluting data
    await db.updateForecastEntry(entry!.id, {
      expectedAmount: entry!.expectedAmount,
      initialForecast: entry!.initialForecast,
      userAdjusted: entry!.userAdjusted,
      adjustedBy: entry!.adjustedBy,
      adjustmentNote: entry!.adjustmentNote,
    });
  });

  it("rejects a negative amount", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(caller.forecast.setGroupForecast({ group: "ANY", amount: -5 })).rejects.toThrow();
  });
});
