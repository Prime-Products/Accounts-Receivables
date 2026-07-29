import "dotenv/config";
import { inspectSoftOneOpenInvoices } from "../server/lib/softoneInvoices";

try {
  const result = await inspectSoftOneOpenInvoices();
  console.log(`SoftOne open invoice diagnostic:
  Grouped source rows: ${result.sourceSummary.groupedRows}
  Positive calculated open: ${result.sourceSummary.positiveOpen}
  Zero calculated open: ${result.sourceSummary.zeroOpen}
  Negative calculated open: ${result.sourceSummary.negativeOpen}
  Positive TAMNT: ${result.sourceSummary.positiveOriginal}
  Positive OPNTAMNT (remaining candidate): ${result.sourceSummary.positiveRemaining}
  Zero OPNTAMNT: ${result.sourceSummary.zeroRemaining}
  Negative OPNTAMNT: ${result.sourceSummary.negativeRemaining}
  Positive TAMNT without positive calculated open: ${result.sourceSummary.positiveOriginalWithoutPositiveOpen}
  Current open candidates: ${result.total}
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
