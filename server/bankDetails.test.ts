import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 999,
    openId: "test-bank-user",
    email: "test-bank@example.com",
    name: "Test Bank User",
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

describe("Bank Details", () => {
  let testCustomerId: number;

  beforeAll(async () => {
    // Create a test customer
    const testCustomer = await db.createCustomer({
      code: `TEST-BANK-${Date.now()}`,
      name: `Test Bank Customer ${Date.now()}`,
      email: "test-bank@example.com",
    });
    testCustomerId = testCustomer;
  });

  afterAll(async () => {
    // Clean up: delete bank details
    try {
      await db.deleteBankDetails(testCustomerId);
    } catch (e) {
      // Ignore if doesn't exist
    }
  });

  it("should create bank details for a customer", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.customers.saveBankDetails({
      customerId: testCustomerId,
      iban: "GR1234567890123456789012345",
      accountNumber: "12345678",
      bankName: "Eurobank",
      swiftCode: "ERBKGRAA",
      beneficiaryName: "Test Company",
      currency: "EUR",
    });

    expect(result.success).toBe(true);

    // Verify the data was saved
    const saved = await db.getBankDetailsByCustomerId(testCustomerId);
    expect(saved).toBeDefined();
    expect(saved?.iban).toBe("GR1234567890123456789012345");
    expect(saved?.bankName).toBe("Eurobank");
    expect(saved?.beneficiaryName).toBe("Test Company");
  });

  it("should retrieve bank details for a customer", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.customers.getBankDetails({
      customerId: testCustomerId,
    });

    expect(result).toBeDefined();
    expect(result?.iban).toBe("GR1234567890123456789012345");
    expect(result?.swiftCode).toBe("ERBKGRAA");
  });

  it("should update existing bank details", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.customers.saveBankDetails({
      customerId: testCustomerId,
      iban: "GR9876543210987654321098765",
      accountNumber: "87654321",
      bankName: "Alpha Bank",
      swiftCode: "CRBAGRAA",
      beneficiaryName: "Updated Company",
      currency: "EUR",
    });

    expect(result.success).toBe(true);

    // Verify the update
    const updated = await db.getBankDetailsByCustomerId(testCustomerId);
    expect(updated?.iban).toBe("GR9876543210987654321098765");
    expect(updated?.bankName).toBe("Alpha Bank");
    expect(updated?.beneficiaryName).toBe("Updated Company");
  });

  it("should delete bank details for a customer", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.customers.deleteBankDetails({
      customerId: testCustomerId,
    });

    expect(result.success).toBe(true);

    // Verify deletion
    const deleted = await db.getBankDetailsByCustomerId(testCustomerId);
    expect(deleted).toBeNull();
  });

  it("should handle partial bank details (nullable fields)", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Save with only IBAN and beneficiary
    await caller.customers.saveBankDetails({
      customerId: testCustomerId,
      iban: "GR1111111111111111111111111",
      beneficiaryName: "Minimal Company",
    });

    const saved = await db.getBankDetailsByCustomerId(testCustomerId);
    expect(saved?.iban).toBe("GR1111111111111111111111111");
    expect(saved?.beneficiaryName).toBe("Minimal Company");
    expect(saved?.bankName).toBeNull();
    expect(saved?.swiftCode).toBeNull();
    expect(saved?.accountNumber).toBeNull();
  });

  it("should return null for customer without bank details", async () => {
    // Create a new customer without bank details
    const newCustomer = await db.createCustomer({
      code: `TEST-EMPTY-${Date.now()}`,
      name: `Empty Bank Customer ${Date.now()}`,
      email: "empty-bank@example.com",
    });

    const result = await db.getBankDetailsByCustomerId(newCustomer);
    expect(result).toBeNull();
  });
});
