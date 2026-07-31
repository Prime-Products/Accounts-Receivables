import "dotenv/config";
import { inspectSoftOneContractInstallments } from "../server/lib/softoneContractInstallments";

try {
  const result = await inspectSoftOneContractInstallments();
  console.log(`SoftOne contract installment diagnostic:
  Active installment rows: ${result.activeInstallmentRows}
  Distinct installment invoices: ${result.distinctInvoices}
  Invoice assignments with duplicates: ${result.duplicateInvoices}
  With customer: ${result.withCustomer}
  With vessel: ${result.withVessel}
  Currently open invoices: ${result.openInvoices}
  Currently overdue invoices: ${result.overdueInvoices}
  Open amount: ${result.openAmount.toFixed(2)}
  Overdue amount: ${result.overdueAmount.toFixed(2)}
  Open invoice preview:`);
  for (const row of result.preview) {
    console.log(
      `  ${row.invoiceNumber ?? row.findoc} | ${row.customerName ?? row.customerSoftoneId} | ${row.vesselName ?? row.vesselId} | due ${String(row.dueDate)} | outstanding ${row.outstanding.toFixed(2)} | contract ${row.contractId}${row.assignmentCount > 1 ? ` | assignments ${row.assignmentCount}` : ""}`,
    );
  }
  process.exit(0);
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : "SoftOne contract installment diagnostic failed.",
  );
  process.exit(1);
}
