import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { appRouter } from "./routers";
import * as db from "./db";
import { createTestCustomer, cleanupTestCustomer, type TestCustomerFixture } from "./testFixtures";
import { snapshotIds, cleanupSince, type IdSnapshot } from "./testCleanup";

function makeCaller() {
  return appRouter.createCaller({
    user: { id: 1, openId: "test", name: "Vitest", email: null, role: "admin" } as any,
    req: {} as any,
    res: {} as any,
  } as any);
}

/**
 * The Group cell of the tasks table links to the company card, so tasks.list
 * must carry the customerId the link is built from.
 */
describe("tasks list → company card link", () => {
  let fx: TestCustomerFixture;
  let taskId = 0;
  let snap: IdSnapshot | null = null;

  beforeAll(async () => {
    snap = await snapshotIds();
    fx = await createTestCustomer("tasklink");
    taskId = await db.createTask({
      customerId: fx.id,
      title: "VT link task",
      type: "Manual",
      status: "Pending",
      dueDate: Date.now() + 86400000,
      assignedTo: 1,
    } as any);
  });

  afterAll(async () => {
    if (snap) await cleanupSince(snap);
    if (fx) await cleanupTestCustomer(fx);
  });

  it("returns customerId, customerName and groupName for each task", async () => {
    const caller = makeCaller();
    const rows: any[] = await caller.tasks.list();
    const row = rows.find(r => r.id === taskId);
    expect(row).toBeTruthy();
    expect(row.customerId).toBe(fx.id);
    expect(row.customerName).toBe(fx.name);
    expect(typeof row.groupName).toBe("string");
  });

  it("the Group cell navigates to /customers/<id>", () => {
    const src = readFileSync(new URL("../client/src/pages/Tasks.tsx", import.meta.url), "utf8");
    expect(src).toContain("navigate(`/customers/${t.customerId}`)");
    // click must not also open the task dialog
    expect(src).toMatch(/e\.stopPropagation\(\);\s*\n\s*navigate\(`\/customers/);
  });
});
