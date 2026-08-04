import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Regression guard for the "REEDEREI NORD" bug: the Log Call dialog offered to
 * reschedule a promise for a group the Desk showed as "Not Contacted", because a
 * leftover Pending promise row with no task at all was treated as open forever.
 *
 * The rule now is:
 *  - a Pending promise with a LIVE check task is always open (Promises page can
 *    create one without touching the confirmation status row);
 *  - a Pending promise with NO live task is open only while the group's effective
 *    confirmation status still carries a commitment; otherwise it is swept to Broken.
 */
const src = readFileSync(join(__dirname, "routers", "ar.ts"), "utf8");
const lookup = (() => {
  const start = src.indexOf("async function findOpenGroupPromise(");
  expect(start).toBeGreaterThan(-1);
  const end = src.indexOf("\n}", src.indexOf("return null;", start));
  return src.slice(start, end);
})();

describe("open-promise lookup agrees with the group's collection status", () => {
  it("consults the group confirmation status row", () => {
    expect(lookup).toContain("getGroupConfirmationStatus(group)");
    expect(lookup).toContain("effectiveConfirmation");
  });

  it("treats Not Contacted / Kept / Broken groups as carrying no commitment", () => {
    for (const status of ["Not Contacted", "Kept", "Broken"]) {
      expect(lookup).toContain(`"${status}"`);
    }
  });

  it("keeps a promise open when a live check task exists, before consulting the status", () => {
    const liveTaskReturn = lookup.indexOf("linked.some(isLive)");
    const statusCheck = lookup.indexOf("carriesCommitment()");
    expect(liveTaskReturn).toBeGreaterThan(-1);
    expect(statusCheck).toBeGreaterThan(-1);
    expect(liveTaskReturn).toBeLessThan(statusCheck);
  });

  it("sweeps orphaned rows to Broken instead of leaving them Pending", () => {
    expect(lookup).toMatch(/updatePromise\(p\.id, \{ status: "Broken" \}\)/);
  });

  it("no longer returns task-less promises unconditionally", () => {
    expect(lookup).not.toContain("linked.length === 0 || linked.some(isLive)");
  });
});
