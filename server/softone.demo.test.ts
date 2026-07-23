import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the db module so seeders run without a live database.
vi.mock("./db", () => {
  const customers: any[] = [];
  const invoices: any[] = [];
  const syncLogs: any[] = [];
  let cid = 1;
  let iid = 1;
  return {
    listCustomers: vi.fn(async () => customers),
    createCustomer: vi.fn(async (c: any) => {
      const row = { id: cid++, ...c };
      customers.push(row);
      return row;
    }),
    updateCustomer: vi.fn(async () => undefined),
    listInvoices: vi.fn(async () => invoices),
    createInvoice: vi.fn(async (i: any) => {
      const row = { id: iid++, ...i };
      invoices.push(row);
      return row;
    }),
    updateInvoice: vi.fn(async () => undefined),
    addSyncLog: vi.fn(async (l: any) => {
      syncLogs.push(l);
    }),
    getCustomer: vi.fn(async () => undefined),
    listReceipts: vi.fn(async () => []),
    __state: { customers, invoices, syncLogs },
  };
});

import * as softone from "./lib/softone";
import * as db from "./db";

describe("softone demo seeders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getSoftoneConfig returns null when secrets are not set", () => {
    delete process.env.SOFTONE_BASE_URL;
    delete process.env.SOFTONE_USERNAME;
    delete process.env.SOFTONE_PASSWORD;
    expect(softone.getSoftoneConfig()).toBeNull();
  });

  it("seedDemoCustomers inserts the sample tier customers once (idempotent)", async () => {
    const first = await softone.seedDemoCustomers();
    expect(first.synced).toBe(8);
    const second = await softone.seedDemoCustomers();
    expect(second.synced).toBe(0);
    const state = (db as any).__state;
    const tiers = new Set(state.customers.map((c: any) => c.tier));
    for (const t of ["Platinum", "Gold", "Silver", "Bronze", "New"]) {
      expect(tiers.has(t)).toBe(true);
    }
  });

  it("seedDemoInvoices spreads invoices across aging buckets and is idempotent", async () => {
    const first = await softone.seedDemoInvoices();
    expect(first.synced).toBe(13);
    const second = await softone.seedDemoInvoices();
    expect(second.synced).toBe(0);
    const state = (db as any).__state;
    const now = Date.now();
    const overdue = state.invoices.filter((i: any) => i.dueDate < now && Number(i.paidAmount) < Number(i.amount));
    const current = state.invoices.filter((i: any) => i.dueDate >= now);
    expect(overdue.length).toBeGreaterThan(0);
    expect(current.length).toBeGreaterThan(0);
    // At least one invoice in the 90+ bucket
    const ninetyPlus = overdue.filter((i: any) => (now - i.dueDate) / 86400000 > 90);
    expect(ninetyPlus.length).toBeGreaterThan(0);
  });
});
