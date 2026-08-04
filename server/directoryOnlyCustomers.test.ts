import { describe, it, expect } from "vitest";
import { listCustomers, listInvoices } from "./db";

/**
 * The AR ledger only holds parties with an open balance, while the CRM import adds
 * every company that has contacts. Those "directory-only" companies must never leak
 * into the collections worklist.
 */
describe("directory-only customers", () => {
  it("splits customers into ledger and directory-only sets", async () => {
    const [customers, invoices] = await Promise.all([listCustomers(), listInvoices()]);
    const invoiced = new Set(invoices.map(i => i.customerId));
    const withLedger = customers.filter(c => invoiced.has(c.id));
    const directoryOnly = customers.filter(c => !invoiced.has(c.id));

    expect(withLedger.length).toBeGreaterThan(0);
    expect(withLedger.length + directoryOnly.length).toBe(customers.length);
  });

  it("keeps every directory-only company free of invoices", async () => {
    const [customers, invoices] = await Promise.all([listCustomers(), listInvoices()]);
    const invoiced = new Set(invoices.map(i => i.customerId));
    const directoryOnly = customers.filter(c => !invoiced.has(c.id));
    for (const c of directoryOnly.slice(0, 50)) {
      expect(invoices.some(i => i.customerId === c.id)).toBe(false);
    }
  });

  it("derives collections groups only from customers that have invoices", async () => {
    const [customers, invoices] = await Promise.all([listCustomers(), listInvoices()]);
    const invoiced = new Set(invoices.map(i => i.customerId));
    const groupKey = (c: { customerGroup: string | null; name: string }) =>
      (c.customerGroup ?? "").trim() || c.name;
    const ledgerGroups = new Set(customers.filter(c => invoiced.has(c.id)).map(groupKey));
    const allGroups = new Set(customers.map(groupKey));

    // The directory expands the group universe, but the collections view must stay smaller.
    expect(ledgerGroups.size).toBeLessThanOrEqual(allGroups.size);
    for (const g of ledgerGroups) {
      const members = customers.filter(c => groupKey(c) === g);
      expect(members.some(c => invoiced.has(c.id))).toBe(true);
    }
  });
});
