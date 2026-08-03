import "dotenv/config";
import { syncSoftOneCreditNotes } from "../server/lib/softoneCreditNotes";
import { withSoftOneSyncLock } from "../server/lib/softoneSyncLock";

try {
  console.log("[SoftOne] Starting credit-note synchronization...");
  const execution = await withSoftOneSyncLock(() => syncSoftOneCreditNotes(stage => console.log(`[SoftOne] ${stage}...`)));
  if (!execution.acquired) throw new Error("SoftOne synchronization is already running.");
  console.log(`SoftOne credit-note sync completed: ${execution.result.synced} record(s).`);
  process.exit(0);
} catch (error) { console.error(error instanceof Error ? error.message : "SoftOne credit-note sync failed."); process.exit(1); }
