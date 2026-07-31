import "dotenv/config";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { queryEligibleSoftOneCustomerMembership } from "../server/lib/softoneSql";
import {
  cleanupPreviewLimit,
  findIneligibleSoftOneCustomers,
  selectCleanupPreviewRows,
  type SoftOneCleanupCustomer,
} from "../server/lib/softoneCustomerCleanup";
import { withSoftOneSyncLock } from "../server/lib/softoneSyncLock";

const REQUIRED_CONFIRMATION = "true";

type CustomerRow = RowDataPacket & SoftOneCleanupCustomer;

async function countDependencies(
  connection: mysql.Connection,
  customerIds: number[],
  invoiceIds: number[],
) {
  const blockers: string[] = [];
  const customerMarks = customerIds.map(() => "?").join(", ");
  for (const table of [
    "payment_behavior",
    "receipts",
    "contracts",
    "tasks",
    "on_hold_proposals",
    "forecast_entries",
    "promises_to_pay",
    "email_history",
    "activity_log",
    "payment_contacts",
    "payment_bank_details",
    "wire_transfers",
    "vessels",
    "requests",
  ]) {
    const [rows] = await connection.query<(RowDataPacket & { count: number })[]>(
      `SELECT COUNT(*) AS count FROM \`${table}\`
       WHERE customerId IN (${customerMarks})`,
      customerIds,
    );
    if (Number(rows[0]?.count ?? 0) > 0) blockers.push(`${table}: ${rows[0].count}`);
  }

  if (invoiceIds.length > 0) {
    const invoiceMarks = invoiceIds.map(() => "?").join(", ");
    for (const [table, column] of [
      ["task_invoices", "invoiceId"],
      ["promises_to_pay", "invoiceId"],
      ["wire_transfer_allocations", "invoiceId"],
    ] as const) {
      const [rows] = await connection.query<(RowDataPacket & { count: number })[]>(
        `SELECT COUNT(*) AS count FROM \`${table}\`
         WHERE \`${column}\` IN (${invoiceMarks})`,
        invoiceIds,
      );
      if (Number(rows[0]?.count ?? 0) > 0) blockers.push(`${table}: ${rows[0].count}`);
    }
  }
  return blockers;
}

async function runCleanup(apply: boolean) {
  if (
    apply &&
    process.env.SOFTONE_INVALID_CUSTOMER_CLEANUP_ENABLED !==
    REQUIRED_CONFIRMATION
  ) {
    throw new Error(
      "Cleanup disabled. Set SOFTONE_INVALID_CUSTOMER_CLEANUP_ENABLED=true for this one command.",
    );
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

  const validRows = await queryEligibleSoftOneCustomerMembership();
  const validIds = new Set(validRows.map(row => String(row.TRDR)));

  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    if (apply) await connection.beginTransaction();
    const [allCustomers] = await connection.query<CustomerRow[]>(
      `SELECT id, code, name, customerGroup, softoneId
       FROM customers
       WHERE softoneId IS NOT NULL
       ${apply ? "FOR UPDATE" : ""}`,
    );
    const invalidCustomers = findIneligibleSoftOneCustomers(
      allCustomers,
      validIds,
    );
    if (invalidCustomers.length === 0) {
      if (apply) await connection.rollback();
      console.log("No ineligible SoftOne customer records found; nothing changed.");
      return;
    }

    const customerIds = invalidCustomers.map(customer => customer.id);
    const customerMarks = customerIds.map(() => "?").join(", ");
    const [invoiceRows] = await connection.query<
      (RowDataPacket & { id: number; softoneId: string | null })[]
    >(
      `SELECT id, softoneId FROM invoices
       WHERE customerId IN (${customerMarks})
       ${apply ? "FOR UPDATE" : ""}`,
      customerIds,
    );
    const invoiceIds = invoiceRows.map(invoice => invoice.id);
    const blockers = await countDependencies(connection, customerIds, invoiceIds);
    const hasNonSoftOneInvoices = invoiceRows.some(invoice => !invoice.softoneId);

    if (!apply) {
      const search = process.env.SOFTONE_INVALID_CUSTOMER_PREVIEW_SEARCH;
      const limit = cleanupPreviewLimit(
        process.env.SOFTONE_INVALID_CUSTOMER_PREVIEW_LIMIT,
      );
      const previewRows = selectCleanupPreviewRows(
        invalidCustomers,
        search,
        limit,
      );
      console.log(
        `Ineligible SoftOne cleanup preview: ${invalidCustomers.length} customer(s), ` +
          `${invoiceRows.length} invoice(s), ${previewRows.length} displayed.`,
      );
      for (const customer of previewRows) {
        console.log(
          JSON.stringify({
            id: customer.id,
            softoneId: customer.softoneId,
            code: customer.code,
            name: customer.name,
            customerGroup: customer.customerGroup,
          }),
        );
      }
      if (search && previewRows.length === 0) {
        console.log(`No preview rows matched search ${JSON.stringify(search)}.`);
      }
      if (hasNonSoftOneInvoices) {
        console.log(
          "Cleanup blocked: at least one ineligible customer has a non-SoftOne invoice.",
        );
      }
      if (blockers.length > 0) {
        console.log(
          `Cleanup blocked by operational dependencies (${blockers.join(", ")}).`,
        );
      }
      if (!hasNonSoftOneInvoices && blockers.length === 0) {
        console.log(
          "Cleanup is eligible to apply after this preview is reviewed.",
        );
      }
      console.log("Preview completed; no data was changed.");
      return;
    }

    if (hasNonSoftOneInvoices) {
      throw new Error(
        "Cleanup stopped: an ineligible customer has a non-SoftOne invoice.",
      );
    }
    if (blockers.length > 0) {
      throw new Error(
        `Cleanup stopped; operational dependencies found (${blockers.join(", ")}). No data was changed.`,
      );
    }

    const [invoiceResult] = await connection.execute<mysql.ResultSetHeader>(
      `DELETE FROM invoices WHERE customerId IN (${customerMarks})`,
      customerIds,
    );
    const [customerResult] = await connection.execute<mysql.ResultSetHeader>(
      `DELETE FROM customers
       WHERE id IN (${customerMarks}) AND softoneId IS NOT NULL`,
      customerIds,
    );
    await connection.commit();
    console.log(
      `Ineligible SoftOne cleanup completed: ${customerResult.affectedRows} customers and ${invoiceResult.affectedRows} invoices removed.`,
    );
  } catch (error) {
    if (apply) await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const unknownArguments = process.argv
    .slice(2)
    .filter(argument => argument !== "--apply");
  if (unknownArguments.length > 0) {
    throw new Error(`Unknown cleanup argument: ${unknownArguments.join(", ")}`);
  }
  const execution = await withSoftOneSyncLock(() => runCleanup(apply));
  if (!execution.acquired) {
    throw new Error(
      "SoftOne synchronization is already running; cleanup did not start.",
    );
  }
}

main().catch(error => {
  console.error(
    error instanceof Error ? error.message : "Ineligible SoftOne cleanup failed.",
  );
  process.exitCode = 1;
});
