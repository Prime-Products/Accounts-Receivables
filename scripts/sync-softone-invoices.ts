import "dotenv/config";
import { syncSoftOneOpenInvoices } from "../server/lib/softoneInvoices";

try {
  const result = await syncSoftOneOpenInvoices();
  console.log(`SoftOne open invoice sync completed: ${result.synced} records.`);
  process.exit(0);
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "SoftOne open invoice sync failed.",
  );
  process.exit(1);
}
