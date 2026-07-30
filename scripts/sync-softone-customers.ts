import "dotenv/config";
import { syncSoftOneCustomers } from "../server/lib/softoneSql";
import { withSoftOneSyncLock } from "../server/lib/softoneSyncLock";

async function main() {
  const execution = await withSoftOneSyncLock(() => syncSoftOneCustomers());
  if (!execution.acquired) throw new Error("SoftOne synchronization is already running.");
  console.log(`SoftOne customer sync completed: ${execution.result.synced} records.`);
  process.exit(0);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "SoftOne customer sync failed.");
  process.exitCode = 1;
});
