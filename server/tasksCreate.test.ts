/**
 * Tests for manual task creation input validation and task type enum consistency.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { taskTypes } from "../drizzle/schema";

// Mirror of the tasks.create input schema in server/routers/ar.ts
const createInput = z.object({
  customerId: z.number(),
  type: z.enum(taskTypes),
  title: z.string().min(1),
  description: z.string().optional(),
  dueDate: z.number(),
  invoiceId: z.number().optional(),
});

describe("tasks.create input validation", () => {
  it("accepts a valid manual task", () => {
    const r = createInput.safeParse({
      customerId: 1,
      type: "Manual",
      title: "Call customer about overdue balance",
      dueDate: Date.now(),
    });
    expect(r.success).toBe(true);
  });

  it("accepts every task type defined in the schema", () => {
    for (const t of taskTypes) {
      const r = createInput.safeParse({ customerId: 1, type: t, title: "x", dueDate: Date.now() });
      expect(r.success).toBe(true);
    }
  });

  it("rejects an empty title", () => {
    const r = createInput.safeParse({ customerId: 1, type: "Manual", title: "", dueDate: Date.now() });
    expect(r.success).toBe(false);
  });

  it("rejects an unknown task type", () => {
    const r = createInput.safeParse({ customerId: 1, type: "Reminder +15", title: "x", dueDate: Date.now() });
    expect(r.success).toBe(false);
  });

  it("rejects a missing customer", () => {
    const r = createInput.safeParse({ type: "Manual", title: "x", dueDate: Date.now() });
    expect(r.success).toBe(false);
  });

  it("schema task types match the UI list used on the Tasks page", () => {
    // UI TYPES in client/src/pages/Tasks.tsx must be a subset of schema taskTypes
    const uiTypes = ["Follow-up +2", "Follow-up +15", "Follow-up +20 SOA", "Escalation +30", "Contract Expiry", "Manual"];
    for (const t of uiTypes) expect(taskTypes).toContain(t);
  });
});
