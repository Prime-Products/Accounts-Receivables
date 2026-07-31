import "dotenv/config";
import { inspectSoftOneVessels } from "../server/lib/softoneVessels";

try {
  const result = await inspectSoftOneVessels();
  console.log(`SoftOne vessel diagnostic:
  Active vessels: ${result.total}
  With active contract: ${result.withActiveContract}
  Without active contract: ${result.withoutActiveContract}`);
  for (const vessel of result.preview) {
    console.log(
      `  ${vessel.id} | ${vessel.name} | IMO ${vessel.imo ?? "-"} | ${vessel.vesselType ?? "-"} | ${vessel.ownerName ?? "-"} | active contract: ${vessel.hasActiveContract ? "yes" : "no"}`,
    );
  }
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : "SoftOne vessel diagnostic failed.");
  process.exit(1);
}
