import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import { DEFAULT_TEMPLATES, renderTemplate, mergeTemplates } from "./lib/emailTemplates";
import { createTestCustomer, cleanupTestCustomer, IdSnapshot } from "./testFixtures";
import * as db from "./db";

function makeCaller() {
  return appRouter.createCaller({
    user: { id: 1, openId: "test-open-id", role: "admin" as const, name: "Test User" },
  } as any);
}

describe("renderTemplate", () => {
  it("substitutes known placeholders", () => {
    expect(renderTemplate("Hello {{customer}} — {{balance}}", { customer: "ACME", balance: "€100.00" })).toBe(
      "Hello ACME — €100.00",
    );
  });
  it("accepts spaces inside the braces", () => {
    expect(renderTemplate("{{ customer }}", { customer: "ACME" })).toBe("ACME");
  });
  it("leaves unknown placeholders untouched so typos stay visible", () => {
    expect(renderTemplate("Hi {{nope}}", { customer: "ACME" })).toBe("Hi {{nope}}");
  });
  it("renders numeric values", () => {
    expect(renderTemplate("{{openCount}} invoices", { openCount: 7 })).toBe("7 invoices");
  });
});

describe("mergeTemplates", () => {
  it("falls back to defaults when nothing is stored", () => {
    const merged = mergeTemplates([]);
    expect(merged).toHaveLength(6);
    expect(merged.every(t => t.isCustom === false)).toBe(true);
    expect(merged.find(t => t.templateType === "SOA")!.subject).toBe(DEFAULT_TEMPLATES.SOA.subject);
  });
  it("marks stored rows as custom and keeps the default for comparison", () => {
    const merged = mergeTemplates([{ templateType: "SOA", subject: "Mine", body: "Body" }]);
    const soa = merged.find(t => t.templateType === "SOA")!;
    expect(soa.isCustom).toBe(true);
    expect(soa.subject).toBe("Mine");
    expect(soa.defaultSubject).toBe(DEFAULT_TEMPLATES.SOA.subject);
  });
});

describe("Email template procedures", () => {
  let fx: Awaited<ReturnType<typeof createTestCustomer>>;
  let snap: IdSnapshot;
  beforeAll(async () => {
    fx = await createTestCustomer();
    snap = { taskId: 0, promiseId: 0, activityId: 0, auditId: 0 };
  });
  afterAll(async () => {
    // Leave no override behind so the app keeps its default wording.
    await db.deleteEmailTemplate("Friendly Reminder").catch(() => {});
    await cleanupTestCustomer(fx, snap);
  });

  it("lists all editable templates with the placeholder reference", async () => {
    const r = await makeCaller().admin.emailTemplates();
    expect(r.templates.map(t => t.templateType)).toContain("SOA");
    expect(r.templates).toHaveLength(6);
    expect(r.placeholders.some(p => p.key === "balance")).toBe(true);
  });

  it("saves an override and uses it in the email prefill", async () => {
    await makeCaller().admin.saveEmailTemplate({
      templateType: "Friendly Reminder",
      subject: "Custom subject for {{customer}}",
      body: "Owing {{balance}} — {{openCount}} invoices open.",
    });
    const list = await makeCaller().admin.emailTemplates();
    const t = list.templates.find(x => x.templateType === "Friendly Reminder")!;
    expect(t.isCustom).toBe(true);
    expect(t.subject).toBe("Custom subject for {{customer}}");

    const prefill = await makeCaller().calls.emailPrefill({
      customerId: fx.id,
      template: "Friendly Reminder",
    });
    expect(prefill.isCustom).toBe(true);
    expect(prefill.subject).toContain("Custom subject for ");
    expect(prefill.subject).not.toContain("{{");
    expect(prefill.body).not.toContain("{{");
    expect(prefill.body).toContain("invoices open.");
  });

  it("resets back to the default text", async () => {
    const r = await makeCaller().admin.resetEmailTemplate({ templateType: "Friendly Reminder" });
    expect(r.subject).toBe(DEFAULT_TEMPLATES["Friendly Reminder"].subject);
    const list = await makeCaller().admin.emailTemplates();
    expect(list.templates.find(x => x.templateType === "Friendly Reminder")!.isCustom).toBe(false);
  });

  it("previews a draft with example values", async () => {
    const r = await makeCaller().admin.previewEmailTemplate({
      subject: "{{customer}} owes {{balance}}",
      body: "Overdue: {{overdue}}",
    });
    expect(r.subject).not.toContain("{{");
    expect(r.body).not.toContain("{{");
  });

  it("prefill works for every editable template type", async () => {
    for (const t of ["SOA", "Payment Reminder", "Overdue Notice", "Friendly Reminder", "Final Notice", "Statement"] as const) {
      const r = await makeCaller().calls.emailPrefill({ customerId: fx.id, template: t });
      expect(r.subject.length).toBeGreaterThan(0);
      expect(r.body).not.toContain("{{");
    }
  });
});
