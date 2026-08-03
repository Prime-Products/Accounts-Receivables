import "dotenv/config";
import { syncSoftOneCreditNoteCustomer } from "../server/lib/softoneCreditNotes";

const softoneId = Number(process.env.SOFTONE_SQL_CREDIT_NOTE_CUSTOMER_ID ?? process.argv[2]);
if (!Number.isSafeInteger(softoneId) || softoneId <= 0) {
  console.error("Set SOFTONE_SQL_CREDIT_NOTE_CUSTOMER_ID to the approved TRDR.");
  process.exit(1);
}

try {
  console.log(`[SoftOne] Starting approved credit-note customer ${softoneId}...`);
  const result = await syncSoftOneCreditNoteCustomer(softoneId);
  console.log(`SoftOne credit-note customer synchronized to Hub: ${result.softoneId} | ${result.name}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "SoftOne credit-note customer sync failed.");
  process.exit(1);
}
