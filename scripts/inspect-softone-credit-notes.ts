import "dotenv/config";
import { inspectSoftOneCreditNotes } from "../server/lib/softoneCreditNotes";

try {
  console.log("[SoftOne] Starting credit-note diagnostic...");
  const result = await inspectSoftOneCreditNotes(stage => console.log(`[SoftOne] ${stage}...`));
  console.log(`SoftOne credit-note diagnostic (${result.year}):\n  Total: ${result.total}\n  Open: ${result.open}\n  Partially used: ${result.partial}\n  Used: ${result.used}\n  Unused credit: ${result.openAmount.toFixed(2)}\n\nPreview:\n${result.preview.map(row => `  ${row.softoneId} | ${row.docNumber} | ${row.currency} ${row.amount} | open ${row.openAmount}`).join("\n")}`);
} catch (error) { console.error(error instanceof Error ? error.message : "SoftOne credit-note diagnostic failed."); process.exit(1); }
