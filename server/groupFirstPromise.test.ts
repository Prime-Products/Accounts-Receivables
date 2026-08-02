import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

/*
 * The group is AR Pro's unit of collection: "όλη η παρακολούθηση του πελάτη γίνεται
 * βάσει ομίλου". A promise therefore belongs to the group even when the collector
 * happened to be looking at one member company. These tests pin the two ways that
 * rule used to break: a company card creating its own parallel promise, and a
 * dialog naming a member company as if that company owned the commitment.
 */
describe("promises are group-level wherever they are recorded", () => {
  const router = read("server/routers/ar.ts");
  const companyCard = read("client/src/pages/CustomerDetail.tsx");
  const logCall = read("client/src/components/LogCallDialog.tsx");

  it("exposes a single group-scoped entry point for recording a promise", () => {
    expect(router).toContain("recordGroupPromise: protectedProcedure");
  });

  it("moves the group's existing commitment instead of opening a second one", () => {
    const proc = router.slice(router.indexOf("recordGroupPromise: protectedProcedure"));
    const body = proc.slice(0, proc.indexOf("getOpenPromise: protectedProcedure"));
    // An open promise must be looked up first and rescheduled, not duplicated.
    expect(body).toContain("findOpenGroupPromise(input.group)");
    expect(body).toContain("rescheduleGroupPromise");
    expect(body.indexOf("findOpenGroupPromise")).toBeLessThan(body.indexOf("createGroupPromise"));
    // Either path leaves the group badge pointing at the live commitment.
    expect(body).toContain("upsertGroupConfirmationStatus");
  });

  it("keeps the promise button on the company card but routes it to the group", () => {
    expect(companyCard).toContain("Promise-to-Pay");
    expect(companyCard).toContain("trpc.calls.recordGroupPromise.useMutation");
    // The company card must never call the per-customer promise mutation directly.
    expect(companyCard).not.toContain("forecast.addPromise");
  });

  it("tells the collector on the company card that the record lands on the group", () => {
    expect(companyCard).toMatch(/Recorded for[\s\S]{0,80}groupKey/);
  });

  it("describes the open promise as the group's, not a member company's", () => {
    expect(logCall).toContain("{group} already has an open promise of");
    // The old wording named the member company and read as that company's promise.
    expect(logCall).not.toContain("Moving the open promise of");
  });
});
