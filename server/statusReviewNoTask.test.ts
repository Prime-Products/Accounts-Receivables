import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Reviewing a customer's communication status must be possible WITHOUT creating a
 * task. These tests pin the contract of `calls.reviewStatus` / `reviewStatusBulk`
 * so a later refactor cannot quietly reintroduce task creation on that path.
 */
const router = readFileSync(join(process.cwd(), "server/routers/ar.ts"), "utf8");
const desk = readFileSync(join(process.cwd(), "client/src/pages/Customers.tsx"), "utf8");

function procedureBody(name: string): string {
  const start = router.indexOf(`  ${name}: protectedProcedure`);
  expect(start, `${name} procedure should exist`).toBeGreaterThan(-1);
  // Body runs until the next top-level procedure declaration.
  const rest = router.slice(start + 10);
  const nextIdx = rest.search(/\n {2}[a-zA-Z]+: (protectedProcedure|publicProcedure|adminProcedure)/);
  return nextIdx === -1 ? rest : rest.slice(0, nextIdx);
}

describe("status review without tasks", () => {
  it("exposes both a single and a bulk review procedure", () => {
    expect(router).toContain("reviewStatus: protectedProcedure");
    expect(router).toContain("reviewStatusBulk: protectedProcedure");
  });

  it("only accepts statuses that imply no pending work", () => {
    for (const name of ["reviewStatus", "reviewStatusBulk"]) {
      const body = procedureBody(name);
      expect(body).toContain('z.enum(["Not Contacted", "Broken", "Kept"])');
      // Task-backed statuses must not be selectable here.
      expect(body).not.toContain('"Pending Follow-up",\n        "Escalated"');
    }
  });

  it("never creates a task or promise on the review path", () => {
    for (const name of ["reviewStatus", "reviewStatusBulk"]) {
      const body = procedureBody(name);
      expect(body).not.toContain("upsertFollowUpTask");
      expect(body).not.toContain("createGroupPromise");
      expect(body).not.toContain("db.createTask");
    }
  });

  it("clears the promised amount and target date, since nothing is pending", () => {
    for (const name of ["reviewStatus", "reviewStatusBulk"]) {
      const body = procedureBody(name);
      expect(body).toContain('amount: "0.00"');
      expect(body).toContain("followUpDate: null");
    }
  });

  it("cancels artifacts left over from a previous task-backed status", () => {
    for (const name of ["reviewStatus", "reviewStatusBulk"]) {
      expect(procedureBody(name)).toContain("cleanupStatusArtifacts");
    }
  });

  it("records who reviewed it, in the audit trail and the activity log", () => {
    for (const name of ["reviewStatus", "reviewStatusBulk"]) {
      const body = procedureBody(name);
      expect(body).toContain("updatedBy: ctx.user.id");
      expect(body).toContain("addActivityLog");
      expect(body).toContain("Status reviewed —");
      expect(body).toContain("audit(ctx,");
    }
  });

  it("exposes review freshness in the groups payload", () => {
    expect(router).toContain("confirmationUpdatedAt:");
    expect(router).toContain("confirmationUpdatedBy:");
  });

  it("offers the review menu on the Collections Desk badge", () => {
    expect(desk).toContain("REVIEW_STATUSES");
    expect(desk).toContain("calls.reviewStatus.useMutation");
    expect(desk).toContain("Set status without a task");
    // The three no-task options, and an escape hatch back to Log Call.
    expect(desk).toContain('value: "Kept" as const');
    expect(desk).toContain('value: "Broken" as const');
    expect(desk).toContain('value: "Not Contacted" as const');
    expect(desk).toContain("Log a call instead");
  });

  it("shows when the status was last reviewed and by whom", () => {
    expect(desk).toContain("Last reviewed");
    expect(desk).toContain("Never reviewed");
  });
});
