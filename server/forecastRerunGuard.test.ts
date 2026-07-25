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

describe("forecast re-run guard (single forecast per month)", () => {
  it("smartStatus reports hasRun=true with generation info when the month has entries", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const months = await db.listForecastMonths();
    if (months.length === 0) {
      // No generated forecast in DB — hasRun must be false for the current month.
      const now = new Date();
      const status = await caller.forecast.smartStatus({ year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 });
      expect(status.hasRun).toBe(false);
      return;
    }
    const m = months[0];
    const status = await caller.forecast.smartStatus({ year: m.year, month: m.month });
    expect(status.hasRun).toBe(true);
    expect(status.groups).toBeGreaterThan(0);
    expect(status.generatedAt).toBeTruthy();
    expect(status.adjustedCount).toBeGreaterThanOrEqual(0);
  });

  it("generateSmart rejects a re-run without explicit confirmation when the month already ran", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const months = await db.listForecastMonths();
    if (months.length === 0) return; // nothing generated — guard not applicable
    const m = months[0];
    await expect(caller.forecast.generateSmart({ year: m.year, month: m.month, useAi: false })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });

  it("smartStatus reports hasRun=false for a month with no forecast", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    // A far-future month should never have a forecast.
    const status = await caller.forecast.smartStatus({ year: 2099, month: 12 });
    expect(status.hasRun).toBe(false);
    expect(status.groups).toBe(0);
  });
});
