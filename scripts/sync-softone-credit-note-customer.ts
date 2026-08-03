import "dotenv/config";
import { syncSoftOneCreditNoteCustomer } from "../server/lib/softoneCreditNotes";

const softoneId = Number(process.argv[2]);
if (!Number.isSafeInteger(softoneId) || softoneId <= 0) {
  console.error("Usage: pnpm run sync:softone-credit-note-customer -- <TRDR>");
  process.exit(1);
}

try {
  const result = await syncSoftOneCreditNoteCustomer(softoneId);
  console.log(`SoftOne credit-note customer synchronized to Hub: ${result.softoneId} | ${result.name}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "SoftOne credit-note customer sync failed.");
  process.exit(1);
}
