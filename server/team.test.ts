import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { snapshotIds, cleanupSince, type IdSnapshot } from "./testCleanup";
import { appRouter } from "./routers";
import * as db from "./db";

// --- isolated fixture customer (post-incident: never touch real customers) ---
import { createTestCustomer, cleanupTestCustomer, type TestCustomerFixture } from "./testFixtures";
let __fx: TestCustomerFixture | null = null;
async function getFixtureCustomer() {
  if (!__fx) __fx = await createTestCustomer();
  return { id: __fx.id, name: __fx.name, customerGroup: __fx.group };
}
afterAll(async () => {
  if (__fx) await cleanupTestCustomer(__fx);
});


function makeCtx() {
  return {
    user: { id: 1, openId: "test-open-id", name: "Test User", role: "admin" as const },
    req: {} as any,
    res: {} as any,
  };
}

const caller = appRouter.createCaller(makeCtx() as any);
const suffix = Date.now().toString(36);

// Track every team member created in this file so afterAll can force-delete
// them even if an assertion fails before the in-test cleanup runs.
const createdMemberIds: number[] = [];
async function createMember(input: { name: string; email?: string }) {
  const m = await caller.team.create(input);
  createdMemberIds.push(m.id);
  return m;
}

describe("team members", () => {
  let __snap: IdSnapshot;
  beforeAll(async () => {
    __snap = await snapshotIds();
  });
  afterAll(async () => {
    // Force-delete any test members that survived (e.g. a failed assertion
    // skipped the in-test remove calls). deleteTeamMember detaches them from
    // customers/tasks first, so this is safe to run repeatedly.
    for (const id of createdMemberIds) {
      await db.deleteTeamMember(id).catch(() => {});
    }
    await cleanupSince(__snap);
  });

  it("creates, lists, updates and deactivates a team member", async () => {
    const created = await createMember({ name: `TM Alpha ${suffix}`, email: `alpha-${suffix}@test.gr` });
    expect(created.id).toBeGreaterThan(0);

    const list = await caller.team.list();
    expect(list.some(m => m.id === created.id)).toBe(true);

    await caller.team.update({ id: created.id, name: `TM Alpha Renamed ${suffix}` });
    const after = (await caller.team.list()).find(m => m.id === created.id);
    expect(after?.name).toContain("Renamed");

    await caller.team.remove({ id: created.id });
    const finalList = await caller.team.list();
    expect(finalList.some(m => m.id === created.id)).toBe(false);
  });

  it("assigns and re-assigns an account manager on a customer", async () => {
    const m1 = await createMember({ name: `TM Mgr1 ${suffix}` });
    const m2 = await createMember({ name: `TM Mgr2 ${suffix}` });
    const cust = await getFixtureCustomer();

    // assign
    const r1 = await caller.customers.setAccountManager({ customerId: cust.id, managerId: m1.id });
    expect(r1.managerName).toBeTruthy();
    let detail = await caller.customers.get360({ id: cust.id });
    expect((detail as any).accountManager?.id).toBe(m1.id);

    // re-assign to another member
    await caller.customers.setAccountManager({ customerId: cust.id, managerId: m2.id });
    detail = await caller.customers.get360({ id: cust.id });
    expect((detail as any).accountManager?.id).toBe(m2.id);

    // clear
    await caller.customers.setAccountManager({ customerId: cust.id, managerId: null });
    detail = await caller.customers.get360({ id: cust.id });
    expect((detail as any).accountManager ?? null).toBeNull();

    await caller.team.remove({ id: m1.id });
    await caller.team.remove({ id: m2.id });
  });

  it("assigns a manager to a whole group", async () => {
    const m = await createMember({ name: `TM GroupMgr ${suffix}` });
    const groups = await caller.customers.groups();
    const grp = groups.find(g => g.companyCount > 1) ?? groups[0];
    expect(grp).toBeTruthy();

    await caller.customers.setAccountManager({ groupName: grp.group, managerId: m.id });
    const detail = await caller.customers.groupDetail({ group: grp.group });
    expect((detail as any).accountManager?.id).toBe(m.id);

    // clear for the whole group
    await caller.customers.setAccountManager({ groupName: grp.group, managerId: null });
    const detail2 = await caller.customers.groupDetail({ group: grp.group });
    expect((detail2 as any).accountManager ?? null).toBeNull();

    await caller.team.remove({ id: m.id });
  });

  it("creates a task with an assignee and re-assigns it", async () => {
    const m1 = await createMember({ name: `TM Task1 ${suffix}` });
    const m2 = await createMember({ name: `TM Task2 ${suffix}` });
    const cust = await getFixtureCustomer();

    const task = await caller.tasks.create({
      customerId: cust.id,
      type: "Manual",
      title: `Team test task ${suffix}`,
      dueDate: Date.now(),
      assigneeId: m1.id,
    });
    expect(task.id).toBeGreaterThan(0);

    let list = await caller.tasks.list();
    let row = list.find(t => t.id === task.id);
    expect(row?.assigneeId).toBe(m1.id);
    expect(row?.assigneeName).toContain("TM Task1");

    // re-assign
    await caller.tasks.assign({ id: task.id, assigneeId: m2.id });
    list = await caller.tasks.list();
    row = list.find(t => t.id === task.id);
    expect(row?.assigneeId).toBe(m2.id);

    // unassign
    await caller.tasks.assign({ id: task.id, assigneeId: null });
    list = await caller.tasks.list();
    row = list.find(t => t.id === task.id);
    expect(row?.assigneeId ?? null).toBeNull();

    // cleanup
    await caller.tasks.updateStatus({ id: task.id, status: "Cancelled" });
    await caller.team.remove({ id: m1.id });
    await caller.team.remove({ id: m2.id });
  });

  it("returns workload summary per member", async () => {
    const workload = await caller.team.workload();
    expect(Array.isArray(workload)).toBe(true);
  });
});
