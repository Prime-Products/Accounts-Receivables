import { describe, expect, it } from "vitest";
import { resolveGroupStatus } from "./lib/statusWorkflow";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

describe("resolveGroupStatus — unified status workflow", () => {
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

  it("auto-escalates Problematic to Critical after 30 consecutive days", () => {
    const r = resolveGroupStatus({ status: "Problematic", problematicSince: now - 31 * DAY }, true, now);
    expect(r.status).toBe("Critical");
    expect(r.escalated).toBe(true);
  });

  it("escalates a rule-flagged (Auto) group after 30 days too", () => {
    const r = resolveGroupStatus({ status: "Auto", problematicSince: now - 31 * DAY }, true, now);
    expect(r.status).toBe("Critical");
  });

  it("does NOT escalate before 30 days", () => {
    const r = resolveGroupStatus({ status: "Problematic", problematicSince: now - 29 * DAY }, true, now);
    expect(r.status).toBe("Problematic");
  });

  it("manual Critical override is respected", () => {
    const r = resolveGroupStatus({ status: "Critical", problematicSince: null }, false, now);
    expect(r.status).toBe("Critical");
  });

  it("Legal override wins over the auto rule", () => {
    const r = resolveGroupStatus({ status: "Legal", problematicSince: now - 60 * DAY }, true, now);
    expect(r.status).toBe("Legal");
  });

  it("Resolved override wins over the auto rule", () => {
    const r = resolveGroupStatus({ status: "Resolved", problematicSince: null }, true, now);
    expect(r.status).toBe("Resolved");
  });

  it("legacy 'On Watch' rows are treated as Problematic", () => {
    const r = resolveGroupStatus({ status: "On Watch", problematicSince: null }, false, now);
    expect(r.status).toBe("Problematic");
  });
});
