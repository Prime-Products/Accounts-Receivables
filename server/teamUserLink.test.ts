import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";
import type { TrpcContext } from "./_core/context";

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

/**
 * A team member only receives @mentions when it is linked to a sign-in account.
 * These tests pin that the link is manageable from the app (not only via SQL)
 * and that one account can never serve two members.
 */
describe("team member ↔ sign-in account link", () => {
  it("lists sign-in accounts and marks the ones already taken", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const logins = await caller.team.linkableUsers();
    expect(logins.length).toBeGreaterThan(0);
    for (const u of logins) {
      expect(typeof u.id).toBe("number");
      expect(u.name.length).toBeGreaterThan(0);
      // Either free, or attributed to a named member.
      if (u.linkedToMemberId !== null) expect(u.linkedToMemberName).toBeTruthy();
    }
    const members = await db.listTeamMembers(true);
    const linkedMembers = members.filter(m => m.userId);
    for (const m of linkedMembers) {
      const row = logins.find(u => u.id === Number(m.userId));
      if (row) expect(row.linkedToMemberId).toBe(m.id);
    }
  });

  it("refuses to link an account that already belongs to another member", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const members = await db.listTeamMembers(true);
    const linked = members.find(m => m.userId);
    const other = members.find(m => m.id !== linked?.id);
    if (!linked || !other) return; // nothing to assert in an unlinked dataset
    await expect(
      caller.team.setUserLink({ id: other.id, userId: Number(linked.userId) }),
    ).rejects.toThrow(/already linked/i);
    // The rejected attempt must not have changed either side.
    const after = await db.listTeamMembers(true);
    expect(after.find(m => m.id === linked.id)?.userId).toBe(linked.userId);
    expect(after.find(m => m.id === other.id)?.userId ?? null).toBe(other.userId ?? null);
  });

  it("round-trips unlink and relink without losing the original link", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const members = await db.listTeamMembers(true);
    const linked = members.find(m => m.userId);
    if (!linked) return;
    const original = Number(linked.userId);
    try {
      await caller.team.setUserLink({ id: linked.id, userId: null });
      const unlinked = await db.getTeamMemberById(linked.id);
      expect(unlinked?.userId ?? null).toBeNull();
      await caller.team.setUserLink({ id: linked.id, userId: original });
      const relinked = await db.getTeamMemberById(linked.id);
      expect(Number(relinked?.userId)).toBe(original);
    } finally {
      await db.updateTeamMember(linked.id, { userId: original } as any).catch(() => {});
    }
  });

  it("rejects an unknown sign-in account", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const members = await db.listTeamMembers(true);
    if (members.length === 0) return;
    await expect(
      caller.team.setUserLink({ id: members[0].id, userId: 987654321 }),
    ).rejects.toThrow(/not found/i);
  });
});
