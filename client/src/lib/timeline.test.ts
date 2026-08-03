import { describe, expect, it } from "vitest";
import { buildTimeline } from "./timeline";

/** 2026-08-01 09:00 UTC and 2026-07-15 12:00 UTC as fixed reference points. */
const AUG = Date.UTC(2026, 7, 1, 9, 0, 0);
const JUL = Date.UTC(2026, 6, 15, 12, 0, 0);

describe("buildTimeline", () => {
  it("returns an empty list when there is nothing to show", () => {
    expect(buildTimeline({})).toEqual([]);
    expect(buildTimeline({ activityLogs: [], notes: [], emails: [], tasks: [], receipts: [] })).toEqual([]);
  });

  it("maps activity types to timeline kinds and keeps the author", () => {
    const out = buildTimeline({
      activityLogs: [
        { id: 1, activityType: "call", title: "Call logged — Reached", description: "said next week", createdAt: AUG, authorName: "Kostas" },
        { id: 2, activityType: "status_change", title: "Status reviewed — Broken", createdAt: AUG, authorName: "Kostas" },
        { id: 3, activityType: "promise", title: "Promise-to-Pay by 05/08/2026", createdAt: AUG },
        { id: 4, activityType: "something_else", title: "Collection notes updated", createdAt: AUG },
      ],
    });
    expect(out.map(e => e.kind).sort()).toEqual(["call", "note", "promise", "status"]);
    expect(out.find(e => e.id === "log-1")).toMatchObject({ author: "Kostas", body: "said next week" });
  });

  it("sorts newest first across every source", () => {
    const out = buildTimeline({
      activityLogs: [{ id: 1, activityType: "call", title: "Older call", createdAt: JUL }],
      receipts: [{ id: 9, receiptDate: AUG, amount: "1200.50", receiptNumber: "RCP-1" }],
    });
    expect(out.map(e => e.id)).toEqual(["receipt-9", "log-1"]);
    expect(out[0]).toMatchObject({ kind: "payment", amount: 1200.5, title: "Payment received · RCP-1" });
  });

  it("uses group note content as the body", () => {
    const out = buildTimeline({ notes: [{ id: 5, content: "call after 15:00", createdAt: AUG, authorName: "Faye" }] });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "note", body: "call after 15:00", author: "Faye" });
  });

  it("drops entries with no usable timestamp instead of dating them to 1970", () => {
    const out = buildTimeline({
      tasks: [{ id: 1, title: "Ghost task", status: "Pending", createdAt: null, dueDate: null }],
      emails: [{ id: 2, subject: "No date", sentAt: null, createdAt: null }],
    });
    expect(out).toEqual([]);
  });

  it("falls back to the due date when a task has no creation time", () => {
    const out = buildTimeline({ tasks: [{ id: 7, title: "Check promise", status: "Pending", createdAt: null, dueDate: AUG }] });
    expect(out[0]).toMatchObject({ id: "task-7", kind: "task", title: "Check promise · Pending" });
  });

  it("labels a failed email differently from a sent one when the subject is missing", () => {
    const out = buildTimeline({
      emails: [
        { id: 1, subject: null, status: "Failed", sentAt: AUG },
        { id: 2, subject: "   ", status: "Sent", sentAt: JUL },
      ],
    });
    expect(out.map(e => e.title)).toEqual(["Email failed", "Email sent"]);
  });

  it("de-duplicates the same event recorded in two sources", () => {
    // An email is logged both in email_history and in the activity log.
    const out = buildTimeline({
      activityLogs: [{ id: 1, activityType: "email", title: "Statement of account", createdAt: AUG }],
      emails: [{ id: 1, subject: "Statement of account", sentAt: AUG + 5_000 }],
    });
    expect(out).toHaveLength(1);
  });

  it("keeps distinct entries of the same kind at the same minute", () => {
    const out = buildTimeline({
      activityLogs: [
        { id: 1, activityType: "call", title: "Call logged — Reached", createdAt: AUG },
        { id: 2, activityType: "call", title: "Call logged — No Answer", createdAt: AUG },
      ],
    });
    expect(out).toHaveLength(2);
  });

  it("shows a note once even though writing it also logs a 'Note added' activity", () => {
    // addGroupNote stores the note row AND an activity line; the timeline must
    // keep only the note row, because that is the entry the user can edit.
    const out = buildTimeline({
      activityLogs: [{ id: 1, activityType: "note", title: "Note added", description: "this a test for testing", createdAt: AUG, authorName: "Kostas Vanos" }],
      notes: [{ id: 3, content: "this a test for testing", createdAt: AUG, authorName: "Kostas Vanos" }],
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "note-3", noteId: 3, title: "Note" });
  });

  it("still shows other note-kind activity lines, e.g. collection notes updates", () => {
    const out = buildTimeline({
      activityLogs: [{ id: 1, activityType: "note", title: "Collection notes updated", createdAt: AUG }],
    });
    expect(out.map(e => e.title)).toEqual(["Collection notes updated"]);
  });
});
