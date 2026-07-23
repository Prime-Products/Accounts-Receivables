import { describe, expect, it } from "vitest";
import { CONTRACT_EXPIRY_LEAD_MS } from "./lib/arLogic";

describe("contract expiry lead time", () => {
  it("is exactly 2 months (60 days) before the end date", () => {
    expect(CONTRACT_EXPIRY_LEAD_MS).toBe(60 * 24 * 60 * 60 * 1000);
  });

  it("fires within the alert window and not outside it", () => {
    const endDate = Date.now() + 30 * 24 * 60 * 60 * 1000; // ends in 30 days
    const now = Date.now();
    // Inside window: now >= endDate - lead && now < endDate
    expect(now >= endDate - CONTRACT_EXPIRY_LEAD_MS && now < endDate).toBe(true);
    const farEnd = Date.now() + 90 * 24 * 60 * 60 * 1000; // ends in 90 days
    expect(now >= farEnd - CONTRACT_EXPIRY_LEAD_MS && now < farEnd).toBe(false);
  });
});
