import "dotenv/config";
import mysql, { type RowDataPacket } from "mysql2/promise";
import {
  openSoftOneSqlPool,
  queryCustomersInPages,
} from "../server/lib/softoneSql";

const REQUIRED_CONFIRMATION = "true";

type CustomerRow = RowDataPacket & {
  id: number;
  softoneId: string | null;
};

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

async function main() {
  if (
    process.env.SOFTONE_INVALID_CUSTOMER_CLEANUP_ENABLED !==
    REQUIRED_CONFIRMATION
  ) {
    throw new Error(
      "Cleanup disabled. Set SOFTONE_INVALID_CUSTOMER_CLEANUP_ENABLED=true for this one command.",
    );
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

  const softOne = await openSoftOneSqlPool();
  let validRows: Record<string, unknown>[];
  try {
    validRows = await queryCustomersInPages(softOne);
  } finally {
    await softOne.close();
  }
  const validIds = new Set(validRows.map(row => String(row.TRDR)));

  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    await connection.beginTransaction();
    const [allCustomers] = await connection.query<CustomerRow[]>(
      `SELECT id, softoneId FROM customers
       WHERE softoneId IS NOT NULL
       FOR UPDATE`,
    );
    const invalidCustomers = allCustomers.filter(
      customer => customer.softoneId && !validIds.has(customer.softoneId),
    );
    if (invalidCustomers.length === 0) {
      await connection.rollback();
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
       FOR UPDATE`,
      customerIds,
    );
    if (invoiceRows.some(invoice => !invoice.softoneId)) {
      throw new Error(
        "Cleanup stopped: an ineligible customer has a non-SoftOne invoice.",
      );
    }

    const invoiceIds = invoiceRows.map(invoice => invoice.id);
    const blockers = await countDependencies(connection, customerIds, invoiceIds);
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
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(
    error instanceof Error ? error.message : "Ineligible SoftOne cleanup failed.",
  );
  process.exitCode = 1;
});
