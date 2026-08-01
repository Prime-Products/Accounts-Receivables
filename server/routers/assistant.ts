import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { invokeLLM } from "../_core/llm";
import * as db from "../db";
import { APP_KNOWLEDGE } from "../lib/assistantKnowledge";
import { buildPortfolioSnapshot, resolveMentions } from "../lib/assistantFacts";
import { protectedProcedure, router } from "../_core/trpc";

/** Model used for the assistant — fast and cheap, same family as the group AI summary. */
export const ASSISTANT_MODEL = "gemini-2.5-flash";

/** Questions shown as one-click starters in the widget. */
export const SUGGESTED_QUESTIONS = [
  "Πόσο overdue έχουμε συνολικά και πού συγκεντρώνεται;",
  "Πώς πάει ο μήνας σε σχέση με τον στόχο;",
  "Ποιοι όμιλοι χρειάζονται follow-up σήμερα;",
  "Πώς κάνω allocate μια πληρωμή σε τιμολόγια;",
  "Τι δείχνει το Address Book και πώς φτιάχνω saved view;",
] as const;

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(4000),
});

/** Extracts plain text from an LLM response content field. */
export function contentToText(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw.map((c: any) => (c?.type === "text" ? c.text : "")).join("");
  return "";
}

export const assistantRouter = router({
  /** Starter questions + a hint of scale, so the panel can render before any question. */
  intro: protectedProcedure.query(async () => {
    return { suggestions: [...SUGGESTED_QUESTIONS], model: ASSISTANT_MODEL };
  }),

  ask: protectedProcedure
    .input(
      z.object({
        question: z.string().min(2).max(1000),
        /** Prior turns, newest last. Trimmed server-side to the last 8. */
        history: z.array(messageSchema).max(40).default([]),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const now = Date.now();
      const [snapshot, mentioned] = await Promise.all([
        buildPortfolioSnapshot(now),
        resolveMentions(input.question, now),
      ]);

      const facts = {
        ...snapshot,
        mentionedGroups: mentioned.groups,
        mentionedVessels: mentioned.vessels,
        mentionedContacts: mentioned.contacts,
      };

      const history = input.history.slice(-8);
      const response = await invokeLLM({
        model: ASSISTANT_MODEL,
        messages: [
          {
            role: "system",
            content: `${APP_KNOWLEDGE}

You are the in-app assistant of AR Pro, talking to ${ctx.user.name ?? "the user"}, who works in credit control at Prime Products.
You are READ-ONLY: you can explain and analyse, never change data.

DATA (live, as of today — the only figures you may use):
${JSON.stringify(facts)}

If the question names a group/company/vessel/contact that is not present in
mentionedGroups / mentionedVessels / mentionedContacts, say you could not find it
by that name and suggest searching in the Address Book or Collections Desk.`,
          },
          ...history.map(m => ({ role: m.role, content: m.content })),
          { role: "user" as const, content: input.question },
        ],
      });

      const answer = contentToText(response.choices?.[0]?.message?.content).trim();
      if (!answer) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Ο βοηθός δεν απάντησε, δοκίμασε ξανά." });

      db.addAudit({
        userId: ctx.user.id,
        userName: ctx.user.name ?? undefined,
        action: "Ask AI Assistant",
        entityType: "assistant",
        details: input.question.slice(0, 300),
      }).catch(() => {});

      return {
        answer,
        context: {
          groups: mentioned.groups.map((g: any) => g.name),
          vessels: mentioned.vessels.map((v: any) => v.name),
          contacts: mentioned.contacts.map((c: any) => c.name),
        },
        answeredAt: Date.now(),
      };
    }),
});
