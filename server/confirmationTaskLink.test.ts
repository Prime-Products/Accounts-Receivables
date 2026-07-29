import { afterAll, describe, it, expect } from "vitest";
import * as db from "./db";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { sql } from "drizzle-orm";

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

describe("Confirmation badge → linked task (customers.groups.confirmationTaskId)", () => {
  afterAll(async () => {
    // Purge every artifact this file created so no junk leaks into the live DB.
    const dbi = await getDb();
    if (!dbi) return;
    await dbi.execute(sql`DELETE tc FROM task_comments tc JOIN tasks t ON t.id = tc.taskId JOIN customers c ON c.id = t.customerId WHERE c.name LIKE 'TaskLink %'`);
    await dbi.execute(sql`DELETE ti FROM task_invoices ti JOIN tasks t ON t.id = ti.taskId JOIN customers c ON c.id = t.customerId WHERE c.name LIKE 'TaskLink %'`);
    await dbi.execute(sql`DELETE t FROM tasks t JOIN customers c ON c.id = t.customerId WHERE c.name LIKE 'TaskLink %'`);
    await dbi.execute(sql`DELETE p FROM promises_to_pay p JOIN customers c ON c.id = p.customerId WHERE c.name LIKE 'TaskLink %'`);
    await dbi.execute(sql`DELETE FROM activity_log WHERE groupName LIKE 'TaskLink %'`);
    await dbi.execute(sql`DELETE FROM group_confirmation_status WHERE groupName LIKE 'TaskLink %'`);
    await dbi.execute(sql`DELETE FROM customers WHERE name LIKE 'TaskLink %' AND id NOT IN (SELECT DISTINCT customerId FROM invoices WHERE customerId IS NOT NULL)`);
  });

  it("exposes the follow-up task id for a Pending Follow-up group", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const group = `TaskLink Pending ${Date.now()}`;
    const customerId = await db.createCustomer({
      code: `TLP-${Date.now()}`,
      name: `${group} Co`,
      customerGroup: group,
      creditLimit: "0",
    } as any);

    const followUpDate = Date.now() + 5 * 24 * 60 * 60 * 1000;
    await caller.calls.logCall({
      group,
      customerId,
      outcome: "Reached",
      confirmationStatus: "Pending Follow-up",
      confirmationAmount: 12000,
      followUpDate,
    });

    const groups = await caller.customers.groups();
    const row = groups.find(g => g.group === group);
    expect(row).toBeDefined();
    expect(row!.confirmationStatus).toBe("Pending Follow-up");
    expect(row!.confirmationTaskId).toBeTypeOf("number");

    // The linked task must be the auto-created follow-up call task for this group.
    const tasks = await db.listTasks({ statuses: ["Pending", "In Progress"] });
    const linked = tasks.find(t => t.id === row!.confirmationTaskId);
    expect(linked).toBeDefined();
    expect(linked!.description).toContain(`(Follow-up: ${group})`);
  });

  it("exposes the promise-check task id for a Promise to Pay group", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const group = `TaskLink Promise ${Date.now()}`;
    const customerId = await db.createCustomer({
      code: `TLC-${Date.now()}`,
      name: `${group} Co`,
      customerGroup: group,
      creditLimit: "0",
    } as any);

    const promisedDate = Date.now() + 10 * 24 * 60 * 60 * 1000;
    await caller.calls.logCall({
      group,
      customerId,
      outcome: "Reached",
      confirmationStatus: "Confirmed",
      confirmationAmount: 25000,
      promisedDate,
    });

    const groups = await caller.customers.groups();
    const row = groups.find(g => g.group === group);
    expect(row).toBeDefined();
    expect(row!.confirmationStatus).toBe("Confirmed");
    expect(row!.confirmationTaskId).toBeTypeOf("number");

    const tasks = await db.listTasks({ statuses: ["Pending", "In Progress"] });
    const linked = tasks.find(t => t.id === row!.confirmationTaskId);
    expect(linked).toBeDefined();
    expect(linked!.description).toMatch(/\(Promise #\d+\)/);
    expect(linked!.customerId).toBe(customerId);
  });

  it("returns null confirmationTaskId for Not Contacted / Broken groups", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const group = `TaskLink Broken ${Date.now()}`;
    const customerId = await db.createCustomer({
      code: `TLB-${Date.now()}`,
      name: `${group} Co`,
      customerGroup: group,
      creditLimit: "0",
    } as any);

    await caller.calls.logCall({
      group,
      customerId,
      outcome: "Reached",
      confirmationStatus: "Broken",
    });

    const groups = await caller.customers.groups();
    const row = groups.find(g => g.group === group);
    expect(row).toBeDefined();
    expect(row!.confirmationStatus).toBe("Broken");
    expect(row!.confirmationTaskId).toBeNull();
  });
});
