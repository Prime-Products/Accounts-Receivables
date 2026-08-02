import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
/**
 * A confirmation status must always come out of a conversation, so `calls.logCall`
 * is the only way to set one. The quick "review" setters that used to hang off the
 * Collections Desk badge (and the "Next action" dialog behind a broken promise) were
 * removed on purpose — these tests stop them from creeping back.
 */
const router = readFileSync(join(process.cwd(), "server/routers/ar.ts"), "utf8");
const desk = readFileSync(join(process.cwd(), "client/src/pages/Customers.tsx"), "utf8");

describe("confirmation status changes only through Log Call", () => {
  it("the quick-review procedures no longer exist on the server", () => {
    expect(router).not.toContain("reviewStatus: protectedProcedure");
    expect(router).not.toContain("reviewStatusBulk: protectedProcedure");
  });

  it("logCall is still there and writes the status", () => {
    expect(router).toContain("logCall: protectedProcedure");
    const start = router.indexOf("  logCall: protectedProcedure");
    const rest = router.slice(start + 10);
    const nextIdx = rest.search(/\n {2}[a-zA-Z]+: (protectedProcedure|publicProcedure|adminProcedure)/);
    const body = nextIdx === -1 ? rest : rest.slice(0, nextIdx);
    expect(body).toContain("upsertGroupConfirmationStatus");
  });

  it("the Collections Desk has no inline status setter", () => {
    expect(desk).not.toContain("REVIEW_STATUSES");
    expect(desk).not.toContain("calls.reviewStatus.useMutation");
    expect(desk).not.toContain("Set status without a task");
    expect(desk).not.toContain("Log a call instead");
  });

  it("the Desk badge opens the Log Call dialog", () => {
    expect(desk).toContain("LogCallDialog");
    expect(desk).toContain("Click to log a call");
  });

  it("the 'Next action' dialog that set statuses outside Log Call is gone", () => {
    let exists = true;
    try {
      readFileSync(join(process.cwd(), "client/src/components/NextActionDialog.tsx"), "utf8");
    } catch {
      exists = false;
    }
    expect(exists).toBe(false);
    const taskDialog = readFileSync(join(process.cwd(), "client/src/components/TaskDetailDialog.tsx"), "utf8");
    expect(taskDialog).not.toContain("NextActionDialog");
  });

  it("no client screen calls a status mutation other than logCall", () => {
    for (const file of ["client/src/pages/Customers.tsx", "client/src/pages/GroupDetail.tsx", "client/src/pages/CustomerDetail.tsx"]) {
      const src = readFileSync(join(process.cwd(), file), "utf8");
      expect(src, file).not.toContain("calls.updateConfirmationStatus.useMutation");
      expect(src, file).not.toContain("calls.reviewStatus");
    }
  });

  it("review freshness is still exposed so the badge can show who last touched it", () => {
    expect(router).toContain("confirmationUpdatedAt:");
    expect(router).toContain("confirmationUpdatedBy:");
    expect(desk).toContain("Last reviewed");
    expect(desk).toContain("Never reviewed");
  });
});
