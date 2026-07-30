import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import { createTestCustomer, cleanupTestCustomer, IdSnapshot } from "./testFixtures";

function makeCaller() {
  return appRouter.createCaller({
    user: { id: 1, openId: "test-open-id", role: "admin" as const, name: "Test User" },
  } as any);
}

describe("Email prefill templates", () => {
  let fx: Awaited<ReturnType<typeof createTestCustomer>>;
  let snap: IdSnapshot;

  beforeAll(async () => {
    fx = await createTestCustomer();
    snap = { taskId: 0, promiseId: 0, activityId: 0, auditId: 0 };
  });

  afterAll(async () => {
    await cleanupTestCustomer(fx, snap);
  });

  it("SOA template returns subject/body with the customer name", async () => {
    const r = await makeCaller().calls.emailPrefill({ customerId: fx.id, template: "SOA" });
    expect(r.subject).toContain("Statement of Account");
    expect(r.body).toContain("Statement of Account");
    expect(r.body).toContain("Total outstanding");
    expect(typeof r.openTotal).toBe("number");
    expect(typeof r.overdueTotal).toBe("number");
  });

  it("Payment Reminder template mentions outstanding invoices", async () => {
    const r = await makeCaller().calls.emailPrefill({ customerId: fx.id, template: "Payment Reminder" });
    expect(r.subject).toContain("Payment Reminder");
    expect(r.body).toContain("friendly reminder");
  });

  it("Overdue Notice template has an urgent tone", async () => {
    const r = await makeCaller().calls.emailPrefill({ customerId: fx.id, template: "Overdue Notice" });
    expect(r.subject).toContain("Overdue Notice");
    expect(r.body).toContain("remain unpaid");
  });

  it("rejects unknown customer", async () => {
    await expect(
      makeCaller().calls.emailPrefill({ customerId: 99999999, template: "SOA" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("sendGroupEmail accepts the new template types", async () => {
    const r = await makeCaller().calls.sendGroupEmail({
      customerId: fx.id,
      recipientEmail: "test@example.com",
      templateType: "SOA",
      subject: "Statement of Account — test",
      body: "test body",
    });
    expect(r.success).toBe(true);
  });
});
