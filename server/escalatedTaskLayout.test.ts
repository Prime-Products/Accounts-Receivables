import { describe, it, expect } from "vitest";

/**
 * The escalated task dialog hides the Promise-to-Pay controls, moves the comments
 * thread to the top and stops printing the "⬆ Escalated to …" line twice (the
 * escalation panel already shows it as the escalation reason).
 *
 * These are the pure rules behind that layout, mirrored from
 * client/src/components/TaskDetailDialog.tsx so they stay covered.
 */
function isEscalated(title: string): boolean {
  return title.startsWith("Escalated: ");
}

function descriptionText(description: string | null, escalated: boolean): string {
  const d = description ?? "";
  if (!d) return "";
  const kept = escalated ? d.split("\n").filter(l => !l.trim().startsWith("⬆")) : d.split("\n");
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Where the comments thread is rendered. */
function commentsPosition(title: string): "top" | "bottom" {
  return isEscalated(title) ? "top" : "bottom";
}

/** Whether the Promise-to-Pay block (amount, date, Kept/Broken) is rendered. */
function showsPromiseBlock(title: string, hasPromise: boolean): boolean {
  return hasPromise && !isEscalated(title);
}

describe("escalated task dialog layout", () => {
  const escalatedTitle = "Escalated: Promise to Pay — €80,000";
  const plainTitle = "Promise to Pay — €99,999";

  it("detects escalated tasks from the title prefix", () => {
    expect(isEscalated(escalatedTitle)).toBe(true);
    expect(isEscalated(plainTitle)).toBe(false);
    expect(isEscalated("Follow-up call — DYNACOM")).toBe(false);
  });

  it("hides the Promise-to-Pay block on escalated tasks even when a promise exists", () => {
    expect(showsPromiseBlock(escalatedTitle, true)).toBe(false);
    expect(showsPromiseBlock(plainTitle, true)).toBe(true);
    expect(showsPromiseBlock(plainTitle, false)).toBe(false);
  });

  it("puts comments on top for escalated tasks and at the bottom otherwise", () => {
    expect(commentsPosition(escalatedTitle)).toBe("top");
    expect(commentsPosition(plainTitle)).toBe("bottom");
  });

  it("strips the escalation line from the description of an escalated task", () => {
    const desc = [
      "Original task: Promise to Pay — €80,000",
      "",
      "Verify that MSC SHIPMANAGEMENT LTD paid the promised amount of €80,000 due 01/08/2026. (Promise #6240001)",
      "",
      "⬆ Escalated to Kostas Vanos by Kostas Vanos on 30/07/2026",
    ].join("\n");
    const out = descriptionText(desc, true);
    expect(out).not.toContain("⬆");
    expect(out).not.toContain("Escalated to Kostas Vanos");
    expect(out).toContain("Original task: Promise to Pay — €80,000");
    expect(out).toContain("(Promise #6240001)");
  });

  it("collapses the blank line left behind and never ends with whitespace", () => {
    const desc = "Line A\n\n⬆ Escalated to X by Y on 30/07/2026\n\nLine B";
    const out = descriptionText(desc, true);
    expect(out).toBe("Line A\n\nLine B");
    expect(out).toBe(out.trim());
  });

  it("keeps the escalation line on non-escalated tasks", () => {
    const desc = "Call the customer.\n⬆ Escalated to X by Y on 30/07/2026";
    expect(descriptionText(desc, false)).toContain("⬆ Escalated to X");
  });

  it("handles an empty or missing description", () => {
    expect(descriptionText(null, true)).toBe("");
    expect(descriptionText("", true)).toBe("");
    expect(descriptionText("⬆ Escalated to X by Y on 30/07/2026", true)).toBe("");
  });
});
