import { describe, expect, it, beforeAll, afterAll } from "vitest";
import * as db from "./db";
import { appRouter } from "./routers";
import { buildMentionToken } from "../shared/mentions";
import { snapshotIds, cleanupSince, type IdSnapshot } from "./testCleanup";
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
 * Group Notes is the third place a colleague can be named with "@". A mention
 * written there must reach the inbox exactly like one written in a call note,
 * and must never create a task.
 */
describe("group note @mentions", () => {
  let snap: IdSnapshot;
  const group = "VTFX Group Note Mentions";

  beforeAll(async () => {
    snap = await snapshotIds();
  });

  afterAll(async () => {
    await cleanupSince(snap);
  });

  it("records the mention and creates no task", async () => {
    const members = await db.listTeamMembers(true);
    if (members.length === 0) return;
    const target = members[0];
    const caller = appRouter.createCaller(createAuthContext());

    const tasksBefore = await db.listTasks({});
    await caller.customers.addGroupNote({
      group,
      content: `Escalation agreed — ${buildMentionToken(target)} please confirm with the vessel owner.`,
    });

    const mentions = await db.listMentionsForMember(target.id, { unreadOnly: false, limit: 50 });
    const own = mentions.find(m => m.groupName === group);
    expect(own, "the mention should be visible in the member's inbox").toBeTruthy();
    expect(own!.source).toBe("groupNote");
    expect(own!.excerpt).toContain("Escalation agreed");

    const tasksAfter = await db.listTasks({});
    expect(tasksAfter.length, "a mention is a reference, never a task").toBe(tasksBefore.length);
  });
});
