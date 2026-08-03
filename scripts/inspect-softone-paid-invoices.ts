import "dotenv/config";
import { inspectSoftOnePaidInvoices } from "../server/lib/softoneInvoices";

try {
  console.log("[SoftOne] Starting paid invoice diagnostic...");
  const result = await inspectSoftOnePaidInvoices(stage => {
    console.log(`[SoftOne] ${stage}...`);
  });
  console.log(`SoftOne paid invoice diagnostic (${result.year}):
  Paid invoice candidates: ${result.total}
  Total source amount: ${result.amount.toFixed(2)}
${result.breakdown.map(row => `  ${row.key}: ${row.count}`).join("\n")}

Preview:
${result.preview
  .map(
    row =>
      `  ${row.softoneId} | ${row.invoiceNumber} | ${row.company} | ${row.currency} ${row.amount} | Paid`,
  )
  .join("\n")}`);
  process.exit(0);
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "SoftOne paid invoice diagnostic failed.",
  );
  process.exit(1);
}
