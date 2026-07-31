import { describe, expect, it } from "vitest";
import {
  buildTimeline,
  eventsFromActivity,
  eventsFromNotes,
  eventsFromPromises,
  eventsFromReceipts,
  eventsFromTasks,
  fallbackStory,
  shortDate,
  timelineStats,
} from "./lib/escalationHistory";

const D = (iso: string) => new Date(`${iso}T00:00:00Z`);
const ms = (iso: string) => D(iso).getTime();

/**
 * The escalation panel tells the story of a case instead of showing KPI tiles, so
 * the history assembly has to be faithful: every trace of work must land on one
 * chronological timeline, and the panel must still produce prose when the LLM is
 * unavailable.
 */
describe("escalation case history", () => {
  it("turns activity-log rows into typed events and keeps the collector's notes", () => {
    const events = eventsFromActivity(
      [
        {
          activityType: "call",
          title: "Call logged — Reached",
          description: "Contact: Maria · promised to pay next week",
          createdAt: D("2026-07-30"),
          createdBy: 7,
        },
        { activityType: "email", title: "SOA sent", description: null, createdAt: D("2026-07-20"), createdBy: 7 },
      ],
      id => (id === 7 ? "Maria Theologou" : null)
    );
    expect(events[0].kind).toBe("call");
    expect(events[0].detail).toContain("promised to pay next week");
    expect(events[0].who).toBe("Maria Theologou");
    expect(events[1].kind).toBe("email");
  });

  it("describes a promise with its amount, target date, status and reschedules", () => {
    const [e] = eventsFromPromises(
      [
        {
          amount: "66666.00",
          promisedDate: ms("2026-08-06"),
          status: "Broken",
          notes: "third attempt",
          rescheduleCount: 2,
          createdAt: D("2026-07-31"),
          customerId: 12,
        },
      ],
      id => (id === 12 ? "CAPITAL SHIP" : null)
    );
    expect(e.kind).toBe("promise");
    expect(e.what).toContain("€66,666");
    expect(e.what).toContain("06/08/2026");
    expect(e.what).toContain("Broken");
    expect(e.what).toContain("rescheduled 2x");
    expect(e.what).toContain("CAPITAL SHIP");
  });

  it("records how often a follow-up task was postponed", () => {
    const [e] = eventsFromTasks([
      {
        title: "Follow up on overdue balance",
        status: "Pending",
        dueDate: ms("2026-07-15"),
        rescheduleCount: 3,
        completionNotes: null,
        createdAt: D("2026-06-01"),
      },
    ]);
    expect(e.what).toContain("postponed 3x");
    expect(e.what).toContain("due 15/07/2026");
  });

  it("merges every source into one oldest-first timeline", () => {
    const timeline = buildTimeline([
      eventsFromNotes([{ content: "customer disputes freight", createdAt: ms("2026-05-10") }]),
      eventsFromReceipts([{ amount: "5000", receiptDate: ms("2026-06-15") }]),
      eventsFromActivity([
        { activityType: "call", title: "Call logged — No Answer", createdAt: D("2026-07-01"), createdBy: null },
      ]),
    ]);
    expect(timeline.map(e => e.kind)).toEqual(["note", "payment", "call"]);
    expect(timeline.map(e => shortDate(e.at))).toEqual(["10/05/2026", "15/06/2026", "01/07/2026"]);
  });

  it("keeps the most recent events when the history is longer than the cap", () => {
    const many = Array.from({ length: 80 }, (_, i) => ({
      activityType: "call",
      title: `Call ${i}`,
      createdAt: new Date(ms("2026-01-01") + i * 86400000),
      createdBy: null,
    }));
    const timeline = buildTimeline([eventsFromActivity(many)], 60);
    expect(timeline).toHaveLength(60);
    expect(timeline[0].what).toBe("Call 20");
    expect(timeline[59].what).toBe("Call 79");
  });

  it("counts calls by outcome so the story can quote the effort spent", () => {
    const timeline = buildTimeline([
      eventsFromActivity([
        { activityType: "call", title: "Call logged — Reached", createdAt: D("2026-07-01"), createdBy: null },
        { activityType: "call", title: "Call logged — No Answer", createdAt: D("2026-07-05"), createdBy: null },
        { activityType: "call", title: "Call logged — No Answer", createdAt: D("2026-07-09"), createdBy: null },
      ]),
      eventsFromReceipts([{ amount: "1000", receiptDate: ms("2026-07-10") }]),
    ]);
    const s = timelineStats(timeline);
    expect(s.calls).toBe(3);
    expect(s.callsReached).toBe(1);
    expect(s.callsNoAnswer).toBe(2);
    expect(s.payments).toBe(1);
    expect(s.caseAgeDays).toBe(9);
  });

  it("writes prose (not tiles) when the LLM is unavailable", () => {
    const stats = timelineStats(
      buildTimeline([
        eventsFromActivity([
          { activityType: "call", title: "Call logged — Reached", createdAt: D("2026-07-01"), createdBy: null },
          { activityType: "call", title: "Call logged — No Answer", createdAt: D("2026-07-08"), createdBy: null },
        ]),
      ])
    );
    const story = fallbackStory({
      group: "CAPITAL SHIP",
      overdueEur: 89715,
      overdueCount: 52,
      oldestOverdueDays: 226,
      promisesTotal: 3,
      promisesBroken: 2,
      stats,
      escalatedBy: "Maria Theologou",
    });
    // The story is about the escalated TASK, so the group-wide balance and the
    // aging of the whole relationship must NOT appear in it.
    expect(story).not.toContain("€89,715");
    expect(story).not.toContain("226");
    expect(story).toContain("2 τηλεφωνικές προσπάθειες");
    expect(story).toContain("3 υποσχέσεις");
    expect(story).toContain("Maria Theologou");
    // Prose, not a bullet list.
    expect(story).not.toContain("- ");
    expect(story).not.toContain("•");
  });

  it("does not invent counts that the record does not support", () => {
    const story = fallbackStory({
      group: "X",
      overdueEur: 1000,
      overdueCount: 1,
      oldestOverdueDays: 0,
      promisesTotal: 0,
      promisesBroken: 0,
      stats: timelineStats([]),
      escalatedBy: null,
    });
    expect(story).not.toContain("υποσχέσεις");
    expect(story).not.toContain("τηλεφωνικές");
    expect(story).toContain("διοίκηση");
  });
});
