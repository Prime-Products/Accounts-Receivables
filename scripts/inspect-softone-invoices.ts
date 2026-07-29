import "dotenv/config";
import { inspectSoftOneOpenInvoices } from "../server/lib/softoneInvoices";

try {
  const result = await inspectSoftOneOpenInvoices();
  console.log(`SoftOne open invoice diagnostic:
  Total open invoices: ${result.total}
${result.breakdown.map(row => `  ${row.key}: ${row.count}`).join("\n")}

Preview:
${result.preview
  .map(
    row =>
      `  ${row.softoneId} | ${row.invoiceNumber} | ${row.company} | ${row.currency} ${row.amount} | due ${new Date(row.dueDate).toISOString().slice(0, 10)}`,
  )
  .join("\n")}`);
  process.exit(0);
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "SoftOne invoice diagnostic failed.",
  );
  process.exit(1);
}
