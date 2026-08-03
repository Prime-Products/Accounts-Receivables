import "dotenv/config";
import { inspectSoftOneCreditNotes } from "../server/lib/softoneCreditNotes";

try {
  console.log("[SoftOne] Starting credit-note diagnostic...");
  const result = await inspectSoftOneCreditNotes(stage => console.log(`[SoftOne] ${stage}...`));
  const period = result.month ? `${result.year}-${String(result.month).padStart(2, "0")}` : String(result.year);
  console.log(`SoftOne credit-note diagnostic (${period}):\n  Total: ${result.total}\n  Open: ${result.open}\n  Partially used: ${result.partial}\n  Used: ${result.used}\n  Unused credit: ${result.openAmount.toFixed(2)}\n\nPreview:\n${result.preview.map(row => `  ${row.softoneId} | ${row.docNumber} | ${row.currency} ${row.amount} | open ${row.openAmount}`).join("\n")}`);
} catch (error) { console.error(error instanceof Error ? error.message : "SoftOne credit-note diagnostic failed."); process.exit(1); }
