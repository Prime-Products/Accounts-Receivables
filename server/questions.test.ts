/**
 * "Ask a colleague" — internal questions about a customer.
 *
 * Guards the properties the feature was built for: a question is NOT a task
 * (no due date, nothing in tasks.list), it lands in the recipient's inbox and in
 * the asker's "I asked" box, the answer is written to the customer's activity log
 * so it survives in the history, and only the asker can close it.
 *
 * Uses ONLY fixture data (see testFixtures.ts) — never touches real customers.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import { createTestCustomer, cleanupTestCustomer } from "./testFixtures";
import { getDb } from "./db";
import { teamMembers, questions, questionInvoices, activityLog } from "../drizzle/schema";
import { eq, inArray } from "drizzle-orm";

/** Caller for the asker (auth user 1). */
function askerCaller() {
  return appRouter.createCaller({
    user: { id: 1, openId: "test-open-id", role: "admin" as const, name: "Test Asker" },
  } as any);
}
/** Caller for the colleague who has to answer (auth user 2). */
function answererCaller() {
  return appRouter.createCaller({
    user: { id: 2, openId: "test-open-id-2", role: "user" as const, name: "Test Answerer" },
  } as any);
}

describe("Ask a colleague", () => {
  let fx: Awaited<ReturnType<typeof createTestCustomer>>;
  let recipientId: number;
  const createdQuestionIds: number[] = [];
  const asker = askerCaller();
  const answerer = answererCaller();

  beforeAll(async () => {
    fx = await createTestCustomer();
    const d = await getDb();
    if (!d) throw new Error("DB unavailable");
    // The colleague is a team member linked to auth user 2, so the question can
    // reach an inbox that is not the asker's own.
    const [r] = await d
      .insert(teamMembers)
      .values({ name: `VITESTFIX Question Colleague ${Date.now()}`, active: 1, userId: 2 } as any)
      .$returningId();
    recipientId = r.id;
  });

  afterAll(async () => {
    const d = await getDb();
    if (d) {
      if (createdQuestionIds.length > 0) {
        await d.delete(questionInvoices).where(inArray(questionInvoices.questionId, createdQuestionIds));
        await d.delete(questions).where(inArray(questions.id, createdQuestionIds));
      }
      await d.delete(activityLog).where(eq(activityLog.groupName, fx.group));
      await d.delete(teamMembers).where(eq(teamMembers.id, recipientId));
    }
    await cleanupTestCustomer(fx);
  });

  it("asks a colleague and records the question on the customer's activity log", async () => {
    const { id } = await asker.questions.ask({
      group: fx.group,
      customerId: fx.id,
      askedTo: recipientId,
      question: "Was this delivery completed?",
    });
    createdQuestionIds.push(id);
    expect(id).toBeGreaterThan(0);

    const d = await getDb();
    const logs = await d!.select().from(activityLog).where(eq(activityLog.groupName, fx.group));
    const qLog = logs.find(l => (l as any).activityType === "question");
    expect(qLog).toBeTruthy();
    expect((qLog as any).description).toContain("Was this delivery completed?");
  });

  it("creates no task and no due date — a question is not scheduled work", async () => {
    const tasks = await asker.tasks.list({});
    const rows = (tasks as any).items ?? tasks;
    const leaked = (rows as any[]).filter(t => (t.title ?? "").includes("Was this delivery completed?"));
    expect(leaked).toHaveLength(0);

    const d = await getDb();
    const [row] = await d!.select().from(questions).where(eq(questions.id, createdQuestionIds[0]));
    expect(row).toBeTruthy();
    expect(Object.keys(row as any)).not.toContain("dueDate");
    expect((row as any).status).toBe("Open");
  });

  it("appears in the recipient's inbox and in the asker's sent box", async () => {
    const toMe = await answerer.questions.list({ box: "toMe" });
    expect(toMe.items.some((q: any) => q.id === createdQuestionIds[0])).toBe(true);
    expect(toMe.items.find((q: any) => q.id === createdQuestionIds[0])?.askedToMe).toBe(true);

    const fromMe = await asker.questions.list({ box: "fromMe" });
    expect(fromMe.items.some((q: any) => q.id === createdQuestionIds[0])).toBe(true);

    const badges = await answerer.questions.badges();
    expect(badges.toAnswer).toBeGreaterThan(0);
  });

  it("records the answer, flips the status and writes it to the customer's history", async () => {
    await answerer.questions.answer({ id: createdQuestionIds[0], answer: "Yes, delivered on 12/07." });

    const d = await getDb();
    const [row] = await d!.select().from(questions).where(eq(questions.id, createdQuestionIds[0]));
    expect((row as any).status).toBe("Answered");
    expect((row as any).answer).toContain("delivered on 12/07");

    const logs = await d!.select().from(activityLog).where(eq(activityLog.groupName, fx.group));
    const answerLog = logs.find(l => (l as any).title?.startsWith("Answer:"));
    expect(answerLog).toBeTruthy();
    expect((answerLog as any).description).toContain("Yes, delivered on 12/07.");
  });

  it("only the asker can close the question", async () => {
    await expect(answerer.questions.close({ id: createdQuestionIds[0] })).rejects.toThrow();
    await asker.questions.close({ id: createdQuestionIds[0] });
    const d = await getDb();
    const [row] = await d!.select().from(questions).where(eq(questions.id, createdQuestionIds[0]));
    expect((row as any).status).toBe("Closed");
  });

  it("lists questions for the customer's card, including closed history", async () => {
    const forGroup = await asker.questions.list({ box: "group", group: fx.group });
    expect(forGroup.items.some((q: any) => q.id === createdQuestionIds[0])).toBe(true);
  });

  it("rejects a question addressed to a colleague that does not exist", async () => {
    await expect(
      asker.questions.ask({ group: fx.group, askedTo: 999_999_999, question: "anyone there?" }),
    ).rejects.toThrow();
  });
});
