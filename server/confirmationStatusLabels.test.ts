import { describe, expect, it } from "vitest";
import { confirmationStatusLabel } from "./taskMarkers";

/**
 * The stored value stays "Broken" (no migration, no rewriting of history), but
 * every human-facing surface must read "Promise Broken". This pins the mapping
 * so a future refactor cannot quietly leak the raw DB value into the UI or into
 * an activity-log line.
 */
describe("confirmation status labels", () => {
  it("renders the stored Broken value as 'Promise Broken'", () => {
    expect(confirmationStatusLabel("Broken")).toBe("Promise Broken");
  });

  it("keeps the other labels unchanged", () => {
    expect(confirmationStatusLabel("Confirmed")).toBe("Promise to Pay");
    expect(confirmationStatusLabel("Pending Follow-up")).toBe("Pending Follow-up");
    expect(confirmationStatusLabel("Not Contacted")).toBe("Not Contacted");
    // Collectors call this outcome simply "Paid" — the wording the Log Call dialog
    // offers — so the label must not reintroduce the internal "Kept" phrasing.
    expect(confirmationStatusLabel("Kept")).toBe("Paid");
  });

  it("falls back to the raw value for unknown statuses", () => {
    expect(confirmationStatusLabel("Something New")).toBe("Something New");
  });

  it("uses the same label on the client as on the server", async () => {
    const { confirmationStatusLabels } = await import("../client/src/lib/format");
    expect(confirmationStatusLabels.Broken).toBe(confirmationStatusLabel("Broken"));
    expect(confirmationStatusLabels.Confirmed).toBe(confirmationStatusLabel("Confirmed"));
    expect(confirmationStatusLabels.Kept).toBe(confirmationStatusLabel("Kept"));
  });
});
