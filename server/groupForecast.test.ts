import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { snapshotIds, cleanupSince, type IdSnapshot } from "./testCleanup";
import { appRouter } from "./routers";
import * as db from "./db";
import { getDb } from "./db";
import { tasks as tasksTable, promisesToPay } from "../drizzle/schema";
import { eq } from "drizzle-orm";

function createCaller() {
  return appRouter.createCaller({
    user: { id: 1, openId: "test-open-id", name: "Test User", role: "admin" } as any,
    req: {} as any,
    res: { setHeader: () => {}, clearCookie: () => {} } as any,
  });
}

describe("customers.groupForecast", () => {
  let __snap: IdSnapshot;
  beforeAll(async () => {
    __snap = await snapshotIds();
  });
  afterAll(async () => {
    await cleanupSince(__snap);
  });

  it("returns a collected-only payload (hasForecast=false) for a group without a current-month forecast entry", async () => {
    const caller = createCaller();
    const res = await caller.customers.groupForecast({ group: "___NO_SUCH_GROUP___" });
    // Behavior change: even without a forecast entry, the procedure reports
    // collected (receipts + received wire transfers) so the group card can
    // show "Paid (this month)"; hasForecast=false hides forecast-only cards.
    expect(res).not.toBeNull();
    expect((res as any).hasForecast).toBe(false);
    expect(typeof res!.collected).toBe("number");
    expect(res!.collected).toBe(0);
    expect(res!.expectedAmount).toBe(0);
  });

  it("returns numeric forecast fields when an entry exists", async () => {
    const caller = createCaller();
    const now = new Date();
    const entries = await db.listForecastEntries(now.getUTCFullYear(), now.getUTCMonth() + 1);
    if (entries.length === 0) return; // no forecast generated this month — nothing to assert
    const group = (entries[0].customerGroup ?? "").trim();
    if (!group) return;
    const res = await caller.customers.groupForecast({ group });
    expect(res).not.toBeNull();
    expect(typeof res!.expectedAmount).toBe("number");
    expect(typeof res!.collected).toBe("number");
    expect(res!.remaining).toBeGreaterThanOrEqual(0);
  });
});

describe("promise Kept/Broken auto-completes follow-up task", () => {
  it("marks the linked follow-up task Completed when the promise is marked Kept", async () => {
    const caller = createCaller();
    const customers = await db.listCustomers();
    if (customers.length === 0) return;
    const cust = customers[0];

    // Create a promise via the router (creates the auto follow-up task with "(Promise #id)" marker).
    const promised = Date.now() + 3 * 24 * 60 * 60 * 1000;
    const { id: promiseId } = await caller.forecast.addPromise({
      customerId: cust.id,
      amount: 123.45,
      promisedDate: promised,
      notes: "vitest promise",
    });

    const tasksBefore = await db.listTasks({ customerId: cust.id });
    const followUp = tasksBefore.find(t => t.description?.includes(`(Promise #${promiseId})`));
    expect(followUp).toBeTruthy();

    await caller.forecast.updatePromise({ id: promiseId, status: "Kept" });

    const tasksAfter = await db.listTasks({ customerId: cust.id });
    const completed = tasksAfter.find(t => t.id === followUp!.id);
    expect(completed?.status).toBe("Completed");

    // Cleanup: remove test promise and task rows.
    const dbi = await getDb();
    await dbi.delete(tasksTable).where(eq(tasksTable.id, followUp!.id));
    await dbi.delete(promisesToPay).where(eq(promisesToPay.id, promiseId));
  });
});
