import { describe, it, expect } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

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

describe("Dashboard procedure", () => {
  it("returns pendingContactGroups as a number", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.forecast.dashboard();
    expect(result).toHaveProperty("pendingContactGroups");
    expect(typeof result.pendingContactGroups).toBe("number");
    expect(result.pendingContactGroups).toBeGreaterThanOrEqual(0);
  });

  it("problematicGroups count matches the groups list resolved statuses", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const [dash, groups] = await Promise.all([
      caller.forecast.dashboard(),
      caller.customers.groups(),
    ]);
    const listProblematic = groups.filter((g: any) => g.watchStatus === "Problematic").length;
    const listCritical = groups.filter((g: any) => g.watchStatus === "Critical").length;
    const listOnHold = groups.filter((g: any) => g.watchStatus === "On Hold" || g.watchStatus === "Legal").length;
    expect(dash.problematicGroups).toBe(listProblematic);
    expect(dash.onHoldPending).toBe(listCritical);
    expect(dash.onHoldGroups).toBe(listOnHold);
  });
});
