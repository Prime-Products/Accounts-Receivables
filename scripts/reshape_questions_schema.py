"""Replace the unused `requests` schema block with the Ask-a-colleague model."""

path = "drizzle/schema.ts"
src = open(path).read()

start_marker = 'export const requestStatuses = ["Open", "Answered", "Closed", "Cancelled"] as const;'
end_marker = "export type InsertRequestNotification = typeof requestNotifications.$inferInsert;"

start = src.index(start_marker)
end = src.index(end_marker) + len(end_marker)

new_block = '''/**
 * Internal questions between colleagues about a customer / group.
 *
 * A question is asked to ONE colleague and expects an answer, which is what
 * separates it from an @mention (a reference, no answer expected) and from a task
 * (dated work). It carries no due date on purpose: "did the delivery happen?" is
 * not scheduled work, it is a question that is either answered or not.
 */
export const questionStatuses = ["Open", "Answered", "Closed"] as const;
export type QuestionStatus = (typeof questionStatuses)[number];
/** Optional hint about which desk the question belongs to, for filtering. */
export const departmentOptions = [
  "Contracts",
  "Logistics",
  "Operations",
  "Finance",
  "Legal",
  "Sales",
  "Other",
] as const;
export type Department = (typeof departmentOptions)[number];
export const questions = mysqlTable(
  "questions",
  {
    id: int("id").autoincrement().primaryKey(),
    /** The group the question is about — always set, so the card can show it. */
    groupName: varchar("groupName", { length: 255 }).notNull(),
    /** Member company the question concerns, when it is company-specific. */
    customerId: int("customerId"),
    /** Auth user who asked (users.id). */
    askedBy: int("askedBy").notNull(),
    /** Team member the question is addressed to (team_members.id). */
    askedTo: int("askedTo").notNull(),
    /** Optional department label, purely for filtering the inbox. */
    department: mysqlEnum("department", departmentOptions),
    question: text("question").notNull(),
    /** The colleague's reply, filled in when answered. */
    answer: text("answer"),
    /** Auth user who answered (users.id). */
    answeredBy: int("answeredBy"),
    answeredAt: timestamp("answeredAt"),
    status: mysqlEnum("status", questionStatuses).default("Open").notNull(),
    /** Activity-log row created for the question, so the card can link back. */
    activityId: int("activityId"),
    /** Set when the asker marks the question as resolved. */
    closedAt: timestamp("closedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    index("idx_questions_group").on(t.groupName),
    index("idx_questions_askedTo_status").on(t.askedTo, t.status),
    index("idx_questions_askedBy_status").on(t.askedBy, t.status),
  ]
);
export type Question = typeof questions.$inferSelect;
export type InsertQuestion = typeof questions.$inferInsert;
/** Invoices attached to a question, so the colleague sees exactly what is meant. */
export const questionInvoices = mysqlTable(
  "question_invoices",
  {
    id: int("id").autoincrement().primaryKey(),
    questionId: int("questionId").notNull(),
    invoiceId: int("invoiceId").notNull(),
  },
  t => [
    index("idx_questionInvoices_questionId").on(t.questionId),
    unique("uq_question_invoice").on(t.questionId, t.invoiceId),
  ]
);
export type QuestionInvoice = typeof questionInvoices.$inferSelect;'''

src = src[:start] + new_block + src[end:]
open(path, "w").write(src)
print("replaced", end - start, "chars with", len(new_block))
