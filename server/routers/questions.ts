import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { departmentOptions, questionStatuses } from "../../drizzle/schema";
import * as db from "../db";
import { protectedProcedure, router } from "../_core/trpc";

/**
 * Internal questions between colleagues about a customer.
 *
 * Deliberately NOT a task: a question has no due date and is not scheduled work.
 * Deliberately NOT an @mention either: a mention is a reference nobody has to
 * reply to, while a question stays Open until the colleague answers, so the asker
 * can see what they are still waiting for.
 *
 * Both the question and the answer are written to the group's activity log, so
 * months later the answer is found on the customer card without opening anything.
 */

/** Short one-line preview for log titles and inbox rows. */
function preview(text: string, max = 120): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export const questionsRouter = router({
  /** Ask one colleague something about a group (optionally about one company/invoices). */
  ask: protectedProcedure
    .input(
      z.object({
        group: z.string().min(1),
        customerId: z.number().optional(),
        /** team_members.id of the colleague who should answer. */
        askedTo: z.number(),
        question: z.string().min(1).max(5000),
        department: z.enum(departmentOptions).optional(),
        invoiceIds: z.array(z.number()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const recipient = await db.getTeamMemberById(input.askedTo).catch(() => null);
      if (!recipient) throw new TRPCError({ code: "NOT_FOUND", message: "Colleague not found" });
      const id = await db.createQuestion({
        groupName: input.group,
        customerId: input.customerId ?? null,
        askedBy: ctx.user.id,
        askedTo: input.askedTo,
        department: input.department ?? null,
        question: input.question.trim(),
        status: "Open",
      });
      if (input.invoiceIds && input.invoiceIds.length > 0) {
        await db.addQuestionInvoices(id, input.invoiceIds).catch(() => 0);
      }
      // The question belongs to the customer's history, not only to an inbox.
      const activityId = await db
        .addActivityLog({
          groupName: input.group,
          customerId: input.customerId ?? null,
          activityType: "question",
          title: `Asked ${recipient.name}: ${preview(input.question, 100)}`,
          description: input.question.trim(),
          createdBy: ctx.user.id,
          createdAt: new Date(),
        })
        .catch(() => undefined);
      if (typeof activityId === "number") {
        await db.updateQuestionActivityId(id, activityId).catch(() => {});
      }
      await db
        .addAudit({
          userId: ctx.user.id,
          userName: ctx.user.name ?? undefined,
          action: "Ask Colleague",
          entityType: "question",
          entityId: String(id),
          details: `${input.group} → ${recipient.name}`,
        })
        .catch(() => {});
      return { id };
    }),

  /** The colleague replies. Open → Answered; only the asker may close it afterwards. */
  answer: protectedProcedure
    .input(z.object({ id: z.number(), answer: z.string().min(1).max(5000) }))
    .mutation(async ({ ctx, input }) => {
      const q = await db.getQuestion(input.id);
      if (!q) throw new TRPCError({ code: "NOT_FOUND", message: "Question not found" });
      const me = await db.getTeamMemberByUserId(ctx.user.id).catch(() => null);
      // The addressee answers; the asker may also record an answer they got offline.
      const allowed = (me && me.id === q.askedTo) || q.askedBy === ctx.user.id;
      if (!allowed) throw new TRPCError({ code: "FORBIDDEN", message: "This question was addressed to someone else" });
      await db.answerQuestion(input.id, input.answer.trim(), ctx.user.id);
      await db
        .addActivityLog({
          groupName: q.groupName,
          customerId: q.customerId ?? null,
          activityType: "question",
          title: `Answer: ${preview(input.answer, 100)}`,
          description: `Q: ${q.question}\n\nA: ${input.answer.trim()}`,
          createdBy: ctx.user.id,
          createdAt: new Date(),
        })
        .catch(() => undefined);
      await db
        .addAudit({
          userId: ctx.user.id,
          userName: ctx.user.name ?? undefined,
          action: "Answer Question",
          entityType: "question",
          entityId: String(input.id),
          details: q.groupName,
        })
        .catch(() => {});
      return { success: true as const };
    }),

  /** The asker marks it resolved — it disappears from both inboxes. */
  close: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const q = await db.getQuestion(input.id);
    if (!q) throw new TRPCError({ code: "NOT_FOUND", message: "Question not found" });
    if (q.askedBy !== ctx.user.id) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Only the person who asked can close the question" });
    }
    await db.closeQuestion(input.id);
    return { success: true as const };
  }),

  /**
   * Inbox listing. `box` picks the side: questions addressed to me, or the ones
   * I asked and am waiting on. `group` lists everything asked about one customer.
   */
  list: protectedProcedure
    .input(
      z
        .object({
          box: z.enum(["toMe", "fromMe", "group"]).default("toMe"),
          group: z.string().optional(),
          statuses: z.array(z.enum(questionStatuses)).optional(),
          limit: z.number().min(1).max(200).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const box = input?.box ?? "toMe";
      const me = await db.getTeamMemberByUserId(ctx.user.id).catch(() => null);
      if (box === "toMe" && !me) return { memberId: null as number | null, items: [] as any[] };
      const rows = await db.listQuestions({
        askedTo: box === "toMe" ? me!.id : undefined,
        askedBy: box === "fromMe" ? ctx.user.id : undefined,
        groupName: box === "group" ? input?.group : undefined,
        statuses: input?.statuses,
        limit: input?.limit ?? 100,
      });
      if (rows.length === 0) return { memberId: me?.id ?? null, items: [] as any[] };
      const [members, users, customers, attached] = await Promise.all([
        db.listTeamMembers(true).catch(() => [] as any[]),
        db.listUsers().catch(() => [] as any[]),
        db.listCustomers().catch(() => [] as any[]),
        db.listQuestionInvoices(rows.map(r => r.id)).catch(() => [] as { questionId: number; invoiceId: number }[]),
      ]);
      const memberById = new Map(members.map((m: any) => [m.id, m]));
      const userName = (userId: number | null) => {
        if (!userId) return null;
        const viaTeam = members.find((m: any) => m.userId === userId);
        if (viaTeam?.name) return viaTeam.name as string;
        return (users.find((u: any) => u.id === userId)?.name as string) ?? null;
      };
      const custById = new Map(customers.map((c: any) => [c.id, c]));
      const invoicesByQuestion = new Map<number, number[]>();
      for (const a of attached) {
        const list = invoicesByQuestion.get(a.questionId) ?? [];
        list.push(a.invoiceId);
        invoicesByQuestion.set(a.questionId, list);
      }
      return {
        memberId: me?.id ?? null,
        items: rows.map(r => ({
          id: r.id,
          group: r.groupName,
          customerId: r.customerId,
          companyName: r.customerId ? (custById.get(r.customerId)?.name ?? null) : null,
          question: r.question,
          answer: r.answer,
          status: r.status,
          department: r.department,
          askedByName: userName(r.askedBy),
          askedByMe: r.askedBy === ctx.user.id,
          askedToName: (memberById.get(r.askedTo)?.name as string) ?? null,
          askedToMe: me != null && r.askedTo === me.id,
          answeredByName: userName(r.answeredBy),
          answeredAt: r.answeredAt,
          invoiceIds: invoicesByQuestion.get(r.id) ?? [],
          createdAt: r.createdAt,
        })),
      };
    }),

  /** Sidebar counters: what I owe an answer, and answers waiting for me to read. */
  badges: protectedProcedure.query(async ({ ctx }) => {
    const me = await db.getTeamMemberByUserId(ctx.user.id).catch(() => null);
    return db.countQuestionsForBadges(me?.id ?? null, ctx.user.id).catch(() => ({ toAnswer: 0, answeredForMe: 0 }));
  }),
});
