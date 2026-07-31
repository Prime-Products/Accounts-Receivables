import "dotenv/config";
import mysql, { type RowDataPacket } from "mysql2/promise";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [migrationRows] = await connection.query<RowDataPacket[]>(
      `SELECT id, hash, created_at AS createdAt
       FROM __drizzle_migrations
       ORDER BY id DESC
       LIMIT 10`,
    );
    const [tableRows] = await connection.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS count
       FROM information_schema.tables
       WHERE table_schema = DATABASE()
         AND table_name = 'group_collection_profile'`,
    );
    const [indexRows] = await connection.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS count
       FROM information_schema.statistics
       WHERE table_schema = DATABASE()
         AND table_name = 'invoices'
         AND index_name = 'invoices_invoiceNumber_unique'`,
    );

    console.log("Latest Drizzle migrations:");
    for (const row of migrationRows) console.log(JSON.stringify(row));
    console.log(
      `group_collection_profile exists: ${Number(tableRows[0]?.count ?? 0) > 0}`,
    );
    console.log(
      `invoices_invoiceNumber_unique exists: ${Number(indexRows[0]?.count ?? 0) > 0}`,
    );
    console.log("Read-only migration inspection completed.");
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(
    error instanceof Error ? error.message : "Migration inspection failed.",
  );
  process.exitCode = 1;
});
