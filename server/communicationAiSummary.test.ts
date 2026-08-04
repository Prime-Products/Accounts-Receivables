import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The AI summary lives inside the Communication window, so the wiring that must
 * not regress is: the window receives a `group`, the summary component is
 * rendered for both the floating window and the mobile sheet, and the procedure
 * stays scoped to a bounded look-back window.
 */
const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("communication AI summary — client wiring", () => {
  const panel = read("client/src/components/CommunicationPanel.tsx");
  const summary = read("client/src/components/CommunicationAiSummary.tsx");

  it("the panel accepts a group and renders the summary in both layouts", () => {
    expect(panel).toMatch(/group\?: string/);
    // mobile sheet + floating window each render the component
    const occurrences = panel.match(/<CommunicationAiSummary/g) ?? [];
    expect(occurrences.length).toBe(2);
    // no group ⇒ no button, so the summary can never be called unscoped
    expect(panel).toMatch(/group &&/);
  });

  it("both hosts pass the collections group to the window", () => {
    expect(read("client/src/pages/GroupDetail.tsx")).toMatch(/group=\{group\}/);
    expect(read("client/src/pages/CustomerDetail.tsx")).toMatch(/group=\{groupKey \|\| undefined\}/);
  });

  it("the summary calls the scoped procedure and can be refreshed and dismissed", () => {
    expect(summary).toMatch(/trpc\.customers\.communicationSummary\.useMutation/);
    expect(summary).toMatch(/days = 30/);
    // refresh re-runs the same mutation; dismiss clears the local text
    expect(summary.match(/gen\.mutate\(\{ group, days \}\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(summary).toMatch(/setText\(null\)/);
    expect(summary).toMatch(/onError: e => toast\.error/);
  });

  it("renders bold leads and bullets without pulling in a markdown dependency", () => {
    expect(summary).toMatch(/\\\*\\\*\[\^\*\]\+\\\*\\\*/);
    expect(summary).toMatch(/startsWith\("- "\)/);
    const pkg = JSON.parse(read("package.json")) as { dependencies?: Record<string, string> };
    expect(Object.keys(pkg.dependencies ?? {})).not.toContain("react-markdown");
  });
});

describe("communication AI summary — procedure", () => {
  const router = read("server/routers/ar.ts");
  const proc = router.slice(router.indexOf("communicationSummary:"), router.indexOf("getCollectionProfile:"));

  it("is a protected mutation with a bounded look-back window", () => {
    expect(proc).toMatch(/protectedProcedure/);
    expect(proc).toMatch(/\.mutation\(/);
    expect(proc).toMatch(/days: z\.number\(\)\.int\(\)\.min\(7\)\.max\(120\)\.default\(30\)/);
    expect(proc).toMatch(/cutoff = now - input\.days \* 24 \* 60 \* 60 \* 1000/);
  });

  it("only feeds the model activity from inside the window", () => {
    expect(proc).toMatch(/filter\(a => inWindow\(a\.createdAt\)\)/);
    expect(proc).toMatch(/filter\(n => inWindow\(n\.createdAt\)\)/);
    expect(proc).toMatch(/inWindow\(e\.sentAt \?\? e\.createdAt\)/);
    expect(proc).toMatch(/inWindow\(r\.receiptDate\)/);
  });

  it("includes what is needed to recommend a next step for the month", () => {
    for (const key of [
      "overdueEur",
      "monthlyForecastEur",
      "collectedThisMonthEur",
      "remainingToCollectThisMonthEur",
      "biggestOverdueInvoices",
      "collectionNotes",
    ]) {
      expect(proc).toContain(key);
    }
    expect(proc).toMatch(/Επόμενο βήμα/);
  });

  it("skips the LLM call when nothing happened in the window", () => {
    const guard = proc.slice(proc.indexOf("if (entryCount === 0"));
    expect(guard).toMatch(/hadActivity: false/);
    // the early return comes before the model is invoked
    expect(proc.indexOf("if (entryCount === 0")).toBeLessThan(proc.indexOf("invokeLLM"));
  });

  it("audits generation, so LLM usage stays traceable", () => {
    expect(proc).toMatch(/audit\(ctx, "Generate Communication Summary"/);
  });
});
