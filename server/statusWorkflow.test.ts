import { describe, expect, it } from "vitest";
import { normalizeStoredStatus, resolveGroupStatus } from "./lib/statusWorkflow";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

describe("resolveGroupStatus — unified account status workflow", () => {
  it("returns null (Normal) when no row and rule not triggered", () => {
    const r = resolveGroupStatus(null, false, now);
    expect(r.status).toBeNull();
  });

  it("returns Problematic when auto rule triggers and no override", () => {
    const r = resolveGroupStatus(null, true, now);
    expect(r.status).toBe("Problematic");
  });

  it("manual Normal override clears the auto Problematic flag", () => {
    const r = resolveGroupStatus({ status: "Normal", problematicSince: null }, true, now);
    expect(r.status).toBeNull();
  });

  it("manual Problematic override applies even when rule not triggered", () => {
    const r = resolveGroupStatus({ status: "Problematic", problematicSince: now - 5 * DAY }, false, now);
    expect(r.status).toBe("Problematic");
  });

  it("does NOT auto-escalate Problematic after 30+ days (escalation removed)", () => {
    const r = resolveGroupStatus({ status: "Problematic", problematicSince: now - 31 * DAY }, true, now);
    expect(r.status).toBe("Problematic");
    expect(r.escalated).toBe(false);
  });

  it("Under Review override wins over the auto rule", () => {
    const r = resolveGroupStatus({ status: "Under Review", problematicSince: null }, true, now);
    expect(r.status).toBe("Under Review");
  });

  it("On Hold override wins over the auto rule", () => {
    const r = resolveGroupStatus({ status: "On Hold", problematicSince: null }, true, now);
    expect(r.status).toBe("On Hold");
  });

  it("Legal override wins over the auto rule", () => {
    const r = resolveGroupStatus({ status: "Legal", problematicSince: now - 60 * DAY }, true, now);
    expect(r.status).toBe("Legal");
  });

  it("legacy 'On Watch' and 'Critical' rows are treated as Problematic", () => {
    expect(resolveGroupStatus({ status: "On Watch", problematicSince: null }, false, now).status).toBe("Problematic");
    expect(resolveGroupStatus({ status: "Critical", problematicSince: null }, false, now).status).toBe("Problematic");
  });

  it("legacy 'Resolved' rows are treated as Normal", () => {
    const r = resolveGroupStatus({ status: "Resolved", problematicSince: null }, true, now);
    expect(r.status).toBeNull();
  });

  it("legacy 'Eligible for On Hold' rows map to On Hold", () => {
    expect(normalizeStoredStatus("Eligible for On Hold")).toBe("On Hold");
    const r = resolveGroupStatus({ status: "Eligible for On Hold", problematicSince: null }, false, now);
    expect(r.status).toBe("On Hold");
  });
});
