import "dotenv/config";
import { testSoftOneSqlConnection } from "../server/lib/softoneSql";

async function main() {
  await testSoftOneSqlConnection();
  console.log("SoftOne SQL connection succeeded.");
}

main().catch(() => {
  console.error("SoftOne SQL connection failed.");
  process.exitCode = 1;
});
