import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Contact tracking: a logged call must always be traceable — who called, when,
 * and whether anyone actually answered. A "No Answer" attempt is deliberately
 * status-neutral and task-free, so these tests pin that shape.
 */
const router = readFileSync(join(process.cwd(), "server/routers/ar.ts"), "utf8");
const db = readFileSync(join(process.cwd(), "server/db.ts"), "utf8");
const dialog = readFileSync(join(process.cwd(), "client/src/components/LogCallDialog.tsx"), "utf8");
const desk = readFileSync(join(process.cwd(), "client/src/pages/Customers.tsx"), "utf8");
const groupCard = readFileSync(join(process.cwd(), "client/src/pages/GroupDetail.tsx"), "utf8");

describe("no-answer attempts", () => {
  it("keeps the two supported outcomes only", () => {
    expect(dialog).toContain('const OUTCOMES = ["Reached", "No Answer"] as const');
  });

  it("does not demand a customer response when nobody answered", () => {
    expect(dialog).toContain('if (outcome === "Reached" && !confirmationStatus)');
  });

  it("sends no status change for a no-answer attempt", () => {
    expect(dialog).toContain('confirmationStatus: outcome === "No Answer" ? undefined : confirmationStatus || "Not Contacted"');
  });

  it("disables the response select and explains what was recorded", () => {
    expect(dialog).toContain('disabled={outcome === "No Answer"}');
    expect(dialog).toContain("contact attempt");
  });

  it("never attaches a promise or follow-up payload to a no-answer attempt", () => {
    expect(dialog).toContain('if (outcome === "Reached" && confirmationStatus === "Confirmed")');
    expect(dialog).toContain('} else if (outcome === "Reached" && confirmationStatus === "Pending Follow-up")');
  });

  it("marks the attempt explicitly in the activity log", () => {
    expect(router).toContain('input.outcome === "No Answer" && !input.confirmationStatus');
    expect(router).toContain("Contact attempt — no one answered; status unchanged");
  });
});

describe("call summary aggregation", () => {
  it("exposes a single-query per-group call summary helper", () => {
    expect(db).toContain("export async function callSummaryByGroup()");
    expect(db).toContain('eq(activityLog.activityType, "call")');
  });

  it("counts unanswered attempts separately from total calls", () => {
    expect(db).toContain('const isNoAnswer = (r.title ?? "").includes("No Answer")');
    expect(db).toContain("noAnswer: isNoAnswer ? 1 : 0");
    expect(db).toContain("entry.calls++");
  });

  it("orders newest-first so the first row per group is the latest call", () => {
    expect(db).toContain("orderBy(desc(activityLog.createdAt))");
  });

  it("surfaces the summary on the groups payload", () => {
    expect(router).toContain("db.callSummaryByGroup()");
    for (const field of ["lastCallAt:", "lastCallBy:", "callCount:", "noAnswerCount:"]) {
      expect(router).toContain(field);
    }
  });

  it("resolves the caller to a team member name, not a raw id", () => {
    expect(router).toContain("lastCallBy: reviewerName(");
  });
});

describe("Collections Desk contact visibility", () => {
  /**
   * The "Last Contact" column was removed from the Desk at the user's request
   * (2 Aug 2026): contact history belongs on the group card timeline, the Desk
   * stays narrow. What must survive is the ability to *filter* the Desk by
   * contact recency, and the recency read-out on the group card itself.
   */
  it("keeps the Desk free of a Last Contact column", () => {
    expect(desk).not.toContain('label="Last Contact"');
    expect(desk).not.toContain("LastContactCell");
  });

  it("still filters on groups that have never been called", () => {
    expect(desk).toContain('contactFilter === "never" && lastCallAt == null');
  });

  it("shows relative recency on the group card rather than a raw timestamp", () => {
    expect(groupCard).toContain('if (days === 1) return "yesterday"');
  });

  it("offers a contact-recency filter including a never-called option", () => {
    expect(desk).toContain("contactFilter");
    expect(desk).toContain('<SelectItem value="never">Never called</SelectItem>');
    expect(desk).toContain('<SelectItem value="unanswered">Has unanswered attempts</SelectItem>');
    expect(desk).toContain('<SelectItem value="called-today">Called today</SelectItem>');
  });

  it("treats never-called groups as overdue for a call in the N-days filters", () => {
    expect(desk).toContain("(ageDays == null || ageDays >= Number(contactFilter))");
  });

  it("recomputes the list when the contact filter changes", () => {
    expect(desk).toContain("collectorFilter, contactFilter, dueFilter, groupSort]");
  });
});
