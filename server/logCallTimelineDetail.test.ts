import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";
import { createTestCustomer, createTestInvoice, cleanupTestCustomers, type TestCustomerFixture } from "./testFixtures";
import type { TrpcContext } from "./_core/context";

/**
 * A single timeline entry must be readable on its own months later: which company
 * and person was called, what they answered, for how much and by when, plus the
 * collector's note. Regression guard for the report that a Pending Follow-up call
 * showed nothing but "Call logged — Reached".
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

describe("Log Call writes the full information into the timeline entry", () => {
  let fx: TestCustomerFixture;
  let contactId: number;

  beforeAll(async () => {
    fx = await createTestCustomer("TLDETAIL");
    await createTestInvoice(fx);
    contactId = await db.addPaymentContact({
      customerId: fx.id,
      name: "Maria Papadopoulou",
      email: "maria@example.com",
      phone: "+30 210 0000000",
      title: "Accounts Payable",
    } as any);
  });

  afterAll(async () => {
    await cleanupTestCustomers([fx]);
  });

  async function latestEntry() {
    // Several calls in this suite land in the same second, so createdAt ordering
    // is ambiguous — the highest id is the entry we just wrote.
    const rows = (await db.listActivityLog(fx.group, 50)) as any[];
    return rows.reduce((newest, r) => (newest == null || r.id > newest.id ? r : newest), null as any);
  }

  it("records status, amount, follow-up date, contact and note for a Pending Follow-up call", async () => {
    const followUpDate = Date.UTC(2026, 7, 20);
    await caller.calls.logCall({
      group: fx.group,
      customerId: fx.id,
      contactId,
      outcome: "Reached",
      confirmationStatus: "Pending Follow-up",
      confirmationAmount: 4500,
      followUpDate,
      notes: "Waiting for invoice approval from head office",
    });

    const entry = await latestEntry();
    const text = `${entry.title} ${entry.description ?? ""}`;

    expect(entry.title).toContain("Pending Follow-up");
    expect(text).toContain("4,500");
    expect(text).toContain("20/08/2026");
    expect(text).toContain("Maria Papadopoulou");
    expect(text).toContain("Waiting for invoice approval");
    expect(entry.customerId).toBe(fx.id);
  });

  it("records the promise amount and date for a Promise to Pay call", async () => {
    const promisedDate = Date.UTC(2026, 8, 15);
    await caller.calls.logCall({
      group: fx.group,
      customerId: fx.id,
      contactId,
      outcome: "Reached",
      confirmationStatus: "Confirmed",
      confirmationAmount: 12000,
      promisedDate,
      notes: "Will pay by wire transfer",
    });

    const entry = await latestEntry();
    const text = `${entry.title} ${entry.description ?? ""}`;
    expect(text).toContain("12,000");
    expect(text).toContain("15/09/2026");
    expect(text).toContain("Maria Papadopoulou");
    expect(text).toContain("Will pay by wire transfer");
  });

  it("still names the contact when it was typed manually instead of picked", async () => {
    await caller.calls.logCall({
      group: fx.group,
      customerId: fx.id,
      contactName: "Nikos (finance)",
      outcome: "Reached",
      confirmationStatus: "Broken",
      notes: "Refuses to commit to a date",
    });

    const entry = await latestEntry();
    const text = `${entry.title} ${entry.description ?? ""}`;
    expect(text).toContain("Nikos (finance)");
    // Stored value stays "Broken"; the log line must read the renamed label.
    expect(entry.title).toContain("Promise Broken");
    expect(text).toContain("Refuses to commit");
  });

  it("marks a no-answer attempt clearly and keeps the contact", async () => {
    await caller.calls.logCall({
      group: fx.group,
      customerId: fx.id,
      contactId,
      outcome: "No Answer",
      notes: "Rang twice, no pickup",
    });

    const entry = await latestEntry();
    const text = `${entry.title} ${entry.description ?? ""}`;
    expect(entry.title).toContain("No Answer");
    expect(text).toContain("Maria Papadopoulou");
    expect(text.toLowerCase()).toContain("no one answered");
  });

  it("writes exactly one entry per logged call", async () => {
    const before = (await db.listActivityLog(fx.group, 100)).length;
    await caller.calls.logCall({
      group: fx.group,
      customerId: fx.id,
      outcome: "Reached",
      confirmationStatus: "Confirmed",
      confirmationAmount: 500,
      promisedDate: Date.UTC(2026, 9, 1),
    });
    const after = (await db.listActivityLog(fx.group, 100)).length;
    expect(after - before).toBe(1);
  });
});
