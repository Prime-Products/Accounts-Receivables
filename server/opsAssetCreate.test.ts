import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const page = readFileSync(join(root, "client/src/pages/ops/OpsAssets.tsx"), "utf8");
const router = readFileSync(join(root, "server/routers/operations.ts"), "utf8");
const schema = readFileSync(join(root, "drizzle/schema.ts"), "utf8");

/**
 * "New Asset" was impossible to complete: the dialog demanded a Contract, but the
 * ops_contracts table is empty, so the dropdown had no options and the Create
 * button stayed disabled forever. The server had always accepted contractId as
 * optional. On top of that vesselId was posted but had no control in the form,
 * so an asset could never be placed on a vessel at creation time.
 */
describe("New Asset dialog — creation is not blocked by empty lookups", () => {
  it("does not require a contract to enable the Create button", () => {
    expect(page).not.toMatch(/disabled=\{!form\.contractId/);
    // Only the two fields the server marks as required gate the button.
    expect(page).toMatch(/disabled=\{!form\.serialNumber\.trim\(\) \|\| !form\.name\.trim\(\)/);
  });

  it("sends contractId only when one was actually picked", () => {
    expect(page).toMatch(/contractId: form\.contractId \? Number\(form\.contractId\) : undefined/);
  });

  it("labels contract, vessel and product as optional", () => {
    for (const label of ["Product", "Vessel", "Contract"]) {
      const idx = page.indexOf(`<Label>${label} `);
      expect(idx, `${label} label missing`).toBeGreaterThan(-1);
      expect(page.slice(idx, idx + 160)).toMatch(/\(optional\)/);
    }
  });

  it("explains empty catalog and contract dropdowns instead of showing a blank list", () => {
    expect(page).toMatch(/No products in the catalog yet/);
    expect(page).toMatch(/No contracts yet/);
  });

  it("offers a searchable vessel select so vesselId can actually be set", () => {
    expect(page).toMatch(/trpc\.vessels\.list\.useQuery\(\)/);
    expect(page).toMatch(/vesselOptions/);
    expect(page).toMatch(/placeholder="Search vessel\.\.\."/);
    // Typing in the search box must not be swallowed by the Select's keyboard nav.
    expect(page).toMatch(/onKeyDown=\{e => e\.stopPropagation\(\)\}/);
    expect(page).toMatch(/vesselId: form\.vesselId \? Number\(form\.vesselId\) : undefined/);
  });

  it("captures initial status, return port and notes on creation", () => {
    expect(page).toMatch(/<Label>Initial Status<\/Label>/);
    expect(page).toMatch(/status: form\.status/);
    expect(page).toMatch(/targetReturnPort: form\.targetReturnPort\.trim\(\) \|\| undefined/);
    expect(page).toMatch(/notes: form\.notes\.trim\(\) \|\| undefined/);
    // The server must accept the status the dialog now sends.
    expect(router).toMatch(/status: z\.enum\(opsAssetStatuses\)\.optional\(\)/);
  });
});

describe("Asset status vocabulary matches the schema", () => {
  const statuses = ["Not Supplied", "In Transit", "Active", "Pending Return", "Returned"];

  it("uses exactly the statuses defined in drizzle/schema.ts", () => {
    const declared = schema.match(/export const opsAssetStatuses = \[(.*?)\] as const;/s)?.[1] ?? "";
    for (const s of statuses) expect(declared).toContain(`"${s}"`);
    // "Written Off" was rendered in the UI but never existed in the enum.
    expect(declared).not.toContain("Written Off");
    expect(page).not.toContain("Written Off");
  });

  it("gives every status a badge colour, including In Transit", () => {
    const colours = page.match(/const statusColors[\s\S]*?\n\};/)?.[0] ?? "";
    for (const s of statuses) {
      expect(colours, `${s} has no colour`).toMatch(new RegExp(`["']?${s}["']?:`));
    }
  });

  it("derives every status dropdown from one shared list", () => {
    expect(page).toMatch(/const ASSET_STATUSES = \[/);
    // Status filter, row-level status switch and the create dialog all map over it.
    const occurrences = page.match(/ASSET_STATUSES\.map/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(3);
  });
});
