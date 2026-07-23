import { bigint, decimal, double, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

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
  tier: mysqlEnum("tier", customerTiers).default("New").notNull(),
  creditLimit: decimal("creditLimit", { precision: 14, scale: 2 }).default("0").notNull(),
  paymentTermsDays: int("paymentTermsDays").default(30).notNull(),
  onHoldStatus: mysqlEnum("onHoldStatus", ["Active", "Under Review", "Eligible for On Hold", "On Hold", "Legal"]).default("Active").notNull(),
  softoneId: varchar("softoneId", { length: 64 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const invoiceStatuses = ["Open", "Partially Paid", "Paid", "Overdue", "Disputed"] as const;

export const invoices = mysqlTable("invoices", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  invoiceNumber: varchar("invoiceNumber", { length: 64 }).notNull().unique(),
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
  softoneId: varchar("softoneId", { length: 64 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

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
  completedAt: bigint("completedAt", { mode: "number" }),
  completionNotes: text("completionNotes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

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

export const promisesToPay = mysqlTable("promises_to_pay", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  invoiceId: int("invoiceId"),
  promisedDate: bigint("promisedDate", { mode: "number" }).notNull(),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  status: mysqlEnum("status", promiseStatuses).default("Pending").notNull(),
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

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

export type UserProfile = typeof userProfiles.$inferSelect;
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
