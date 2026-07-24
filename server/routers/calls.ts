import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";
import { groupNotes } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";

export const callsRouter = router({
  /**
   * Get call history for a group: notes related to the group (calls, promises, etc.)
   */
  getHistory: protectedProcedure
    .input(z.object({ group: z.string().min(1) }))
    .query(async ({ input }) => {
      const database = await (db as any).requireDb();

      // Fetch notes for this group, sorted by date (newest first)
      const notes = await database
        .select()
        .from(groupNotes)
        .where(eq(groupNotes.groupName, input.group))
        .orderBy(desc(groupNotes.createdAt));

      // Transform to call history format
      return notes.map((n: any) => ({
        date: new Date(n.createdAt),
        type: "Note",
        outcome: null,
        note: n.content,
      }));
    }),

  /**
   * Log a call result (no_answer, promised, disputed) and create a note
   */
  logCall: protectedProcedure
    .input(
      z.object({
        group: z.string().min(1),
        outcome: z.enum(["no_answer", "promised", "disputed"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Create a note with the call outcome
      const outcomeText = {
        no_answer: "Δεν απάντησε",
        promised: "Υποσχέθηκε πληρωμή",
        disputed: "Αμφισβητεί το ποσό",
      }[input.outcome];

      await db.createGroupNote({
        groupName: input.group,
        content: `[Κλήση] ${outcomeText}`,
        createdBy: ctx.user.id,
        createdAt: Date.now(),
      });

      return { success: true };
    }),
});
