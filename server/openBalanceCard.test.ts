import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The Open Balance KPI must stay readable at a glance: the net balance plus a
 * single "Due next month" line. The invoice / on-account / credit-note
 * breakdown belongs in the tooltip, not as extra coloured lines on the card.
 */
const groupCard = readFileSync(join(process.cwd(), "client/src/pages/GroupDetail.tsx"), "utf8");
const companyCard = readFileSync(join(process.cwd(), "client/src/pages/CustomerDetail.tsx"), "utf8");
const router = readFileSync(join(process.cwd(), "server/routers/ar.ts"), "utf8");

describe("Open Balance card", () => {
  it("shows Due next month on both the group card and the company card", () => {
    expect(groupCard).toContain("Due next month");
    expect(companyCard).toContain("Due next month");
  });

  it("no longer renders the inline inv/on-acct/credit breakdown lines", () => {
    for (const src of [groupCard, companyCard]) {
      expect(src).not.toContain("on acct`");
      expect(src).not.toContain("credit</span>");
    }
  });

  it("keeps the breakdown available through the value tooltip", () => {
    expect(groupCard).toContain("Payments on account (unmatched)");
    expect(companyCard).toContain("Payments on account (unmatched)");
    expect(groupCard).toContain("Open credit notes");
    expect(companyCard).toContain("Open credit notes");
  });

  it("serves dueNextMonth from both the group and the company procedures", () => {
    expect(router).toContain("dueNextMonth: gDueNextMonth");
    expect(router).toContain("dueNextMonth: dueNextMonth360");
  });
});
