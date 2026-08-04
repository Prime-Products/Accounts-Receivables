/**
 * Global teardown for the whole vitest run.
 *
 * Every mutation writes an audit row under the fake user the suites use, and
 * those rows are invisible in the UI until someone opens the audit trail — so
 * they had silently grown to 53,781 rows (against 634 real ones). Sweeping them
 * once at the end of the run keeps the trail readable without asking every suite
 * to remember it.
 */
import { purgeTestAuditRows } from "./testCleanup";

/**
 * Vitest calls `setup` once before the run and the returned function once after
 * it, so the sweep happens exactly once no matter how many suites ran.
 */
export async function setup() {
  return async () => {
    await purgeTestAuditRows().catch(() => undefined);
  };
}
