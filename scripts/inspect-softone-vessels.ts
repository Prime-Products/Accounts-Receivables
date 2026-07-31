import "dotenv/config";
import { inspectSoftOneVessels } from "../server/lib/softoneVessels";

try {
  const result = await inspectSoftOneVessels();
  console.log(`SoftOne vessel diagnostic: ${result.total} active vessel(s).`);
  for (const vessel of result.preview) {
    console.log(
      `  ${vessel.id} | ${vessel.name} | IMO ${vessel.imo ?? "-"} | ${vessel.vesselType ?? "-"} | ${vessel.ownerName ?? "-"}`,
    );
  }
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : "SoftOne vessel diagnostic failed.");
  process.exit(1);
}
