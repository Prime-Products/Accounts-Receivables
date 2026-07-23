import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

function callerAs(userId: number) {
  return appRouter.createCaller({
    user: { id: userId, openId: "test-open-id", name: "Test User", email: null, loginMethod: "test", role: "admin" } as any,
    req: {} as any,
    res: { cookie: () => {}, clearCookie: () => {} } as any,
  });
}

describe("customers.groupPromises / groupNotes / groupAiSummary", () => {
  it("lists promises for a group's member companies", async () => {
    const caller = callerAs(1);
    const groups = await caller.customers.groups({});
    expect(groups.length).toBeGreaterThan(0);
    const g = groups[0].group;
    const promises = await caller.customers.groupPromises({ group: g });
    expect(Array.isArray(promises)).toBe(true);
  });

  it("adds, lists, updates, and deletes a group note", async () => {
    const caller = callerAs(1);
    const groups = await caller.customers.groups({});
    const g = groups[0].group;
    const { id } = await caller.customers.addGroupNote({ group: g, content: "vitest note" });
    const notes = await caller.customers.groupNotes({ group: g });
    expect(notes.some(n => n.id === id && n.content === "vitest note")).toBe(true);
    await caller.customers.updateGroupNote({ id, content: "vitest note edited" });
    const updated = await caller.customers.groupNotes({ group: g });
    expect(updated.some(n => n.id === id && n.content === "vitest note edited")).toBe(true);
    await caller.customers.deleteGroupNote({ id });
    const after = await caller.customers.groupNotes({ group: g });
    expect(after.some(n => n.id === id)).toBe(false);
  });

  it("generates an AI summary for a group", async () => {
    const caller = callerAs(1);
    const groups = await caller.customers.groups({});
    const g = groups[0].group;
    const res = await caller.customers.groupAiSummary({ group: g });
    expect(res.summary.length).toBeGreaterThan(50);
  }, 90000);
});
