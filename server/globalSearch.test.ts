import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";

function makeCaller() {
  return appRouter.createCaller({
    user: { id: 1, openId: "test-open-id", role: "admin" as const, name: "Tester" },
  } as any);
}

describe("customers.search (global search)", () => {
  it("finds groups and companies by name fragment", async () => {
    const caller = makeCaller();
    const res = await caller.customers.search({ query: "MINERVA" });
    expect(res.groups.length).toBeGreaterThan(0);
    expect(res.groups.some(g => g.name.toUpperCase().includes("MINERVA"))).toBe(true);
    expect(res.companies.length).toBeGreaterThan(0);
  });

  it("finds invoices by invoice number fragment", async () => {
    const caller = makeCaller();
    // Pick a real invoice number prefix from the data
    const all = await caller.invoices.list();
    const sample = all[0];
    expect(sample).toBeDefined();
    const fragment = sample.invoiceNumber.slice(0, Math.min(6, sample.invoiceNumber.length));
    const res = await caller.customers.search({ query: fragment });
    expect(res.invoices.length).toBeGreaterThan(0);
    expect(res.invoices.some(i => i.invoiceNumber.includes(fragment))).toBe(true);
  });

  it("rejects queries shorter than 2 chars", async () => {
    const caller = makeCaller();
    await expect(caller.customers.search({ query: "a" })).rejects.toThrow();
  });
});
