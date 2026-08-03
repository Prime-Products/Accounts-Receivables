import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { confirmationStatusLabel } from "./taskMarkers";
import { collectionActionBucket, COLLECTION_ACTION_BUCKET } from "../client/src/lib/collectionStatusSort";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

/*
 * "Paid" is the outcome every collections call is aiming for, and it was the one
 * customer response the Log Call dialog could not record: the collector had to
 * either leave a stale Promise to Pay on the group or mis-file the payment as
 * "Did not confirm". These tests pin the whole rule the user asked for — the
 * status can be picked, it closes the month, and the group returns as
 * "Not Contacted" when the next month begins.
 */
describe("Log Call — Paid customer response", () => {
  const dialog = read("client/src/components/LogCallDialog.tsx");

  it("offers Paid as a customer response in the dialog", () => {
    expect(dialog).toMatch(/CONFIRMATION_STATUSES = \[[^\]]*"Kept"/);
    expect(dialog).toMatch(/Kept: "Paid"/);
  });

  it("lets the collector record the amount that was paid", () => {
    expect(dialog).toContain('confirmationStatus === "Kept"');
    expect(dialog).toMatch(/Amount paid \(EUR\)/);
  });

  it("tells the collector the group comes back next month", () => {
    const panel = dialog.slice(dialog.indexOf('{confirmationStatus === "Kept" && ('));
    expect(panel).toMatch(/Not Contacted/);
    expect(panel).toMatch(/next month/i);
  });

  it("labels the status as plain Paid everywhere (no internal 'Kept' wording)", () => {
    expect(confirmationStatusLabel("Kept")).toBe("Paid");
    expect(read("client/src/lib/format.ts")).toMatch(/Kept: "Paid"/);
  });
});

describe("Paid closes the collections cycle server-side", () => {
  const router = read("server/routers/ar.ts");

  it("settles the open promise as Kept rather than cancelling it", () => {
    expect(router).toContain("async function settleGroupPromiseAsPaid");
    const helper = router.slice(
      router.indexOf("async function settleGroupPromiseAsPaid"),
      router.indexOf("export const customersRouter"),
    );
    expect(helper).toMatch(/updatePromise\(open\.id, \{ status: "Kept" \}\)/);
  });

  it("cancels the tasks that only existed to chase the money", () => {
    const helper = router.slice(
      router.indexOf("async function settleGroupPromiseAsPaid"),
      router.indexOf("export const customersRouter"),
    );
    expect(helper).toMatch(/taskPromiseId\(t\) === open\.id/);
    expect(helper).toMatch(/isTaskOfGroup\(t, input\.group\)/);
    expect(helper.match(/status: "Cancelled"/g)?.length).toBe(2);
  });

  it("is invoked when a call is logged with the Paid status", () => {
    expect(router).toMatch(/if \(input\.confirmationStatus === "Kept"\) \{\s*await settleGroupPromiseAsPaid/);
  });

  it("keeps Paid as a closed outcome that resets at the start of a new month", () => {
    // isConfirmationStale is the single place the monthly reset is decided.
    expect(router).toMatch(/if \(status === "Kept"\) return isFromPreviousMonth/);
  });

  it("keeps 'Did not confirm' on the group when the new month starts", () => {
    // Only Paid may reset: a refusal must never silently look like an untouched group.
    const fn = router.slice(
      router.indexOf("function isConfirmationStale("),
      router.indexOf("function isFromPreviousMonth("),
    );
    expect(fn).not.toMatch(/"Broken"\) return isFromPreviousMonth/);
    expect(fn).toMatch(/return false;/);
  });
});

describe("Paid groups drop out of the calling list", () => {
  it("sorts Paid groups below every group that still needs a call", () => {
    const paid = collectionActionBucket({ confirmationStatus: "Kept", actionDate: null, actionDue: null });
    expect(paid).toBe(COLLECTION_ACTION_BUCKET.paid);
    expect(paid).toBeGreaterThan(collectionActionBucket({ confirmationStatus: "Not Contacted" }));
    expect(paid).toBeGreaterThan(
      collectionActionBucket({ confirmationStatus: "Confirmed", actionDate: Date.now(), actionDue: "overdue" }),
    );
  });

  it("can be filtered for on the Collections Desk", () => {
    const page = read("client/src/pages/Customers.tsx");
    expect(page).toMatch(/confirmationFilter === "paid" && g\.confirmationStatus === "Kept"/);
    expect(page).toContain('<SelectItem value="paid">Paid</SelectItem>');
  });
});
