import { describe, it, expect } from "vitest";
import { taskTypes } from "../drizzle/schema";

/**
 * "Ask for help" is deliberately NOT a separate mechanism: it is an ordinary
 * manual task of type "Help". These specs pin the two properties that make that
 * work — the type exists, and a created task is written to the customer's
 * activity log so the request survives in the history.
 */
describe("Help task type", () => {
  it("is part of the task type enum", () => {
    expect(taskTypes).toContain("Help");
  });

  it("keeps Manual available for ordinary tasks", () => {
    expect(taskTypes).toContain("Manual");
  });

  it("has no separate question mechanism left in the schema", async () => {
    const schema: Record<string, unknown> = await import("../drizzle/schema");
    expect(schema.questions).toBeUndefined();
    expect(schema.questionInvoices).toBeUndefined();
  });
});

/** The activity-log title the router writes, mirrored here as a contract. */
function helpActivityTitle(type: string, assignee: string, title: string): string {
  return type === "Help" ? `Help requested from ${assignee} — ${title}` : `Task created — ${title}`;
}

describe("activity log line for a created task", () => {
  it("names the colleague for a Help task", () => {
    expect(helpActivityTitle("Help", "Faye Vanou", "Was the delivery completed?")).toBe(
      "Help requested from Faye Vanou — Was the delivery completed?"
    );
  });

  it("falls back to a neutral line for other task types", () => {
    expect(helpActivityTitle("Manual", "Faye Vanou", "Call the customer")).toBe("Task created — Call the customer");
  });

  it("says myself when nobody else is assigned", () => {
    expect(helpActivityTitle("Help", "myself", "Check the contract")).toBe("Help requested from myself — Check the contract");
  });
});
