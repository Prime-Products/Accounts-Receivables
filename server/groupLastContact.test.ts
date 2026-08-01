import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";

/**
 * The group card header answers "when did we last speak to them?", so
 * `customers.groupDetail` must carry the call summary fields. Read-only test on
 * real data: it asserts the contract and the consistency with the activity log,
 * without writing anything.
 */
const caller = () =>
  appRouter.createCaller({ user: { id: 1, openId: "test", name: "Test", role: "admin" } } as any);

describe("customers.groupDetail last-contact fields", () => {
  it("exposes the call summary contract for a real group", async () => {
    const customers = await db.listCustomers();
    const group = (customers.map(c => (c.customerGroup ?? "").trim() || c.name).find(Boolean) ?? "") as string;
    expect(group).not.toBe("");
    const detail = await caller().customers.groupDetail({ group });
    const d = detail as any;
    expect(d).toHaveProperty("lastCallAt");
    expect(d).toHaveProperty("lastCallBy");
    expect(d).toHaveProperty("lastCallOutcome");
    expect(d).toHaveProperty("lastCallNote");
    expect(typeof d.callCount).toBe("number");
    expect(typeof d.noAnswerCount).toBe("number");
    expect(d.lastCallAt === null || typeof d.lastCallAt === "number").toBe(true);
    expect(d.noAnswerCount).toBeLessThanOrEqual(d.callCount);
  }, 30_000);

  it("agrees with the activity log: a call count of zero means no logged call", async () => {
    const summaries = await db.callSummaryByGroup();
    // Calls may survive a customer being removed, so only groups that still have
    // member companies can be opened as a card.
    const customers = await db.listCustomers();
    const liveGroups = new Set(customers.map(c => (c.customerGroup ?? "").trim() || c.name));
    const called = Array.from(summaries.keys()).filter(g => liveGroups.has(g));
    const target = called[0];
    if (!target) {
      // No calls logged for any existing group yet — nothing to cross-check.
      expect(called).toHaveLength(0);
      return;
    }
    const d = (await caller().customers.groupDetail({ group: target })) as any;
    expect(d.callCount).toBeGreaterThan(0);
    expect(typeof d.lastCallAt).toBe("number");
    const logs = await db.listActivityLog(target, 200);
    const calls = logs.filter(l => l.activityType === "call");
    expect(d.callCount).toBe(calls.length);
  }, 30_000);
});
