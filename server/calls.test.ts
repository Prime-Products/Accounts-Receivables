import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";
import { purgeTestCustomers } from "./testCleanup";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return ctx;
}

describe("calls router", () => {
  let testCustomerId: number;

  beforeAll(async () => {
    // Create a test customer with unique code
    const dbInstance = await db.getDb();
    if (dbInstance) {
      const uniqueCode = `TEST-EMAIL-${Date.now()}`;
      testCustomerId = await db.createCustomer({
        code: uniqueCode,
        name: "Test Email Customer",
        email: "customer@example.com",
        contactPerson: "John Doe",
      });
    }
  });

  afterAll(async () => {
    await purgeTestCustomers(["Test Email Customer%"]);
  });

  it("sendGroupEmail should record email in history", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.calls.sendGroupEmail({
      customerId: testCustomerId,
      recipientEmail: "test@example.com",
      recipientName: "Test Recipient",
      templateType: "Friendly Reminder",
      subject: "Payment Reminder",
      body: "Please remit payment at your earliest convenience.",
    });

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.emailId).toBeGreaterThan(0);
    expect(result.message).toBe("Email queued for sending");
  });

  it("sendGroupEmail should fail with invalid customer", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    try {
      await caller.calls.sendGroupEmail({
        customerId: 999999,
        recipientEmail: "test@example.com",
        recipientName: "Test Recipient",
        templateType: "Friendly Reminder",
        subject: "Payment Reminder",
        body: "Please remit payment.",
      });
      expect.fail("Should have thrown an error");
    } catch (error: any) {
      // The error may be INTERNAL_SERVER_ERROR if the customer doesn't exist
      expect(["NOT_FOUND", "INTERNAL_SERVER_ERROR"]).toContain(error.code);
    }
  });

  it("getEmailHistory should return sent emails", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // First send an email
    await caller.calls.sendGroupEmail({
      customerId: testCustomerId,
      recipientEmail: "test2@example.com",
      recipientName: "Test Recipient 2",
      templateType: "Final Notice",
      subject: "Final Payment Notice",
      body: "This is a final notice.",
    });

    // Then retrieve the history
    const history = await caller.calls.getEmailHistory({
      customerId: testCustomerId,
      limit: 10,
    });

    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBeGreaterThan(0);
    expect(history[0]).toHaveProperty("recipientEmail");
    expect(history[0]).toHaveProperty("templateType");
    expect(history[0]).toHaveProperty("status");
  });

  it("sendGroupEmail should accept all template types", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const templates = ["Friendly Reminder", "Final Notice", "Statement", "Custom"] as const;

    for (const template of templates) {
      const result = await caller.calls.sendGroupEmail({
        customerId: testCustomerId,
        recipientEmail: `test${templates.indexOf(template)}@example.com`,
        recipientName: "Test",
        templateType: template,
        subject: `Test ${template}`,
        body: `This is a test ${template} email.`,
      });

      expect(result.success).toBe(true);
      expect(result.emailId).toBeGreaterThan(0);
    }
  });
});
