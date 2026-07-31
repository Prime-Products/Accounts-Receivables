import "dotenv/config";
import { syncSoftOneVesselOwner } from "../server/lib/softoneVessels";

const softoneId = Number(process.argv[2]);
if (!Number.isSafeInteger(softoneId) || softoneId <= 0) {
  console.error("Usage: pnpm run sync:softone-vessel-owner -- <TRDR>");
  process.exit(1);
}

try {
  const result = await syncSoftOneVesselOwner(softoneId);
  console.log(
    `SoftOne vessel owner synchronized to Hub: ${result.softoneId} | ${result.name}`,
  );
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : "SoftOne vessel owner sync failed.");
  process.exit(1);
}
