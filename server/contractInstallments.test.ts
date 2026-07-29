import { describe, it, expect } from "vitest";
import * as db from "./db";

/**
 * Contract installment flag — DB-level checks that back the
 * invoices.setContractInstallment / invoices.bulkMarkContractInstallments procedures.
 */
describe("contract installment flag", () => {
  it("invoices expose an isContractInstallment field", async () => {
    const invoices = await db.listInvoices();
    expect(invoices.length).toBeGreaterThan(0);
    // Column must exist on every row (tinyint/boolean, possibly 0/false)
    for (const inv of invoices.slice(0, 5)) {
      expect(inv).toHaveProperty("isContractInstallment");
    }
  });

  it("can toggle the flag on and off for a single invoice", async () => {
    const invoices = await db.listInvoices();
    const target = invoices.find(i => !i.isContractInstallment);
    expect(target).toBeDefined();
    if (!target) return;

    await db.updateInvoice(target.id, { isContractInstallment: true } as any);
    let updated = (await db.listInvoices()).find(i => i.id === target.id);
    expect(!!updated?.isContractInstallment).toBe(true);

    await db.updateInvoice(target.id, { isContractInstallment: false } as any);
    updated = (await db.listInvoices()).find(i => i.id === target.id);
    expect(!!updated?.isContractInstallment).toBe(false);
  });

  it("bulk marking by invoice number matches existing invoices only", async () => {
    const invoices = await db.listInvoices();
    const sample = invoices.slice(0, 3);
    const numbers = [...sample.map(i => i.invoiceNumber), "NON-EXISTENT-INV-999999"];
    const matched = invoices.filter(i => numbers.includes(i.invoiceNumber));
    expect(matched.length).toBe(sample.length);

    // Simulate the bulk procedure: flag matched, verify, then revert
    for (const inv of matched) {
      await db.updateInvoice(inv.id, { isContractInstallment: true } as any);
    }
    const after = await db.listInvoices();
    for (const inv of matched) {
      expect(!!after.find(i => i.id === inv.id)?.isContractInstallment).toBe(true);
    }
    for (const inv of matched) {
      await db.updateInvoice(inv.id, { isContractInstallment: false } as any);
    }
  });
});
