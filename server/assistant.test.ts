import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildPortfolioSnapshot, buildGroupFacts, mentions, norm, resolveMentions } from "./lib/assistantFacts";
import { APP_KNOWLEDGE } from "./lib/assistantKnowledge";
import { ASSISTANT_MODEL, SUGGESTED_QUESTIONS, contentToText } from "./routers/assistant";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("assistant name matching", () => {
  it("normalises case, accents and punctuation", () => {
    expect(norm("MSC SHIPMANAGEMENT LTD.")).toBe("msc shipmanagement ltd");
    expect(norm("Ναυτιλιακή  Α.Ε.")).toBe("ναυτιλιακη α ε");
  });

  it("matches a full name and a distinctive first token", () => {
    const q = norm("ποσο χρωσταει η msc shipmanagement;");
    expect(mentions(q, "MSC SHIPMANAGEMENT LTD")).toBe(true);
    expect(mentions(q, "MSC")).toBe(false); // too short to match safely
    expect(mentions(q, "COSCO SHIPPING LINES")).toBe(false);
  });

  it("ignores names shorter than four characters to avoid false positives", () => {
    expect(mentions(norm("what is our dso"), "DSO")).toBe(false);
  });

  it("matches when the question omits the legal-form suffix", () => {
    expect(mentions(norm("υπολοιπο για ναυτιλιακη αφοι κατσαρη"), "ΝΑΥΤΙΛΙΑΚΗ ΑΦΟΙ ΚΑΤΣΑΡΗ Α.Ε.")).toBe(true);
    expect(mentions(norm("open balance for seven seas shipping"), "SEVEN SEAS SHIPPING GMBH")).toBe(true);
  });
});

describe("assistant knowledge base", () => {
  it("documents every screen the sidebar links to", () => {
    for (const path of ["/address-book", "/customers", "/invoices", "/vessels", "/contracts", "/tasks", "/wire-transfers", "/reports", "/team", "/settings"]) {
      expect(APP_KNOWLEDGE).toContain(path);
    }
  });

  it("uses the current menu names, not the old ones", () => {
    expect(APP_KNOWLEDGE).toContain("Collections Desk");
    expect(APP_KNOWLEDGE).toContain("Address Book");
    expect(APP_KNOWLEDGE).not.toContain("Group List");
  });

  it("states the core business rules the assistant must not invent", () => {
    expect(APP_KNOWLEDGE).toContain("amount - paidAmount");
    expect(APP_KNOWLEDGE).toContain("0-30, 31-60, 61-90, 91-120, 120+");
    expect(APP_KNOWLEDGE).toMatch(/read-only/i);
  });
});

describe("assistant portfolio snapshot", () => {
  it("returns grounded EUR figures with consistent totals", async () => {
    const snap = await buildPortfolioSnapshot();
    expect(snap.portfolio.customers).toBeGreaterThan(0);
    expect(snap.portfolio.groups).toBeGreaterThan(0);
    // AR balance must equal not-yet-due + overdue (rounding tolerance of a few euros)
    const sum = snap.portfolio.notYetDueEur + snap.portfolio.totalOverdueEur;
    expect(Math.abs(sum - snap.portfolio.arBalanceEur)).toBeLessThanOrEqual(2);
    // Aging buckets must add up to total overdue
    const buckets = Object.values(snap.portfolio.agingBucketsEur).reduce((s, v) => s + v, 0);
    expect(Math.abs(buckets - snap.portfolio.totalOverdueEur)).toBeLessThanOrEqual(5);
    // All figures are whole numbers so the LLM cannot render odd decimals
    for (const v of Object.values(snap.portfolio.agingBucketsEur)) expect(Number.isInteger(v)).toBe(true);
  });

  it("ranks the top overdue groups in descending order", async () => {
    const snap = await buildPortfolioSnapshot();
    expect(snap.topOverdueGroups.length).toBeLessThanOrEqual(10);
    for (let i = 1; i < snap.topOverdueGroups.length; i++) {
      expect(snap.topOverdueGroups[i - 1].overdueEur).toBeGreaterThanOrEqual(snap.topOverdueGroups[i].overdueEur);
    }
  });

  it("reports month progress consistently with target and collected", async () => {
    const snap = await buildPortfolioSnapshot();
    expect(snap.month.remainingEur).toBe(Math.max(0, snap.month.forecastTargetEur - snap.month.collectedEur));
    if (snap.month.forecastTargetEur > 0) expect(snap.month.progressPct).not.toBeNull();
  });
});

describe("assistant entity facts", () => {
  it("builds group facts whose overdue never exceeds the open balance", async () => {
    const snap = await buildPortfolioSnapshot();
    const top = snap.topOverdueGroups[0];
    if (!top) return; // nothing overdue in this dataset
    const facts = await buildGroupFacts(top.group);
    expect(facts).not.toBeNull();
    expect(facts!.name).toBe(top.group);
    expect(facts!.companies.length).toBeGreaterThan(0);
    expect(facts!.overdueEur).toBeLessThanOrEqual(facts!.openBalanceEur + 1);
    expect(facts!.largestOverdueInvoices.length).toBeLessThanOrEqual(8);
    for (let i = 1; i < facts!.largestOverdueInvoices.length; i++) {
      expect(facts!.largestOverdueInvoices[i - 1].outstandingEur).toBeGreaterThanOrEqual(
        facts!.largestOverdueInvoices[i].outstandingEur,
      );
    }
  });

  it("returns null for an unknown group", async () => {
    expect(await buildGroupFacts("ΔΕΝ ΥΠΑΡΧΕΙ ΤΕΤΟΙΟΣ ΟΜΙΛΟΣ 12345")).toBeNull();
  });

  it("resolves a group named in the question and nothing for gibberish", async () => {
    const snap = await buildPortfolioSnapshot();
    const top = snap.topOverdueGroups[0];
    if (top) {
      const hit = await resolveMentions(`Πόσο overdue έχει ο ${top.group};`);
      expect(hit.groups.map((g: any) => g.name)).toContain(top.group);
    }
    const miss = await resolveMentions("τι κανει το dashboard;");
    expect(miss.groups.length).toBe(0);
  });
});

describe("assistant router surface", () => {
  it("is registered on the app router", () => {
    const routers = read("server/routers.ts");
    expect(routers).toContain("assistantRouter");
    expect(routers).toMatch(/assistant:\s*assistantRouter/);
  });

  it("uses a protected procedure so data never leaks to anonymous callers", () => {
    const src = read("server/routers/assistant.ts");
    expect(src).toContain("protectedProcedure");
    expect(src).not.toContain("publicProcedure");
  });

  it("sends the knowledge base and the live snapshot in the system prompt", () => {
    const src = read("server/routers/assistant.ts");
    expect(src).toContain("APP_KNOWLEDGE");
    expect(src).toContain("buildPortfolioSnapshot");
    expect(src).toContain("resolveMentions");
    expect(src).toContain("JSON.stringify(facts)");
  });

  it("trims the conversation history it forwards to the model", () => {
    expect(read("server/routers/assistant.ts")).toContain("input.history.slice(-8)");
  });

  it("exposes suggested questions and a concrete model", () => {
    expect(SUGGESTED_QUESTIONS.length).toBeGreaterThanOrEqual(4);
    expect(ASSISTANT_MODEL).toBe("gemini-2.5-flash");
  });

  it("extracts text from both string and block content shapes", () => {
    expect(contentToText("hello")).toBe("hello");
    expect(contentToText([{ type: "text", text: "a" }, { type: "text", text: "b" }])).toBe("ab");
    expect(contentToText(undefined)).toBe("");
  });
});

describe("assistant widget wiring", () => {
  const widget = read("client/src/components/AssistantWidget.tsx");

  it("is mounted once inside the dashboard layout so it shows on every screen", () => {
    const layout = read("client/src/components/DashboardLayout.tsx");
    expect(layout).toContain("AssistantWidget");
    expect(layout.match(/<AssistantWidget \/>/g)?.length).toBe(1);
  });

  it("floats bottom-right above page content", () => {
    expect(widget).toContain("fixed bottom-5 right-5");
    expect(widget).toContain("z-50");
  });

  it("calls the assistant procedures", () => {
    expect(widget).toContain("trpc.assistant.ask.useMutation");
    expect(widget).toContain("trpc.assistant.intro.useQuery");
  });

  it("persists thread and size across page changes", () => {
    expect(widget).toContain("ar-assistant:thread");
    expect(widget).toContain("ar-assistant:size");
  });

  it("supports keyboard toggle and Enter-to-send", () => {
    expect(widget).toMatch(/key\.toLowerCase\(\) === "j"/);
    expect(widget).toMatch(/e\.key === "Enter" && !e\.shiftKey/);
  });

  it("drops the optimistic user turn when the request fails", () => {
    expect(widget).toContain('prev[prev.length - 1]?.role === "user" ? prev.slice(0, -1) : prev');
  });
});
