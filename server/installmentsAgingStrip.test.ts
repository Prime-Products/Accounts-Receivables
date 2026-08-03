import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * The aging strip under the Installments filter looked broken: several buckets
 * legitimately hold zero installments, and clicking one of them emptied the
 * table with no way back. The strip itself was always correct (the server does
 * scope aging by `installmentsOnly`), so the fix is in the interaction:
 *  - empty buckets must not be clickable,
 *  - the empty table must say which bucket is empty and offer a clear action.
 */
const page = readFileSync(join(process.cwd(), "client/src/pages/Invoices.tsx"), "utf8");

describe("Invoices aging strip with the Installments filter", () => {
  it("scopes the aging query by the installments filter", () => {
    expect(page).toContain("useMemo(() => ({ installmentsOnly }), [installmentsOnly])");
    expect(page).toContain("trpc.invoices.aging.useQuery(agingInput)");
  });

  it("does not ship the temporary aging diagnostic logging", () => {
    expect(page).not.toContain("aging-debug");
  });

  it("treats a zero-count bucket as empty and disables it unless selected", () => {
    expect(page).toContain("const empty = aging.buckets[b].count === 0");
    expect(page).toContain("disabled={empty && !selected}");
    expect(page).toContain("No ${installmentsOnly ? \"installments\" : \"invoices\"} in this bucket");
  });

  it("keeps a selected bucket clickable so it can be toggled back off", () => {
    expect(page).toContain("onClick={() => setBucketFilter(selected ? \"all\" : b)}");
  });

  it("explains an empty result in terms of the active bucket and filter", () => {
    expect(page).toContain("No contract installments are ${bucketFilter} days overdue.");
    expect(page).toContain("days overdue under the current filters.");
  });

  it("offers a clear-filters escape from the empty state", () => {
    const emptyState = page.slice(page.indexOf("No invoices match the current filters."));
    expect(emptyState).toContain("Clear {activeFilterCount} filter");
    expect(emptyState).toContain("setBucketFilter(\"all\")");
    expect(emptyState).toContain("setContractFilter(\"all\")");
  });
});
