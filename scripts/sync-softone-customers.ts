import "dotenv/config";
import { syncSoftOneCustomers } from "../server/lib/softoneSql";

async function main() {
  const result = await syncSoftOneCustomers();
  console.log(`SoftOne customer sync completed: ${result.synced} records.`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "SoftOne customer sync failed.");
  process.exitCode = 1;
});
