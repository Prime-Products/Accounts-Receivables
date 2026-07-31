/**
 * Automatic Task Engine.
 * Generates SOP follow-up tasks (+2, +15, +20, +30 days from invoice due date)
 * and contract expiry tasks (2 months before end date).
 */
import * as db from "../db";
import { CONTRACT_EXPIRY_LEAD_MS, dueSopOffsets, isOpenInvoice } from "./arLogic";

export async function runTaskEngine(now = Date.now()) {
  let created = 0;

  // 1) SOP follow-ups for overdue open invoices
  const invoices = await db.listInvoices();
  const customersById = new Map((await db.listCustomers()).map(c => [c.id, c]));
  for (const inv of invoices) {
    if (!isOpenInvoice(inv)) continue;
    if (now <= inv.dueDate) continue;
    const offsets = dueSopOffsets(inv.dueDate, now);
    for (const off of offsets) {
      const existing = await db.findTaskByInvoiceAndType(inv.id, off.type);
      if (existing) continue;
      const customer = customersById.get(inv.customerId);
      await db.createTask({
        customerId: inv.customerId,
        invoiceId: inv.id,
        type: off.type,
        title: `${off.label}: ${customer?.name ?? "Customer"} — Invoice ${inv.invoiceNumber}`,
        description: `SOP ${off.label} (${off.days} days after due date) for invoice ${inv.invoiceNumber}.`,
        dueDate: inv.dueDate + off.days * 24 * 60 * 60 * 1000,
      });
      created++;
    }
  }

  // 2) Contract expiry notifications (2 months before end date)
  const contracts = await db.listContracts();
  for (const c of contracts) {
    const status: string = c.status;
    if (status === "Expired" || status === "Terminated") continue;
    if (now >= c.endDate - CONTRACT_EXPIRY_LEAD_MS && now < c.endDate) {
      if (status !== "Expiring Soon") await db.updateContract(c.id, { status: "Expiring Soon" });
      const existing = await db.findTaskByContractAndType(c.id, "Contract Expiry");
      if (!existing) {
        const customer = customersById.get(c.customerId);
        await db.createTask({
          customerId: c.customerId,
          contractId: c.id,
          type: "Contract Expiry",
          title: `Contract expiring: ${customer?.name ?? "Customer"} — ${c.contractNumber}`,
          description: `Contract "${c.title}" expires on ${new Date(c.endDate).toISOString().slice(0, 10)}. Initiate renewal discussion.`,
          dueDate: c.endDate - CONTRACT_EXPIRY_LEAD_MS,
        });
        created++;
      }
    } else if (now >= c.endDate && status !== "Expired") {
      await db.updateContract(c.id, { status: "Expired" });
    }
  }

  // 3) Invoice overdue state is derived from the due date at read time
  //    (see arLogic.isOverdue) and never written into invoices.status: an invoice
  //    stays Open / Partially Paid / Disputed and is flagged overdue on top of that.
  //    Nothing to sweep here.

  // 4) Mark overdue installments (installments keep their own lifecycle status)
  const installments = await db.listInstallments();
  for (const inst of installments) {
    if (inst.status === "Upcoming" && now > inst.dueDate) {
      await db.updateInstallment(inst.id, { status: "Overdue" });
    }
  }

  return { created };
}
