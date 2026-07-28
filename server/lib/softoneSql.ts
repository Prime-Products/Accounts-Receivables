import type { config as SqlConfig, ConnectionPool } from "mssql";
import type { InsertCustomer } from "../../drizzle/schema";
import * as db from "../db";

const MAX_CUSTOMERS = 50_000;

// Keep the variable-length NAME column last. unixODBC can return HY010 when
// variable-length data is interleaved with fixed-width financial columns.
export const softOneCustomersQuery = `SELECT TOP (50000)
  [TRDR],
  [MASTERTRDR],
  [TRDGROUP],
  [LBAL],
  [LTURNOVR],
  [LTURNOVRLY],
  [LTURNOVRLYLY],
  [Uncovered],
  [Unpaid],
  [Overdue],
  [OVERDUEMONTHVAL],
  [DAYSAVG],
  [OpenOrders],
  [OrdersAmount],
  [Collections],
  CAST([NAME] AS nvarchar(64)) AS [NAME]
FROM [dbo].[CustomerGroupFinData]`;

type SourceRow = Record<string, unknown>;

export function isSoftOneSqlConfigured() {
  return [
    "SOFTONE_SQL_SERVER",
    "SOFTONE_SQL_DATABASE",
    "SOFTONE_SQL_USER",
    "SOFTONE_SQL_PASSWORD",
  ].every(name => Boolean(process.env[name]?.trim()));
}

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function readNumber(row: SourceRow, field: string) {
  const value = row[field];
  if (value === null || value === undefined || value === "") return 0;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`SoftOne row has invalid ${field}.`);
  return Math.round(number * 10_000) / 10_000;
}

function readIdentity(row: SourceRow, field: string) {
  const value = String(row[field] ?? "").trim();
  if (!value) throw new Error(`SoftOne row is missing ${field}.`);
  return value;
}

export function normalizeSoftOneCustomerRows(rows: SourceRow[], synchronizedAt = new Date()) {
  if (rows.length === 0) throw new Error("SoftOne returned no customer rows.");
  if (rows.length > MAX_CUSTOMERS) throw new Error("SoftOne customer row limit exceeded.");

  const identifiers = new Set<string>();
  return rows.map(row => {
    const softoneId = readIdentity(row, "TRDR");
    if (identifiers.has(softoneId)) throw new Error("SoftOne returned duplicate TRDR.");
    identifiers.add(softoneId);

    const name = readIdentity(row, "NAME");
    return {
      code: softoneId,
      name,
      customerGroup: row.TRDGROUP == null ? null : String(row.TRDGROUP).trim() || null,
      masterSoftoneId: row.MASTERTRDR == null ? null : String(row.MASTERTRDR).trim() || null,
      turnoverYtd: readNumber(row, "LTURNOVR").toFixed(2),
      turnoverLastYear: readNumber(row, "LTURNOVRLY").toFixed(2),
      turnoverTwoYearsAgo: readNumber(row, "LTURNOVRLYLY").toFixed(4),
      balance: readNumber(row, "LBAL").toFixed(4),
      uncovered: readNumber(row, "Uncovered").toFixed(4),
      unpaid: readNumber(row, "Unpaid").toFixed(4),
      overdue: readNumber(row, "Overdue").toFixed(4),
      overdueEndOfMonth: readNumber(row, "OVERDUEMONTHVAL").toFixed(4),
      averageOverdueDays: readNumber(row, "DAYSAVG").toFixed(4),
      openOrders: readNumber(row, "OpenOrders").toFixed(4),
      ordersAmount: readNumber(row, "OrdersAmount").toFixed(4),
      collections: readNumber(row, "Collections").toFixed(4),
      softoneId,
      softoneSyncedAt: synchronizedAt,
    } satisfies InsertCustomer;
  });
}

async function connectSoftOneSqlPool() {
  const { default: sql } = await import("mssql/msnodesqlv8.js");
  const port = Number(process.env.SOFTONE_SQL_PORT ?? "1433");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("SOFTONE_SQL_PORT is invalid.");
  }

  const config: SqlConfig = {
    server: requiredEnvironment("SOFTONE_SQL_SERVER"),
    database: requiredEnvironment("SOFTONE_SQL_DATABASE"),
    user: requiredEnvironment("SOFTONE_SQL_USER"),
    password: requiredEnvironment("SOFTONE_SQL_PASSWORD"),
    port,
    driver: "ODBC Driver 18 for SQL Server",
    connectionTimeout: 30_000,
    requestTimeout: 120_000,
    options: {
      trustedConnection: false,
      encrypt: process.env.SOFTONE_SQL_ENCRYPT !== "false",
      trustServerCertificate:
        process.env.SOFTONE_SQL_TRUST_SERVER_CERTIFICATE === "true",
    },
    pool: { min: 0, max: 1, idleTimeoutMillis: 30_000 },
  };

  return new sql.ConnectionPool(config).connect() as Promise<ConnectionPool>;
}

export async function testSoftOneSqlConnection() {
  if (!isSoftOneSqlConfigured()) throw new Error("SoftOne SQL is not configured.");
  const pool = await connectSoftOneSqlPool();
  await pool.close();
  return { connected: true as const };
}

export async function syncSoftOneCustomers() {
  if (process.env.SOFTONE_SQL_SYNC_ENABLED !== "true") {
    throw new Error("SoftOne SQL customer synchronization is disabled.");
  }
  if (!isSoftOneSqlConfigured()) throw new Error("SoftOne SQL is not configured.");

  let pool: ConnectionPool | null = null;
  try {
    pool = await connectSoftOneSqlPool();
    const result = await pool.request().query<SourceRow>(softOneCustomersQuery);
    const records = normalizeSoftOneCustomerRows(result.recordset);
    const existingSoftOneCount = (await db.listCustomers()).filter(customer => customer.softoneId).length;
    if (existingSoftOneCount > 0 && records.length < existingSoftOneCount / 2) {
      throw new Error("SoftOne customer dataset is unexpectedly incomplete.");
    }

    await db.upsertSoftOneCustomers(records);
    await db.addSyncLog({
      direction: "Pull",
      entityType: "customers",
      recordCount: records.length,
      status: "Success",
      message: `Read-only SQL sync completed for ${records.length} customers`,
    });
    return { synced: records.length };
  } catch (error) {
    throw new Error(classifySoftOneSqlError(error));
  } finally {
    await pool?.close().catch(() => undefined);
  }
}

function classifySoftOneSqlError(error: unknown) {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  if (code.includes("TIME")) return "SoftOne SQL connection or query timed out.";
  if (code.includes("LOGIN") || code.includes("EAUTH")) return "SoftOne SQL authentication failed.";
  if (error instanceof Error && error.message.startsWith("SoftOne ")) return error.message;
  return "SoftOne SQL synchronization failed.";
}
