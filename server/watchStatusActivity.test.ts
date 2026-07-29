/**
 * Integration tests for the manual watch-status override, the group activity feed,
 * and the promise-to-pay side effects (auto activity-log entry + auto follow-up task).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { snapshotIds, cleanupSince, type IdSnapshot } from "./testCleanup";
import { appRouter } from "./routers";
import * as db from "./db";
import { getDb } from "./db";
import { tasks as tasksTable, promisesToPay, activityLog as activityLogTable } from "../drizzle/schema";
import { eq } from "drizzle-orm";

function callerAs(userId: number) {
  return appRouter.createCaller({
    user: { id: userId, openId: "test-open-id", name: "Test User", email: null, loginMethod: "test", role: "admin" } as any,
    req: {} as any,
    res: { cookie: () => {}, clearCookie: () => {} } as any,
  });
}

describe("customers.setWatchStatus", () => {
  let __snap: IdSnapshot;
  beforeAll(async () => {
    __snap = await snapshotIds();
  });
  afterAll(async () => {
    await cleanupSince(__snap);
  });

  it("sets and clears a manual watch-status override, recording a note", async () => {
    const caller = callerAs(1);
    const groups = await caller.customers.groups({});
    expect(groups.length).toBeGreaterThan(0);
    const g = groups[0].group;

    await caller.customers.setWatchStatus({ group: g, status: "Problematic" });
    const stored = await db.getGroupWatchStatus(g);
    expect(stored?.status).toBe("Problematic");

    // The groups list must surface the manual override
    const refreshed = await caller.customers.groups({});
    const row = refreshed.find(r => r.group === g);
    expect(row?.watchStatus).toBe("Problematic");
    expect(row?.problematic).toBe(true);

    // A note documenting the change is auto-created
    const notes = await caller.customers.groupNotes({ group: g });
    const note = notes.find(n => n.content.includes('Status changed to "Problematic"'));
    expect(note).toBeTruthy();

    // "Normal" clears the Problematic flag even if the rule would set it
    await caller.customers.setWatchStatus({ group: g, status: "Normal" });
    const normalized = await caller.customers.groups({});
    const normalRow = normalized.find(r => r.group === g);
    expect(normalRow?.watchStatus ?? null).toBeNull();
    expect(normalRow?.problematic).toBe(false);

    // Reset back to Auto (follow the forecast rule)
    await caller.customers.setWatchStatus({ group: g, status: "Auto" });
    const cleared = await db.getGroupWatchStatus(g);
    expect(cleared?.status).toBe("Auto");

    // Clean up the auto-created notes
    const allNotes = await caller.customers.groupNotes({ group: g });
    for (const n of allNotes.filter(n => n.content.startsWith("Status changed"))) {
      await caller.customers.deleteGroupNote({ id: n.id });
    }
  });

  it("rejects an invalid status value", async () => {
    const caller = callerAs(1);
    await expect(
      caller.customers.setWatchStatus({ group: "X", status: "Blocked" as any }),
    ).rejects.toThrow();
  });
});

describe("customers.groupActivity", () => {
  it("returns receipts, contracts, and tasks scoped to the group's member companies", async () => {
    const caller = callerAs(1);
    const groups = await caller.customers.groups({});
    const g = groups[0].group;
    const activity = await caller.customers.groupActivity({ group: g });
    expect(Array.isArray(activity.receipts)).toBe(true);
    expect(Array.isArray(activity.contracts)).toBe(true);
    expect(Array.isArray(activity.tasks)).toBe(true);

    const customers = await db.listCustomers();
    const memberIds = new Set(
      customers.filter(c => ((c.customerGroup ?? "").trim() || c.name) === g).map(c => c.id),
    );
    for (const r of activity.receipts.slice(0, 20)) expect(memberIds.has(r.customerId)).toBe(true);
    for (const t of activity.tasks.slice(0, 20)) expect(memberIds.has(t.customerId)).toBe(true);
    // Every row carries the resolved member-company name
    for (const r of activity.receipts.slice(0, 5)) expect(typeof r.customerName).toBe("string");
  });
});

describe("forecast.addPromise side effects", () => {
  it("creates the promise, an activity-log entry, and a follow-up task due on the promised date", async () => {
    const caller = callerAs(1);
    const customers = await db.listCustomers();
    expect(customers.length).toBeGreaterThan(0);
    const cust = customers[0];
    const groupKey = cust.customerGroup?.trim() ? cust.customerGroup.trim() : cust.name;
    const promisedDate = Date.UTC(2026, 7, 15); // 15 Aug 2026

    const { id } = await caller.forecast.addPromise({
      customerId: cust.id,
      promisedDate,
      amount: 1234.56,
      notes: "vitest promise",
    });
    expect(id).toBeGreaterThan(0);

    // Activity-log entry auto-created (promises no longer create group notes — by design)
    const activity = await db.listActivityLog(groupKey);
    const entry = activity.find(
      a => a.activityType === "promise" && a.title.startsWith("Promise-to-Pay:") && (a.description ?? "").includes("vitest promise"),
    );
    expect(entry).toBeTruthy();

    // Follow-up task auto-created, due on the promised date
    const tasks = await db.listTasks({});
    const task = tasks.find(
      t => t.customerId === cust.id && t.title.startsWith("Promise to Pay") && t.description?.includes(`(Promise #${id})`),
    );
    expect(task).toBeTruthy();
    expect(task?.dueDate).toBe(promisedDate);
    expect(task?.type).toBe("Manual");

    // Clean up test artifacts
    const dbi = await getDb();
    if (entry) await dbi.delete(activityLogTable).where(eq(activityLogTable.id, entry.id));
    if (task) await dbi.delete(tasksTable).where(eq(tasksTable.id, task.id));
    await dbi.delete(promisesToPay).where(eq(promisesToPay.id, id));
  });
});
