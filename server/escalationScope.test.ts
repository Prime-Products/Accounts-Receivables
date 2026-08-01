import { describe, it, expect } from "vitest";
import { scopeToTask, fallbackStory, timelineStats, type CaseEvent } from "./lib/escalationHistory";

const DAY = 86400000;
const ev = (daysAgo: number, kind: CaseEvent["kind"], what: string): CaseEvent => ({
  at: Date.now() - daysAgo * DAY,
  kind,
  what,
});

describe("escalation story scope", () => {
  const escalatedAt = Date.now();
  const startedAt = escalatedAt - 10 * DAY;

  it("keeps only events inside the escalated task's own window", () => {
    const events = [
      ev(400, "call", "Ancient call from another case"),
      ev(120, "promise", "Old promise, previous task"),
      ev(9, "call", "Call — Reached"),
      ev(6, "promise", "Promise €10,000 · status Broken"),
      ev(1, "call", "Call — No answer"),
    ];
    const scoped = scopeToTask(events, { startedAt, escalatedAt });
    expect(scoped).toHaveLength(3);
    expect(scoped.map(e => e.what)).toEqual([
      "Call — Reached",
      "Promise €10,000 · status Broken",
      "Call — No answer",
    ]);
  });

  it("includes events logged just before the task was created (grace window)", () => {
    // The triggering call is often logged minutes/hours before the follow-up task.
    const events = [ev(11, "call", "Triggering call"), ev(4, "note", "Note")];
    const scoped = scopeToTask(events, { startedAt, escalatedAt });
    expect(scoped.map(e => e.what)).toContain("Triggering call");
  });

  it("drops events logged after the escalation", () => {
    const events: CaseEvent[] = [
      ev(3, "call", "Before escalation"),
      { at: escalatedAt + 5 * DAY, kind: "note", what: "After escalation" },
    ];
    const scoped = scopeToTask(events, { startedAt, escalatedAt });
    expect(scoped.map(e => e.what)).toEqual(["Before escalation"]);
  });

  it("caps the scoped timeline so the prompt stays short", () => {
    const events = Array.from({ length: 40 }, (_, i) => ev(9 - i * 0.2, "call", `Call ${i}`));
    const scoped = scopeToTask(events, { startedAt, escalatedAt });
    expect(scoped.length).toBeLessThanOrEqual(25);
  });

  it("fallback story stays about the task and never opens with the group balance", () => {
    const stats = timelineStats([ev(5, "call", "Call — Reached"), ev(3, "call", "Call — No answer")]);
    const story = fallbackStory({
      group: "TEST GROUP",
      overdueEur: 89715,
      overdueCount: 52,
      oldestOverdueDays: 226,
      promisesTotal: 2,
      promisesBroken: 1,
      stats,
      escalatedBy: "Maria",
    });
    expect(story).not.toContain("89,715");
    expect(story).not.toContain("52 τιμολόγια");
    expect(story).toContain("τηλεφωνικές προσπάθειες");
    expect(story).toContain("Maria");
  });

  it("fallback story says nothing was recorded when the task window is empty", () => {
    const stats = timelineStats([]);
    const story = fallbackStory({
      group: "TEST GROUP",
      overdueEur: 1000,
      overdueCount: 1,
      oldestOverdueDays: 10,
      promisesTotal: 0,
      promisesBroken: 0,
      stats,
      escalatedBy: null,
    });
    expect(story).toContain("Δεν καταγράφηκαν ενέργειες");
  });
});
