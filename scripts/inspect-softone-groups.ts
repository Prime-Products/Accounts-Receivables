import "dotenv/config";
import { inspectSoftOneGroupResolution } from "../server/lib/softoneSql";

async function main() {
  const result = await inspectSoftOneGroupResolution();
  console.log(`SoftOne group resolution diagnostic:
  Total rows: ${result.totalRows}
  MASTERTRDR matches in dbo.TRDR: ${result.masterMatches}
  TRDGROUP matches in dbo.TRDR: ${result.groupMatches}
  Unresolved by both references: ${result.unresolvedRows}`);
  process.exit(0);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "SoftOne group diagnostic failed.");
  process.exitCode = 1;
});
