import "dotenv/config";
import { syncSoftOnePaidInvoices } from "../server/lib/softoneInvoices";
import { withSoftOneSyncLock } from "../server/lib/softoneSyncLock";

try {
  console.log("[SoftOne] Starting paid invoice synchronization...");
  const execution = await withSoftOneSyncLock(() =>
    syncSoftOnePaidInvoices(stage => {
      console.log(`[SoftOne] ${stage}...`);
    }),
  );
  if (!execution.acquired) throw new Error("SoftOne synchronization is already running.");
  console.log(
    `SoftOne paid invoice sync completed: ${execution.result.synced} record(s) for ${execution.result.year}.`,
  );
  process.exit(0);
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "SoftOne paid invoice sync failed.",
  );
  process.exit(1);
}
