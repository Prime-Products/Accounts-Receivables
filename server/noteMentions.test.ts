import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";
import { buildMentionToken, parseMentions } from "../shared/mentions";
import { createTestCustomer, createTestInvoice, cleanupTestCustomers, type TestCustomerFixture } from "./testFixtures";
import type { TrpcContext } from "./_core/context";

/**
 * An @mention is a reference to a colleague written inside a note ("informed X").
 * It must be stored against that colleague so they can find it, and it must never
 * become work — the app deliberately creates no task from a logged call.
 */
function createAuthContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "sample-user",
      email: "sample@example.com",
      name: "Sample User",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  } as TrpcContext;
}

const caller = appRouter.createCaller(createAuthContext());

describe("@mentions in notes", () => {
  let fx: TestCustomerFixture;
  let member: { id: number; name: string };

  beforeAll(async () => {
    fx = await createTestCustomer("MENTIONFX");
    await createTestInvoice(fx);
    const members = await db.listTeamMembers(true);
    expect(members.length, "the database needs at least one team member").toBeGreaterThan(0);
    member = { id: members[0].id, name: members[0].name };
  });

  afterAll(async () => {
    await cleanupTestCustomers([fx]);
  });

  it("stores a mention written in a call note", async () => {
    const before = await db.listMentionsByGroup(fx.group);
    await caller.calls.logCall({
      group: fx.group,
      customerId: fx.id,
      outcome: "Reached",
      confirmationStatus: "Not Contacted",
      notes: `Informed ${buildMentionToken(member)} about invoice 12345`,
    });
    const after = await db.listMentionsByGroup(fx.group);

    expect(after.length).toBe(before.length + 1);
    const created = after.reduce((n: any, r: any) => (n == null || r.id > n.id ? r : n), null as any);
    expect(created.memberId).toBe(member.id);
    expect(created.source).toBe("call");
    expect(parseMentions(created.excerpt)).toEqual([{ memberId: member.id, name: member.name }]);
  });

  it("creates no task for a mention", async () => {
    const tasksBefore = await db.listTasks();
    await caller.calls.logCall({
      group: fx.group,
      customerId: fx.id,
      outcome: "Reached",
      confirmationStatus: "Not Contacted",
      notes: `Told ${buildMentionToken(member)} to check the PO`,
    });
    const tasksAfter = await db.listTasks();
    expect(tasksAfter.length).toBe(tasksBefore.length);
  });

  it("stores a mention written in the collection notes", async () => {
    const before = await db.listMentionsByGroup(fx.group);
    await caller.customers.setCollectionProfile({
      group: fx.group,
      notes: `Call Tue-Thu. ${buildMentionToken(member)} handles the paperwork.`,
    });
    const after = await db.listMentionsByGroup(fx.group);

    expect(after.length).toBe(before.length + 1);
    const created = after.reduce((n: any, r: any) => (n == null || r.id > n.id ? r : n), null as any);
    expect(created.source).toBe("collectionNotes");
  });

  it("ignores plain @text that is not a picked colleague", async () => {
    const before = await db.listMentionsByGroup(fx.group);
    await caller.calls.logCall({
      group: fx.group,
      customerId: fx.id,
      outcome: "Reached",
      confirmationStatus: "Not Contacted",
      notes: "Forwarded to @accounting inbox",
    });
    const after = await db.listMentionsByGroup(fx.group);
    expect(after.length).toBe(before.length);
  });

  it("surfaces the mention to the mentioned member and lets them clear it", async () => {
    const rows = (await db.listMentionsForMember(member.id, { limit: 50 })) as any[];
    expect(rows.some(r => r.groupName === fx.group)).toBe(true);

    const unread = (await db.listMentionsForMember(member.id, { unreadOnly: true, limit: 50 })) as any[];
    const mine = unread.find(r => r.groupName === fx.group);
    expect(mine, "a fresh mention starts unread").toBeTruthy();

    await db.markMentionsRead(member.id, mine.id);
    const stillUnread = (await db.listMentionsForMember(member.id, { unreadOnly: true, limit: 50 })) as any[];
    expect(stillUnread.some(r => r.id === mine.id)).toBe(false);
  });
});
