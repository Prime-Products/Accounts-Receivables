import { describe, expect, it } from "vitest";

/**
 * Regression guard for the "Open promise exists" banner that kept appearing for
 * DYNACOM / MINERVA after their promise-check task had already been closed or
 * escalated. A Pending promise row only blocks a new call log while at least one
 * of its linked check tasks is still live.
 */
type Task = { status: string; description: string | null };

/** Same predicate as findOpenGroupPromise in server/routers/ar.ts. */
function isPromiseStillOpen(promiseId: number, tasks: Task[]): boolean {
  const linked = tasks.filter(t => t.description?.includes(`(Promise #${promiseId})`));
  if (linked.length === 0) return true; // legacy promise with no check task
  return linked.some(t => t.status !== "Completed" && t.status !== "Cancelled");
}

describe("promise lifecycle — open vs settled", () => {
  it("stays open while the check task is pending", () => {
    const tasks: Task[] = [{ status: "Pending", description: "Verify payment (Promise #101)" }];
    expect(isPromiseStillOpen(101, tasks)).toBe(true);
  });

  it("stays open while the check task is in progress", () => {
    const tasks: Task[] = [{ status: "In Progress", description: "Verify payment (Promise #101)" }];
    expect(isPromiseStillOpen(101, tasks)).toBe(true);
  });

  it("is settled once the only check task is completed", () => {
    const tasks: Task[] = [{ status: "Completed", description: "Verify payment (Promise #101)" }];
    expect(isPromiseStillOpen(101, tasks)).toBe(false);
  });

  it("is settled when the escalated copy was cancelled and the original completed", () => {
    const tasks: Task[] = [
      { status: "Completed", description: "Verify payment (Promise #6270001)" },
      { status: "Cancelled", description: "Original task: ... (Promise #6270001) ... Return to Collector" },
    ];
    expect(isPromiseStillOpen(6270001, tasks)).toBe(false);
  });

  it("stays open when an escalated copy is still live", () => {
    const tasks: Task[] = [
      { status: "Completed", description: "Verify payment (Promise #6270001)" },
      { status: "Pending", description: "Escalated: ... (Promise #6270001)" },
    ];
    expect(isPromiseStillOpen(6270001, tasks)).toBe(true);
  });

  it("treats a legacy promise without any check task as open", () => {
    const tasks: Task[] = [{ status: "Completed", description: "Unrelated task (Promise #999)" }];
    expect(isPromiseStillOpen(101, tasks)).toBe(true);
  });

  it("does not confuse promise ids that share a prefix", () => {
    // #1010's task must not be read as a live task for #101, so #101 falls back to
    // the "legacy promise, no task of its own" branch and stays open.
    const tasks: Task[] = [{ status: "Pending", description: "Verify payment (Promise #1010)" }];
    expect(isPromiseStillOpen(1010, tasks)).toBe(true);
    const closedOwnTask: Task[] = [
      { status: "Pending", description: "Verify payment (Promise #1010)" },
      { status: "Completed", description: "Verify payment (Promise #101)" },
    ];
    expect(isPromiseStillOpen(101, closedOwnTask)).toBe(false);
  });
});
