import { describe, expect, it } from "vitest";
import {
  CERT_REMINDER_DAYS,
  certUrgency,
  certUrgencyClass,
  daysUntilExpiry,
  reachedReminderThreshold,
} from "@shared/certificateExpiry";
import { certReminderMarker, parseCertReminderMarker } from "./lib/certificateReminders";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 5, 1, 12, 0, 0);
const inDays = (d: number) => NOW + d * DAY;

describe("certificate expiry windows", () => {
  it("reminds at 60 and 15 days, the two windows the service agreement promises", () => {
    expect([...CERT_REMINDER_DAYS].sort((a, b) => a - b)).toEqual([15, 60]);
  });

  it("counts whole days left, rounding up so a partial day still counts", () => {
    expect(daysUntilExpiry(inDays(30), NOW)).toBe(30);
    expect(daysUntilExpiry(NOW + 0.5 * DAY, NOW)).toBe(1);
    expect(daysUntilExpiry(NOW - 3 * DAY, NOW)).toBe(-3);
  });

  it("classifies urgency by window boundary", () => {
    expect(certUrgency(inDays(90), NOW)).toBe("ok");
    expect(certUrgency(inDays(61), NOW)).toBe("ok");
    expect(certUrgency(inDays(60), NOW)).toBe("warning");
    expect(certUrgency(inDays(16), NOW)).toBe("warning");
    expect(certUrgency(inDays(15), NOW)).toBe("final");
    expect(certUrgency(inDays(1), NOW)).toBe("final");
    expect(certUrgency(NOW, NOW)).toBe("expired");
    expect(certUrgency(inDays(-5), NOW)).toBe("expired");
  });

  it("returns the tightest threshold reached, so the 15-day call wins over the 60-day one", () => {
    expect(reachedReminderThreshold(inDays(90), NOW)).toBeNull();
    expect(reachedReminderThreshold(inDays(45), NOW)).toBe(60);
    expect(reachedReminderThreshold(inDays(10), NOW)).toBe(15);
    // A certificate that lapsed unnoticed still produces its final reminder.
    expect(reachedReminderThreshold(inDays(-2), NOW)).toBe(15);
  });

  it("colours only certificates that need attention", () => {
    expect(certUrgencyClass(inDays(90), NOW)).toBe("");
    expect(certUrgencyClass(inDays(30), NOW)).toContain("amber");
    expect(certUrgencyClass(inDays(5), NOW)).toContain("red");
    expect(certUrgencyClass(inDays(-1), NOW)).toContain("red");
  });
});

describe("certificate reminder dedupe marker", () => {
  it("round-trips a certificate id and threshold", () => {
    const marker = certReminderMarker(42, 60);
    expect(marker).toBe("(Cert #42 @60d)");
    expect(parseCertReminderMarker(marker)).toEqual({ certificateId: 42, thresholdDays: 60 });
  });

  it("is found inside a full task description, which is how sent reminders are recognised", () => {
    const description =
      "FINAL WARNING — certificate CAL-1 for GX-3R (S/N 1) expires on 2026-06-16.\n" +
      certReminderMarker(7, 15);
    expect(parseCertReminderMarker(description)).toEqual({ certificateId: 7, thresholdDays: 15 });
  });

  it("distinguishes the two thresholds of the same certificate", () => {
    expect(certReminderMarker(7, 60)).not.toBe(certReminderMarker(7, 15));
  });

  it("ignores descriptions without a marker", () => {
    expect(parseCertReminderMarker(null)).toBeNull();
    expect(parseCertReminderMarker("")).toBeNull();
    expect(parseCertReminderMarker("Call the customer about certificate renewal")).toBeNull();
  });
});
