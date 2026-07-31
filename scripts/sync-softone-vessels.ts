import "dotenv/config";
import { syncSoftOneVessels } from "../server/lib/softoneVessels";
import { withSoftOneSyncLock } from "../server/lib/softoneSyncLock";

try {
  const execution = await withSoftOneSyncLock(() => syncSoftOneVessels());
  if (!execution.acquired) throw new Error("SoftOne synchronization is already running.");
  console.log(`SoftOne vessel sync completed: ${execution.result.synced} vessel(s).`);
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : "SoftOne vessel sync failed.");
  process.exit(1);
}
