import "dotenv/config";
import { syncSoftOneInvoices } from "../server/lib/softoneInvoices";
import { withSoftOneSyncLock } from "../server/lib/softoneSyncLock";

try {
  const execution = await withSoftOneSyncLock(() => syncSoftOneInvoices());
  if (!execution.acquired) throw new Error("SoftOne synchronization is already running.");
  console.log(
    `SoftOne invoice sync completed: ${execution.result.openSynced} open and ${execution.result.paidSynced} paid record(s).`,
  );
  process.exit(0);
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "SoftOne open invoice sync failed.",
  );
  process.exit(1);
}
