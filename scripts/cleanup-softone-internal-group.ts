import "dotenv/config";
import mysql, { type RowDataPacket } from "mysql2/promise";

const INTERNAL_GROUP_NAME = "PRIME PRODUCTS";
const REQUIRED_CONFIRMATION = "473";

type CustomerRow = RowDataPacket & {
  id: number;
  code: string;
  name: string;
  softoneId: string | null;
};

async function main() {
  if (
    process.env.SOFTONE_INTERNAL_GROUP_CLEANUP_ENABLED !==
    REQUIRED_CONFIRMATION
  ) {
    throw new Error(
      `Cleanup disabled. Set SOFTONE_INTERNAL_GROUP_CLEANUP_ENABLED=${REQUIRED_CONFIRMATION} for this one command.`,
    );
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    await connection.beginTransaction();

    const [customers] = await connection.query<CustomerRow[]>(
      `SELECT id, code, name, softoneId
       FROM customers
       WHERE customerGroup = ?
       FOR UPDATE`,
      [INTERNAL_GROUP_NAME],
    );
    if (customers.length === 0) {
      await connection.rollback();
      console.log("No PRIME PRODUCTS customer records found; nothing changed.");
      return;
    }
    if (customers.some(customer => !customer.softoneId)) {
      throw new Error(
        "Cleanup stopped: PRIME PRODUCTS contains a customer not imported from SoftOne.",
      );
    }

    const customerIds = customers.map(customer => customer.id);
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
        "Cleanup stopped: an internal customer has a non-SoftOne invoice.",
      );
    }

    const blockers: string[] = [];
    const customerTables = [
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
    ];
    for (const table of customerTables) {
      const [rows] = await connection.query<(RowDataPacket & { count: number })[]>(
        `SELECT COUNT(*) AS count FROM \`${table}\`
         WHERE customerId IN (${customerMarks})`,
        customerIds,
      );
      if (Number(rows[0]?.count ?? 0) > 0) {
        blockers.push(`${table}: ${rows[0].count}`);
      }
    }

    const invoiceIds = invoiceRows.map(invoice => invoice.id);
    if (invoiceIds.length > 0) {
      const invoiceMarks = invoiceIds.map(() => "?").join(", ");
      for (const [table, column] of [
        ["task_invoices", "invoiceId"],
        ["promises_to_pay", "invoiceId"],
        ["wire_transfer_allocations", "invoiceId"],
      ] as const) {
        const [rows] = await connection.query<
          (RowDataPacket & { count: number })[]
        >(
          `SELECT COUNT(*) AS count FROM \`${table}\`
           WHERE \`${column}\` IN (${invoiceMarks})`,
          invoiceIds,
        );
        if (Number(rows[0]?.count ?? 0) > 0) {
          blockers.push(`${table}: ${rows[0].count}`);
        }
      }
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
       WHERE id IN (${customerMarks}) AND customerGroup = ? AND softoneId IS NOT NULL`,
      [...customerIds, INTERNAL_GROUP_NAME],
    );
    await connection.commit();

    console.log(
      `Internal SoftOne group 473 cleanup completed: ${customerResult.affectedRows} customers and ${invoiceResult.affectedRows} invoices removed.`,
    );
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "Internal group cleanup failed.");
  process.exitCode = 1;
});
