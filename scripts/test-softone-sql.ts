import "dotenv/config";
import { softOneSqlError, testSoftOneSqlConnection } from "../server/lib/softoneSql";

async function main() {
  await testSoftOneSqlConnection();
  console.log("SoftOne SQL connection succeeded.");
}

main().catch(error => {
  console.error(softOneSqlError(error, "connection test"));
  process.exitCode = 1;
});
