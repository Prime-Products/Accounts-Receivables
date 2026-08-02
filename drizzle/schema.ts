import { bigint, boolean, decimal, double, index, int, mysqlEnum, mysqlTable, text, timestamp, unique, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/** App-level role for AR workflows (beyond the base user/admin role). */
export const appRoles = ["Administrator", "Accounting", "Credit Controller", "Management"] as const;

export const userProfiles = mysqlTable("user_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  appRole: mysqlEnum("appRole", appRoles).default("Accounting").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const customerTiers = ["Platinum", "Gold", "Silver", "Bronze", "New"] as const;

/**
 * Team members — collaborators who manage customers and take on tasks.
 * Separate from the auth `users` table: members are managed in-app (no login
 * required) and can be linked to an auth user later via userId if they sign in.
 */
export const teamMembers = mysqlTable("team_members", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 191 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 64 }),
  /** Job title / role label, e.g. "Credit Controller". */
  title: varchar("title", { length: 128 }),
  /** Optional link to an auth user (users.id) if the member signs in. */
  userId: int("userId"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type TeamMember = typeof teamMembers.$inferSelect;
export type InsertTeamMember = typeof teamMembers.$inferInsert;

/**
 * Historical payment behavior per customer, computed from imported payment allocations
 * (last-year window). Used by the smart forecast for avg/median days-to-pay.
 */
export const paymentBehavior = mysqlTable("payment_behavior", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull().unique(),
  payments: int("payments").notNull().default(0),
  totalPaid: double("totalPaid").notNull().default(0),
  avgDaysLate: double("avgDaysLate").notNull().default(0),
  medianDaysLate: double("medianDaysLate").notNull().default(0),
  avgDaysFromInvoice: double("avgDaysFromInvoice").notNull().default(0),
  medianDaysFromInvoice: double("medianDaysFromInvoice").notNull().default(0),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PaymentBehavior = typeof paymentBehavior.$inferSelect;

export const customers = mysqlTable("customers", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  vatNumber: varchar("vatNumber", { length: 32 }),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 64 }),
  contactPerson: varchar("contactPerson", { length: 255 }),
  customerGroup: varchar("customerGroup", { length: 255 }),
  masterSoftoneId: varchar("masterSoftoneId", { length: 64 }),
  tier: mysqlEnum("tier", customerTiers).default("New").notNull(),
  creditLimit: decimal("creditLimit", { precision: 14, scale: 2 }).default("0").notNull(),
  paymentTermsDays: int("paymentTermsDays").default(30).notNull(),
  turnoverYtd: decimal("turnoverYtd", { precision: 14, scale: 2 }),
  turnoverLastYear: decimal("turnoverLastYear", { precision: 14, scale: 2 }),
  turnoverTwoYearsAgo: decimal("turnoverTwoYearsAgo", { precision: 18, scale: 4 }),
  balance: decimal("balance", { precision: 18, scale: 4 }),
  uncovered: decimal("uncovered", { precision: 18, scale: 4 }),
  unpaid: decimal("unpaid", { precision: 18, scale: 4 }),
  overdue: decimal("overdue", { precision: 18, scale: 4 }),
  overdueEndOfMonth: decimal("overdueEndOfMonth", { precision: 18, scale: 4 }),
  averageOverdueDays: decimal("averageOverdueDays", { precision: 12, scale: 4 }),
  openOrders: decimal("openOrders", { precision: 18, scale: 4 }),
  ordersAmount: decimal("ordersAmount", { precision: 18, scale: 4 }),
  collections: decimal("collections", { precision: 18, scale: 4 }),
  onHoldStatus: mysqlEnum("onHoldStatus", ["Active", "Under Review", "Eligible for On Hold", "On Hold", "Legal"]).default("Active").notNull(),
  /** Responsible team member (account manager); FK to team_members.id. */
  accountManagerId: int("accountManagerId"),
  /** Team member assigned to collect this customer's receivables (Collector / Credit Controller). */
  collectorId: int("collectorId"),
  softoneId: varchar("softoneId", { length: 64 }),
  softoneSyncedAt: timestamp("softoneSyncedAt"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, t => [
  // Every group-level screen (Desk, Address Book, forecast) buckets customers by
  // this column, so it must not be a full scan.
  index("idx_customers_customerGroup").on(t.customerGroup),
  index("idx_customers_name").on(t.name),
]);

export const invoiceStatuses = ["Open", "Partially Paid", "Paid", "Overdue", "Disputed"] as const;

export const invoices = mysqlTable("invoices", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  invoiceNumber: varchar("invoiceNumber", { length: 64 }).notNull(),
  company: varchar("company", { length: 128 }),
  currency: varchar("currency", { length: 8 }).default("EUR").notNull(),
  /** Original amount converted to EUR using the FX rate at import/sync time. */
  amountEur: decimal("amountEur", { precision: 14, scale: 2 }),
  issueDate: bigint("issueDate", { mode: "number" }).notNull(),
  dueDate: bigint("dueDate", { mode: "number" }).notNull(),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  paidAmount: decimal("paidAmount", { precision: 14, scale: 2 }).default("0").notNull(),
  status: mysqlEnum("status", invoiceStatuses).default("Open").notNull(),
  contractInstallmentId: int("contractInstallmentId"),
  /** Simple flag: this invoice is a contract installment (must be paid on time). Link to a specific contract comes later. */
  isContractInstallment: boolean("isContractInstallment").default(false).notNull(),
  softoneId: varchar("softoneId", { length: 64 }).unique(),
  /** Optional vessel the invoice concerns (shipping clients); FK to vessels.id. */
  vesselId: int("vesselId"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** SoftOne installment allocations allow one invoice to concern multiple vessels. */
export const invoiceVesselAllocations = mysqlTable(
  "invoice_vessel_allocations",
  {
    id: int("id").autoincrement().primaryKey(),
    invoiceId: int("invoiceId").notNull(),
    vesselId: int("vesselId").notNull(),
    amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
    softoneInstallmentId: varchar("softoneInstallmentId", { length: 64 }).notNull().unique(),
    contractSoftoneId: varchar("contractSoftoneId", { length: 64 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    index("idx_iva_invoiceId").on(t.invoiceId),
    index("idx_iva_vesselId").on(t.vesselId),
  ],
);

export type InvoiceVesselAllocation = typeof invoiceVesselAllocations.$inferSelect;
export type InsertInvoiceVesselAllocation = typeof invoiceVesselAllocations.$inferInsert;

export const receiptMethods = ["Bank Transfer", "Cash", "Cheque", "Card"] as const;

export const receipts = mysqlTable("receipts", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  receiptNumber: varchar("receiptNumber", { length: 64 }).notNull(),
  receiptDate: bigint("receiptDate", { mode: "number" }).notNull(),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  method: mysqlEnum("method", receiptMethods).default("Bank Transfer").notNull(),
  softoneId: varchar("softoneId", { length: 64 }),
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** Allocation of a receipt against one or more invoices (matching/reconciliation). */
export const receiptAllocations = mysqlTable("receipt_allocations", {
  id: int("id").autoincrement().primaryKey(),
  receiptId: int("receiptId").notNull(),
  invoiceId: int("invoiceId").notNull(),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const contractStatuses = ["Active", "Expiring Soon", "Expired", "Terminated"] as const;

export const contracts = mysqlTable("contracts", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  contractNumber: varchar("contractNumber", { length: 64 }).notNull().unique(),
  title: varchar("title", { length: 255 }).notNull(),
  totalValue: decimal("totalValue", { precision: 14, scale: 2 }).notNull(),
  startDate: bigint("startDate", { mode: "number" }).notNull(),
  endDate: bigint("endDate", { mode: "number" }).notNull(),
  status: mysqlEnum("status", contractStatuses).default("Active").notNull(),
  expiryNotified: int("expiryNotified").default(0).notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const installmentStatuses = ["Upcoming", "Invoiced", "Paid", "Overdue"] as const;

export const contractInstallments = mysqlTable("contract_installments", {
  id: int("id").autoincrement().primaryKey(),
  contractId: int("contractId").notNull(),
  installmentNumber: int("installmentNumber").notNull(),
  dueDate: bigint("dueDate", { mode: "number" }).notNull(),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  status: mysqlEnum("status", installmentStatuses).default("Upcoming").notNull(),
  invoiceId: int("invoiceId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** SOP follow-up offsets in days from invoice due date: +2, +15, +20, +30 */
export const taskTypes = ["Follow-up +2", "Follow-up +15", "Follow-up +20 SOA", "Escalation +30", "Contract Expiry", "Manual"] as const;
export const taskStatuses = ["Pending", "In Progress", "Completed", "Cancelled"] as const;

export const tasks = mysqlTable("tasks", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  invoiceId: int("invoiceId"),
  contractId: int("contractId"),
  type: mysqlEnum("type", taskTypes).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  dueDate: bigint("dueDate", { mode: "number" }).notNull(),
  status: mysqlEnum("status", taskStatuses).default("Pending").notNull(),
  assignedTo: int("assignedTo"),
  /** Team member responsible for the task; FK to team_members.id. */
  assigneeId: int("assigneeId"),
  /**
   * Collections group this task belongs to, stored explicitly.
   *
   * Historically the link lived only inside `description` as a
   * `(Follow-up: <group>)` marker, which broke for group names containing a
   * closing parenthesis. The marker is still written for readability and for
   * rows created before this column existed, but all new code should read this
   * column (see `server/taskMarkers.ts` → `taskGroup()`).
   */
  customerGroup: varchar("customerGroup", { length: 255 }),
  /** Promise this task checks on, when it is a promise-check task. */
  promiseId: int("promiseId"),
  completedAt: bigint("completedAt", { mode: "number" }),
  completionNotes: text("completionNotes"),
  /** How many times the task's due date has been pushed back (follow-up reschedules). */
  rescheduleCount: int("rescheduleCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, t => [
  index("idx_tasks_customerId").on(t.customerId),
  index("idx_tasks_status").on(t.status),
  index("idx_tasks_assigneeId").on(t.assigneeId),
  index("idx_tasks_dueDate").on(t.dueDate),
  // The Desk resolves "does this group have an open call task?" on every load.
  index("idx_tasks_customerGroup").on(t.customerGroup),
]);

/** Free-form discussion thread on a task — used for internal collaboration between colleagues. */
export const taskComments = mysqlTable("task_comments", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull(),
  /** users.id of the author (nullable — team members without login). */
  authorId: int("authorId"),
  authorName: varchar("authorName", { length: 191 }).default("").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, t => [index("idx_task_comments_taskId").on(t.taskId)]);
export type TaskComment = typeof taskComments.$inferSelect;
export type InsertTaskComment = typeof taskComments.$inferInsert;

/** Invoices attached to a task — lets a colleague see exactly which invoices need attention. */
export const taskInvoices = mysqlTable("task_invoices", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull(),
  invoiceId: int("invoiceId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, t => [index("idx_task_invoices_taskId").on(t.taskId)]);
export type TaskInvoice = typeof taskInvoices.$inferSelect;
export type InsertTaskInvoice = typeof taskInvoices.$inferInsert;

/** Team members watching a task's progress — shown as an avatar stack on the task. */
export const taskWatchers = mysqlTable("task_watchers", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull(),
  /** team_members.id of the watcher. */
  memberId: int("memberId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, t => [index("idx_task_watchers_taskId").on(t.taskId)]);
export type TaskWatcher = typeof taskWatchers.$inferSelect;
export type InsertTaskWatcher = typeof taskWatchers.$inferInsert;

export const onHoldStatuses = ["Under Review", "Eligible for On Hold", "On Hold", "Legal", "Rejected", "Resolved"] as const;

export const onHoldProposals = mysqlTable("on_hold_proposals", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  status: mysqlEnum("status", onHoldStatuses).default("Under Review").notNull(),
  reason: text("reason").notNull(),
  totalOverdue: decimal("totalOverdue", { precision: 14, scale: 2 }).notNull(),
  overdueInvoiceCount: int("overdueInvoiceCount").notNull(),
  oldestOverdueDays: int("oldestOverdueDays").notNull(),
  supportingData: text("supportingData"),
  submittedBy: int("submittedBy").notNull(),
  decidedBy: int("decidedBy"),
  decisionNotes: text("decisionNotes"),
  decidedAt: bigint("decidedAt", { mode: "number" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const collectionPlans = mysqlTable("collection_plans", {
  id: int("id").autoincrement().primaryKey(),
  year: int("year").notNull(),
  month: int("month").notNull(),
  targetAmount: decimal("targetAmount", { precision: 14, scale: 2 }).notNull(),
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * Per-customer monthly collection forecast entry (all amounts in EUR).
 * Generated automatically at month start; the AI suggests an expected amount
 * based on customer payment behavior; the user can override it.
 */
export const forecastEntries = mysqlTable("forecast_entries", {
  id: int("id").autoincrement().primaryKey(),
  year: int("year").notNull(),
  month: int("month").notNull(),
  customerId: int("customerId").notNull(),
  /** Customer group key — forecast is generated per group; customerId keeps the largest-exposure member for navigation. */
  customerGroup: varchar("customerGroup", { length: 255 }),
  /** Total open amount due within the month (incl. already-overdue), EUR. */
  dueAmount: decimal("dueAmount", { precision: 14, scale: 2 }).default("0").notNull(),
  /** Of which already overdue at generation time, EUR. */
  overdueAmount: decimal("overdueAmount", { precision: 14, scale: 2 }).default("0").notNull(),
  /** AI/heuristic-suggested expected collection, EUR. */
  aiSuggestedAmount: decimal("aiSuggestedAmount", { precision: 14, scale: 2 }).default("0").notNull(),
  /** Short reasoning behind the AI suggestion. */
  aiReasoning: text("aiReasoning"),
  /** Final expected amount — starts equal to AI suggestion, user-editable. */
  expectedAmount: decimal("expectedAmount", { precision: 14, scale: 2 }).default("0").notNull(),
  /** Initial forecast amount captured on first generation of the month (never changes during the month). */
  initialForecast: decimal("initialForecast", { precision: 14, scale: 2 }).default("0"),
  /** Whether the user manually adjusted expectedAmount. */
  userAdjusted: int("userAdjusted").default(0).notNull(),
  adjustedBy: int("adjustedBy"),
  adjustmentNote: text("adjustmentNote"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Generic key-value app settings (FX rates, forecast cron uid, etc.). */
export const appSettings = mysqlTable("app_settings", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 128 }).notNull().unique(),
  value: text("value").notNull(),
  updatedBy: int("updatedBy"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const promiseStatuses = ["Pending", "Kept", "Broken"] as const;

// Turnover figures (EUR) imported from the ERP customers financial list.

/** Free-form notes attached to a customer group (group card). */
export const groupNotes = mysqlTable("group_notes", {
  id: int("id").autoincrement().primaryKey(),
  groupName: varchar("groupName", { length: 255 }).notNull(),
  content: text("content").notNull(),
  createdBy: int("createdBy").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, t => [index("idx_group_notes_groupName").on(t.groupName)]);
export type GroupNote = typeof groupNotes.$inferSelect;

/**
 * Per-group collection profile: free-text particularities that collectors must
 * remember before contacting the customer (best call days/hours, preferred
 * contact person, payment quirks, language, etc.). Always visible on the
 * group card and inside the Log Call dialog.
 */
export const groupCollectionProfile = mysqlTable("group_collection_profile", {
  id: int("id").autoincrement().primaryKey(),
  groupName: varchar("groupName", { length: 255 }).notNull().unique(),
  notes: text("notes").notNull(),
  updatedBy: int("updatedBy"),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
});
export type GroupCollectionProfile = typeof groupCollectionProfile.$inferSelect;

/**
 * Manual watch-status override per customer group.
 * "Auto" follows the forecast rule; "Problematic" forces the flag;
 * "Normal" clears it even when the rule would flag the group.
 * ("On Watch" is legacy and treated as "Problematic" in business logic.)
 */
/**
 * Unified group Account Status workflow: Normal → Problematic → Critical → On Hold → Legal.
 * "Auto" means "follow the forecast rule" (no manual override). Legacy values
 * ("On Watch", "Critical", "Resolved") remain in the DB enum for backward
 * compatibility and are normalized at read time (On Watch/Critical → Problematic,
 * Resolved → Normal).
 */
export const watchStatuses = ["Auto", "Problematic", "On Watch", "Normal", "Critical", "Legal", "Resolved", "Under Review", "On Hold"] as const;
export type WatchStatus = (typeof watchStatuses)[number];
export const groupWatchStatus = mysqlTable("group_watch_status", {
  id: int("id").autoincrement().primaryKey(),
  groupName: varchar("groupName", { length: 255 }).notNull().unique(),
  status: mysqlEnum("status", watchStatuses).default("Auto").notNull(),
  /** Epoch ms of when the group first became (and stayed) Problematic. Null when not problematic. */
  problematicSince: bigint("problematicSince", { mode: "number" }),
  updatedBy: int("updatedBy"),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
});
export type GroupWatchStatus = typeof groupWatchStatus.$inferSelect;

export const promisesToPay = mysqlTable("promises_to_pay", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  invoiceId: int("invoiceId"),
  promisedDate: bigint("promisedDate", { mode: "number" }).notNull(),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  status: mysqlEnum("status", promiseStatuses).default("Pending").notNull(),
  notes: text("notes"),
  rescheduleCount: int("rescheduleCount").default(0).notNull(),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, t => [
  index("idx_promises_customerId").on(t.customerId),
  index("idx_promises_status").on(t.status),
  index("idx_promises_promisedDate").on(t.promisedDate),
]);

export const auditLogs = mysqlTable("audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  userName: varchar("userName", { length: 255 }),
  action: varchar("action", { length: 128 }).notNull(),
  entityType: varchar("entityType", { length: 64 }).notNull(),
  entityId: varchar("entityId", { length: 64 }),
  details: text("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const syncLogs = mysqlTable("sync_logs", {
  id: int("id").autoincrement().primaryKey(),
  direction: mysqlEnum("direction", ["Pull", "Push"]).notNull(),
  entityType: varchar("entityType", { length: 64 }).notNull(),
  recordCount: int("recordCount").default(0).notNull(),
  status: mysqlEnum("status", ["Success", "Failed", "Partial"]).notNull(),
  message: text("message"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const emailTemplateTypes = ["SOA", "Payment Reminder", "Overdue Notice", "Friendly Reminder", "Final Notice", "Statement", "Custom"] as const;

export const activityTypes = ["note", "task", "promise", "email", "call", "status_change"] as const;

export const emailHistory = mysqlTable("email_history", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  recipientEmail: varchar("recipientEmail", { length: 320 }).notNull(),
  recipientName: varchar("recipientName", { length: 255 }),
  templateType: mysqlEnum("templateType", emailTemplateTypes).notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  body: text("body").notNull(),
  status: mysqlEnum("status", ["Sent", "Failed", "Pending"]).default("Pending").notNull(),
  sentAt: bigint("sentAt", { mode: "number" }),
  errorMessage: text("errorMessage"),
  attachmentUrl: varchar("attachmentUrl", { length: 2048 }),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const activityLog = mysqlTable("activity_log", {
  id: int("id").autoincrement().primaryKey(),
  groupName: varchar("groupName", { length: 255 }).notNull(),
  customerId: int("customerId"),
  activityType: mysqlEnum("activityType", activityTypes).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  metadata: text("metadata"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, t => [
  // Timeline reads are always "this group, newest first"; the call summary reads
  // "all calls, newest first".
  index("idx_activity_group_created").on(t.groupName, t.createdAt),
  index("idx_activity_type_created").on(t.activityType, t.createdAt),
]);

export type UserProfile = typeof userProfiles.$inferSelect;

/**
 * @mentions of internal team members inside notes (call notes, collection notes).
 *
 * A mention is a reference — "I informed X" / "X should know" — not an assignment,
 * so it deliberately carries no due date and no status: it never becomes work.
 * Rows are keyed by the member so "what mentions me" is a single indexed lookup.
 */
export const noteMentions = mysqlTable("note_mentions", {
  id: int("id").autoincrement().primaryKey(),
  /** Team member being referred to (team_members.id). */
  memberId: int("memberId").notNull(),
  /** Group the note belongs to, so the mention can link back to the card. */
  groupName: varchar("groupName", { length: 255 }).notNull(),
  /** Where the mention was written: a call/collection note is always tied to a group. */
  source: mysqlEnum("source", ["call", "collectionNotes", "groupNote"]).notNull(),
  /** Activity-log row that contains the note, when there is one. */
  activityId: int("activityId"),
  /** The note text (with markers) at the time of writing, for the mentions list. */
  excerpt: varchar("excerpt", { length: 500 }),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  /** Set when the mentioned member marks it as seen. */
  readAt: timestamp("readAt"),
});

export type NoteMention = typeof noteMentions.$inferSelect;
export type InsertNoteMention = typeof noteMentions.$inferInsert;

/**
 * Editable email templates used by the Send Email dialog. One row per template
 * type; the body/subject may contain {{placeholders}} that are substituted with
 * live customer figures when the dialog is opened.
 */
export const emailTemplates = mysqlTable("email_templates", {
  id: int("id").autoincrement().primaryKey(),
  templateType: mysqlEnum("templateType", emailTemplateTypes).notNull().unique(),
  subject: varchar("subject", { length: 500 }).notNull(),
  body: text("body").notNull(),
  updatedBy: int("updatedBy"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = typeof customers.$inferInsert;
export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = typeof invoices.$inferInsert;
export type Receipt = typeof receipts.$inferSelect;
export type InsertReceipt = typeof receipts.$inferInsert;
export type ReceiptAllocation = typeof receiptAllocations.$inferSelect;
export type Contract = typeof contracts.$inferSelect;
export type InsertContract = typeof contracts.$inferInsert;
export type ContractInstallment = typeof contractInstallments.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;
export type OnHoldProposal = typeof onHoldProposals.$inferSelect;
export type InsertOnHoldProposal = typeof onHoldProposals.$inferInsert;
export type CollectionPlan = typeof collectionPlans.$inferSelect;
export type ForecastEntry = typeof forecastEntries.$inferSelect;
export type InsertForecastEntry = typeof forecastEntries.$inferInsert;
export type AppSetting = typeof appSettings.$inferSelect;
export type PromiseToPay = typeof promisesToPay.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type SyncLog = typeof syncLogs.$inferSelect;
export type EmailHistory = typeof emailHistory.$inferSelect;
export type InsertEmailHistory = typeof emailHistory.$inferInsert & { attachmentUrl?: string | null };
export type ActivityLog = typeof activityLog.$inferSelect;
export type InsertActivityLog = typeof activityLog.$inferInsert;

/**
 * A directory entry is either a real person or a departmental / shared mailbox.
 * Kept deliberately to two values — the team asked for no further breakdown.
 */
export const contactTypes = ["Person", "Department"] as const;
export type ContactType = (typeof contactTypes)[number];
export const paymentContacts = mysqlTable("payment_contacts", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  title: varchar("title", { length: 255 }),
  /**
   * Whether this entry is a real person or a departmental / shared mailbox
   * (accounts@, operations@ ...). Departments are addressed as a unit when
   * sending email, so the directory has to tell them apart from people.
   */
  contactType: mysqlEnum("contactType", contactTypes).default("Person").notNull(),
  /**
   * Address Book archives contacts instead of deleting them: an archived contact
   * disappears from the directory and from mailing lists but its history and
   * custom-field values remain intact and it can be restored.
   */
  archived: int("archived").default(0).notNull(),
  archivedAt: timestamp("archivedAt"),
  /** Set when the contact was merged away; points at the surviving contact. */
  mergedIntoId: int("mergedIntoId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, t => [
  index("idx_payment_contacts_customerId").on(t.customerId),
  index("idx_payment_contacts_email").on(t.email),
  index("idx_payment_contacts_archived").on(t.archived),
]);

export type PaymentContact = typeof paymentContacts.$inferSelect;
export type InsertPaymentContact = typeof paymentContacts.$inferInsert;

export const confirmationStatuses = ["Not Contacted", "Confirmed", "Pending Follow-up", "Broken", "Kept", "Escalated"] as const;
export type ConfirmationStatus = (typeof confirmationStatuses)[number];

/**
 * Group-level confirmation status tracking.
 * Stores the current confirmation state for each customer group (e.g., MSC SHIPMANAGEMENT LTD).
 * Updated when the user logs a call and records the customer's response.
 */
export const groupConfirmationStatus = mysqlTable("group_confirmation_status", {
  id: int("id").autoincrement().primaryKey(),
  groupName: varchar("groupName", { length: 255 }).notNull().unique(),
  status: mysqlEnum("status", confirmationStatuses).default("Not Contacted").notNull(),
  /** Expected/promised amount in EUR. */
  amount: decimal("amount", { precision: 14, scale: 2 }).default("0").notNull(),
  /** When to follow up (if status is Pending Follow-up). */
  followUpDate: bigint("followUpDate", { mode: "number" }),
  /** Notes about the confirmation (e.g., reason for broken promise). */
  notes: text("notes"),
  /** Last person who updated this status. */
  updatedBy: int("updatedBy"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type GroupConfirmationStatus = typeof groupConfirmationStatus.$inferSelect;
export type InsertGroupConfirmationStatus = typeof groupConfirmationStatus.$inferInsert;

/**
 * Bank details for payment processing per customer.
 * Stores IBAN, account number, bank name, Swift code, and beneficiary name.
 * One primary record per customer; can have multiple alternative accounts per currency.
 */
export const paymentBankDetails = mysqlTable("payment_bank_details", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull().unique(),
  
  // Primary bank account details
  iban: varchar("iban", { length: 34 }),
  accountNumber: varchar("accountNumber", { length: 64 }),
  bankName: varchar("bankName", { length: 255 }),
  swiftCode: varchar("swiftCode", { length: 11 }),
  beneficiaryName: varchar("beneficiaryName", { length: 255 }),
  
  // Currency and defaults
  currency: varchar("currency", { length: 8 }).default("EUR").notNull(),
  isDefault: int("isDefault").default(1).notNull(),
  
  // Audit trail
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedBy: int("updatedBy"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, t => [
  index("idx_bank_details_customerId").on(t.customerId),
]);

export type PaymentBankDetails = typeof paymentBankDetails.$inferSelect;
export type InsertPaymentBankDetails = typeof paymentBankDetails.$inferInsert;

export const wireTransfers = mysqlTable("wire_transfers", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  
  // Wire transfer details
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull().$type<number>(),
  currency: varchar("currency", { length: 8 }).default("EUR").notNull(),
  transferDate: bigint("transferDate", { mode: "number" }).notNull(), // Unix timestamp in milliseconds
  branch: varchar("branch", { length: 128 }), // Our branch where the customer sent the transfer (same values as invoice branches)
  
  // Status tracking: Pending (waiting to receive) or Received
  status: mysqlEnum("status", ["Pending", "Received"]).default("Pending").notNull(),
  receivedDate: bigint("receivedDate", { mode: "number" }), // Unix timestamp when payment was received (null if still pending)
  
  // Reference and notes
  referenceNumber: varchar("referenceNumber", { length: 255 }), // Bank reference or transaction ID
  notes: text("notes"),
  
  // Internal inter-office transfers: auto-created when an allocation settles an
  // invoice of a DIFFERENT branch than the branch that received the customer's money.
  // e.g. Prime Products LTD → Prime Products Distribution B.V (to settle a SUMMER SHIPPING invoice)
  isInternal: boolean("isInternal").default(false).notNull(),
  sourceWireTransferId: int("sourceWireTransferId"), // the original customer transfer this internal transfer derives from
  sourceAllocationId: int("sourceAllocationId"), // the allocation that triggered this internal transfer
  fromBranch: varchar("fromBranch", { length: 128 }), // our office that received the customer's money
  toBranch: varchar("toBranch", { length: 128 }), // our office whose invoice was settled
  
  // Audit trail
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedBy: int("updatedBy"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, t => [
  index("idx_wire_transfers_customerId").on(t.customerId),
  index("idx_wire_transfers_status").on(t.status),
  index("idx_wire_transfers_transferDate").on(t.transferDate),
  index("idx_wire_transfers_sourceWireTransferId").on(t.sourceWireTransferId),
]);

export type WireTransfer = typeof wireTransfers.$inferSelect;
export type InsertWireTransfer = typeof wireTransfers.$inferInsert;

/**
 * Allocation (συμψηφισμός) of a wire transfer against one or more invoices.
 * Group-level: the invoice may belong to ANY company in the sender's group
 * (e.g. a DYNACOM transfer can settle CREST invoices).
 */
export const wireTransferAllocations = mysqlTable(
  "wire_transfer_allocations",
  {
    id: int("id").autoincrement().primaryKey(),
    wireTransferId: int("wireTransferId").notNull(),
    invoiceId: int("invoiceId").notNull(),
    amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
    createdBy: int("createdBy"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [
    index("idx_wta_wireTransferId").on(t.wireTransferId),
    index("idx_wta_invoiceId").on(t.invoiceId),
  ]
);

export type WireTransferAllocation = typeof wireTransferAllocations.$inferSelect;
export type InsertWireTransferAllocation = typeof wireTransferAllocations.$inferInsert;

/**
 * Vessels (ships) — reusable registry. A vessel may optionally be linked to a
 * customer (owner/manager), but the field is available on ALL invoices.
 */
export const vessels = mysqlTable(
  "vessels",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 191 }).notNull(),
    /** Optional owning/managing customer. */
    customerId: int("customerId"),
    /** Optional IMO number. */
    imo: varchar("imo", { length: 32 }),
    /** Vessel type, e.g. Container, Bulk Carrier, Tanker. */
    vesselType: varchar("vesselType", { length: 64 }),
    /** Flag state, e.g. Greece, Panama, Liberia. */
    flag: varchar("flag", { length: 64 }),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [index("idx_vessels_name").on(t.name), index("idx_vessels_customerId").on(t.customerId)]
);

export type Vessel = typeof vessels.$inferSelect;
export type InsertVessel = typeof vessels.$inferInsert;

// ---------- Address Book: custom fields, saved views, column layouts ----------

/** The four record types the Address Book manages. */
export const addressBookEntities = ["group", "customer", "vessel", "contact"] as const;
export type AddressBookEntity = (typeof addressBookEntities)[number];

/** Data types a user-defined field can take. */
/**
 * Gift tiers used on the yearly corporate gift list. The tier is expressed in
 * the source workbook by which column a name sits in, not by a written value.
 */
export const giftTiers = ["Small", "Medium", "Special", "Super Special", "Whiskey"] as const;
export type GiftTier = (typeof giftTiers)[number];

/**
 * Who receives a gift, per year. Kept as its own table rather than a flag on the
 * contact because the list is rebuilt every year and the history matters ("did we
 * send something last year?"), and because a contact may move company.
 */
export const contactGifts = mysqlTable(
  "contact_gifts",
  {
    id: int("id").autoincrement().primaryKey(),
    contactId: int("contactId").notNull(),
    year: int("year").notNull(),
    tier: mysqlEnum("tier", giftTiers).default("Small").notNull(),
    /** Region column from the source list (ΑΘΗΝΑ, ΠΕΙΡΑΙΑΣ ...). */
    region: varchar("region", { length: 120 }),
    /** Exactly how the recipient was written on the source list, for traceability. */
    sourceName: varchar("sourceName", { length: 255 }),
    /** Group as written on the source list, which may differ from the ERP group. */
    sourceGroup: varchar("sourceGroup", { length: 255 }),
    notes: varchar("notes", { length: 500 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    contactYearIdx: unique("contact_gifts_contact_year_idx").on(table.contactId, table.year),
    yearIdx: index("contact_gifts_year_idx").on(table.year),
  }),
);

export type ContactGift = typeof contactGifts.$inferSelect;
export type InsertContactGift = typeof contactGifts.$inferInsert;

/** Review states for a gift-list row that could not be auto-matched with certainty. */
export const giftReviewStatuses = ["pending", "resolved", "dismissed"] as const;
export type GiftReviewStatus = (typeof giftReviewStatuses)[number];

/**
 * Rows from an imported gift workbook that need a human decision: the name was
 * matched only probably, matched nothing, or was a quantity instead of a person.
 * Resolving a row writes into contact_gifts and marks the row resolved, so the
 * queue shrinks as it is worked through and nothing is silently guessed.
 */
export const giftImportReview = mysqlTable(
  "gift_import_review",
  {
    id: int("id").autoincrement().primaryKey(),
    year: int("year").notNull(),
    /** Recipient exactly as written on the list. */
    sourceName: varchar("sourceName", { length: 255 }).notNull(),
    sourceGroup: varchar("sourceGroup", { length: 255 }),
    region: varchar("region", { length: 120 }),
    tier: mysqlEnum("tier", giftTiers).default("Small").notNull(),
    comment: varchar("comment", { length: 500 }),
    /** Matcher verdict: probable | weak | unmatched | count_request. */
    matchKind: varchar("matchKind", { length: 32 }).notNull(),
    /** Suggested contacts as JSON, best first: [{id,name,email,company,group,score}]. */
    candidates: text("candidates"),
    status: mysqlEnum("status", giftReviewStatuses).default("pending").notNull(),
    /** Contact chosen by the reviewer, once resolved. */
    resolvedContactId: int("resolvedContactId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    yearStatusIdx: index("gift_review_year_status_idx").on(table.year, table.status),
  }),
);

export type GiftImportReview = typeof giftImportReview.$inferSelect;
export type InsertGiftImportReview = typeof giftImportReview.$inferInsert;

export const customFieldTypes = ["text", "longtext", "number", "date", "select", "checkbox", "email", "phone", "url"] as const;
export type CustomFieldType = (typeof customFieldTypes)[number];

/**
 * Definition of a user-added field on an Address Book entity. Values live in
 * `custom_field_values`, so adding a field never requires a schema migration and
 * never interferes with the ERP sync.
 */
export const customFieldDefs = mysqlTable(
  "custom_field_defs",
  {
    id: int("id").autoincrement().primaryKey(),
    entity: mysqlEnum("entity", addressBookEntities).notNull(),
    /** Stable machine key, unique per entity, e.g. "base_port". */
    fieldKey: varchar("fieldKey", { length: 64 }).notNull(),
    /** Human label shown on cards, columns and exports. */
    label: varchar("label", { length: 128 }).notNull(),
    fieldType: mysqlEnum("fieldType", customFieldTypes).default("text").notNull(),
    /** JSON array of allowed values, for fieldType = "select". */
    options: text("options"),
    /** Optional helper text shown under the input. */
    helpText: varchar("helpText", { length: 255 }),
    required: int("required").default(0).notNull(),
    /** Display order within the "Custom fields" block on the card. */
    sortOrder: int("sortOrder").default(0).notNull(),
    /** Soft delete: archived definitions keep their values but disappear from the UI. */
    archived: int("archived").default(0).notNull(),
    createdBy: int("createdBy"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [unique("uq_custom_field_entity_key").on(t.entity, t.fieldKey)]
);

export type CustomFieldDef = typeof customFieldDefs.$inferSelect;
export type InsertCustomFieldDef = typeof customFieldDefs.$inferInsert;

/**
 * A single custom-field value for one record. `recordKey` is the record identity:
 * the numeric id as text for customers/vessels/contacts, and the group name for
 * groups (groups are derived from customers and have no id of their own).
 */
export const customFieldValues = mysqlTable(
  "custom_field_values",
  {
    id: int("id").autoincrement().primaryKey(),
    fieldId: int("fieldId").notNull(),
    entity: mysqlEnum("entity", addressBookEntities).notNull(),
    recordKey: varchar("recordKey", { length: 255 }).notNull(),
    value: text("value"),
    updatedBy: int("updatedBy"),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    unique("uq_custom_value_field_record").on(t.fieldId, t.recordKey),
    index("idx_custom_value_entity_record").on(t.entity, t.recordKey),
  ]
);

export type CustomFieldValue = typeof customFieldValues.$inferSelect;
export type InsertCustomFieldValue = typeof customFieldValues.$inferInsert;

/**
 * A named, reusable list: filters + visible columns + sort for one Address Book tab.
 * Personal by default; `shared = 1` publishes it to the whole team.
 */
export const savedViews = mysqlTable(
  "saved_views",
  {
    id: int("id").autoincrement().primaryKey(),
    entity: mysqlEnum("entity", addressBookEntities).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    /** JSON: { search, filters, columns, columnOrder, sortKey, sortDir }. */
    config: text("config").notNull(),
    shared: int("shared").default(0).notNull(),
    ownerId: int("ownerId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [index("idx_saved_views_entity").on(t.entity)]
);

export type SavedView = typeof savedViews.$inferSelect;
export type InsertSavedView = typeof savedViews.$inferInsert;

/**
 * Per-user column visibility and order for one Address Book tab. Column widths keep
 * living in localStorage (they are pure presentation), this table stores the choices
 * that must follow the user across devices.
 */
export const listLayouts = mysqlTable(
  "list_layouts",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    /** Table identity, e.g. "addressbook:contact". */
    listKey: varchar("listKey", { length: 64 }).notNull(),
    /** JSON: { hidden: string[], order: string[] }. */
    config: text("config").notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [unique("uq_list_layout_user_list").on(t.userId, t.listKey)]
);

export type ListLayout = typeof listLayouts.$inferSelect;
export type InsertListLayout = typeof listLayouts.$inferInsert;

export const requestStatuses = ["Open", "Answered", "Closed", "Cancelled"] as const;
export type RequestStatus = (typeof requestStatuses)[number];

export const departmentOptions = ["Contracts", "Logistics", "Operations", "Finance", "Legal", "Sales", "Other"] as const;
export type Department = (typeof departmentOptions)[number];

export const requests = mysqlTable(
  "requests",
  {
    id: int("id").autoincrement().primaryKey(),
    customerId: int("customerId"),
    groupName: varchar("groupName", { length: 255 }),
    createdBy: int("createdBy").notNull(), // FK to users.id
    requestedDepartment: mysqlEnum("requestedDepartment", departmentOptions).notNull(),
    question: text("question").notNull(),
    status: mysqlEnum("status", requestStatuses).default("Open").notNull(),
    createdAt: bigint("createdAt", { mode: "number" }).notNull(),
    updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
  },
  t => [
    index("idx_requests_customerId").on(t.customerId),
    index("idx_requests_groupName").on(t.groupName),
    index("idx_requests_createdBy").on(t.createdBy),
    index("idx_requests_status").on(t.status),
  ]
);

export type Request = typeof requests.$inferSelect;
export type InsertRequest = typeof requests.$inferInsert;

export const requestResponses = mysqlTable(
  "request_responses",
  {
    id: int("id").autoincrement().primaryKey(),
    requestId: int("requestId").notNull(),
    respondedBy: int("respondedBy").notNull(), // FK to users.id
    response: text("response").notNull(),
    respondedAt: bigint("respondedAt", { mode: "number" }).notNull(),
  },
  t => [
    index("idx_requestResponses_requestId").on(t.requestId),
    index("idx_requestResponses_respondedBy").on(t.respondedBy),
  ]
);

export type RequestResponse = typeof requestResponses.$inferSelect;
export type InsertRequestResponse = typeof requestResponses.$inferInsert;

export const requestNotifications = mysqlTable(
  "request_notifications",
  {
    id: int("id").autoincrement().primaryKey(),
    requestId: int("requestId").notNull(),
    userId: int("userId").notNull(), // FK to users.id (recipient)
    isRead: boolean("isRead").default(false).notNull(),
    createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  },
  t => [
    index("idx_requestNotifications_requestId").on(t.requestId),
    index("idx_requestNotifications_userId").on(t.userId),
    index("idx_requestNotifications_isRead").on(t.isRead),
  ]
);

export type RequestNotification = typeof requestNotifications.$inferSelect;
export type InsertRequestNotification = typeof requestNotifications.$inferInsert;
/**
 * Credit notes (πιστωτικά) that are still open, i.e. not yet matched against an
 * invoice. They reduce the customer's outstanding balance but are NEVER matched
 * automatically — allocation is a manual decision, like wire transfers.
 */
export const creditNotes = mysqlTable(
  "credit_notes",
  {
    id: int("id").autoincrement().primaryKey(),
    customerId: int("customerId").notNull(),
    /** Document number as issued by the ERP, e.g. "CNV-000035" or "ΠΦΠ-Γ02453". */
    docNumber: varchar("docNumber", { length: 64 }).notNull(),
    /** Issue date of the credit note (unix ms, UTC). */
    docDate: bigint("docDate", { mode: "number" }).notNull(),
    /** Our issuing branch, same values as invoice branches. */
    branch: varchar("branch", { length: 128 }),
    currency: varchar("currency", { length: 8 }).default("EUR").notNull(),
    /** Original document value, stored positive. */
    amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
    /** Still unmatched (open) part of the credit note, stored positive. */
    openAmount: decimal("openAmount", { precision: 14, scale: 2 }).notNull(),
    /** openAmount converted to EUR with the FX rates in app settings. */
    openAmountEur: decimal("openAmountEur", { precision: 14, scale: 2 }),
    /** Optional vessel the credit note concerns; FK to vessels.id. */
    vesselId: int("vesselId"),
    /** Contract number as printed on the ERP document (free text). */
    contractNo: varchar("contractNo", { length: 64 }),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    index("idx_credit_notes_customerId").on(t.customerId),
    index("idx_credit_notes_docNumber").on(t.docNumber),
    index("idx_credit_notes_docDate").on(t.docDate),
    index("idx_credit_notes_branch").on(t.branch),
  ]
);
export type CreditNote = typeof creditNotes.$inferSelect;
export type InsertCreditNote = typeof creditNotes.$inferInsert;
/** Manual allocation of a credit note against an invoice (συμψηφισμός). */
export const creditNoteAllocations = mysqlTable(
  "credit_note_allocations",
  {
    id: int("id").autoincrement().primaryKey(),
    creditNoteId: int("creditNoteId").notNull(),
    invoiceId: int("invoiceId").notNull(),
    amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
    createdBy: int("createdBy"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [
    index("idx_cna_creditNoteId").on(t.creditNoteId),
    index("idx_cna_invoiceId").on(t.invoiceId),
  ]
);
export type CreditNoteAllocation = typeof creditNoteAllocations.$inferSelect;
export type InsertCreditNoteAllocation = typeof creditNoteAllocations.$inferInsert;
