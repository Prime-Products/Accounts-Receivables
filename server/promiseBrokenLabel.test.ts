import { describe, expect, it } from "vitest";
import { confirmationStatusLabel } from "./taskMarkers";

/**
 * The stored value stays "Broken" (DB enum, history, filters), but every
 * human-facing surface now reads "Promise Broken" — the collectors' own wording
 * for a customer who committed and then did not pay. This pins the rename so a
 * future refactor cannot quietly bring back "Did not confirm".
 */
describe("Broken renders as 'Promise Broken'", () => {
  it("labels the stored Broken value", () => {
    expect(confirmationStatusLabel("Broken")).toBe("Promise Broken");
  });

  it("never reads 'Did not confirm' any more", () => {
    expect(confirmationStatusLabel("Broken")).not.toMatch(/did not confirm/i);
  });

  it("leaves the other statuses untouched", () => {
    expect(confirmationStatusLabel("Confirmed")).toBe("Promise to Pay");
    expect(confirmationStatusLabel("Pending Follow-up")).toBe("Pending Follow-up");
    expect(confirmationStatusLabel("Kept")).toBe("Paid");
    expect(confirmationStatusLabel("Not Contacted")).toBe("Not Contacted");
  });
});
