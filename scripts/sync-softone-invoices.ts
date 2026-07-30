import "dotenv/config";
import { syncSoftOneOpenInvoices } from "../server/lib/softoneInvoices";
import { withSoftOneSyncLock } from "../server/lib/softoneSyncLock";

try {
  const execution = await withSoftOneSyncLock(() => syncSoftOneOpenInvoices());
  if (!execution.acquired) throw new Error("SoftOne synchronization is already running.");
  console.log(`SoftOne open invoice sync completed: ${execution.result.synced} records.`);
  process.exit(0);
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "SoftOne open invoice sync failed.",
  );
  process.exit(1);
}
