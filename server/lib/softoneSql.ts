import type { config as SqlConfig, ConnectionPool } from "mssql";
import type { InsertCustomer } from "../../drizzle/schema";
import * as db from "../db";

const MAX_CUSTOMERS = 50_000;
const SOFTONE_NAME_BATCH_SIZE = 250;

// Keep financial values and text names in separate result sets. The production
// unixODBC driver can return HY010 when variable-length text is fetched
// alongside the fixed-width financial columns.
export const softOneCustomersQuery = `SELECT TOP (50000)
  CAST(source.[TRDR] AS bigint) AS [TRDR],
  CAST(source.[MASTERTRDR] AS bigint) AS [MASTERTRDR],
  CAST(customer.[TRDGROUP] AS bigint) AS [TRDGROUP],
  CAST(source.[LBAL] AS float) AS [LBAL],
  CAST(source.[LTURNOVR] AS float) AS [LTURNOVR],
  CAST(source.[LTURNOVRLY] AS float) AS [LTURNOVRLY],
  CAST(source.[LTURNOVRLYLY] AS float) AS [LTURNOVRLYLY],
  CAST(source.[Uncovered] AS float) AS [Uncovered],
  CAST(source.[Unpaid] AS float) AS [Unpaid],
  CAST(source.[Overdue] AS float) AS [Overdue],
  CAST(source.[OVERDUEMONTHVAL] AS float) AS [OVERDUEMONTHVAL],
  CAST(source.[DAYSAVG] AS float) AS [DAYSAVG],
  CAST(source.[OpenOrders] AS float) AS [OpenOrders],
  CAST(source.[OrdersAmount] AS float) AS [OrdersAmount],
  CAST(source.[Collections] AS float) AS [Collections]
FROM [dbo].[CustomerGroupFinData] AS source
INNER JOIN [dbo].[TRDR] AS customer
  ON customer.[TRDR] = source.[TRDR]
WHERE customer.[COMPANY] = 1
  AND customer.[SODTYPE] = 13
  AND customer.[ISACTIVE] = 1
  AND customer.[TRDGROUP] IS NOT NULL`;

export const softOneGroupNamesQuery = `SELECT
  CAST(master.[TRDR] AS bigint) AS [TRDR],
  CAST(master.[NAME] AS nchar(128)) AS [NAME]
FROM [dbo].[TRDR] AS master
INNER JOIN (
  SELECT CAST([TRDR] AS bigint) AS [REFERENCE]
  FROM [dbo].[CustomerGroupFinData]
  UNION
  SELECT DISTINCT CAST([MASTERTRDR] AS bigint)
  FROM [dbo].[CustomerGroupFinData]
) AS source ON source.[REFERENCE] = CAST(master.[TRDR] AS bigint)`;

export const softOneCustomerGroupNamesQuery = `SELECT
  CAST(customer_group.[TRDGROUP] AS bigint) AS [TRDGROUP],
  CAST(customer_group.[CODE] AS nchar(64)) AS [CODE],
  CAST(customer_group.[NAME] AS nchar(255)) AS [NAME]
FROM [dbo].[TRDGROUP] AS customer_group
INNER JOIN (
  SELECT DISTINCT customer.[TRDGROUP]
  FROM [dbo].[TRDR] AS customer
  WHERE customer.[COMPANY] = 1
    AND customer.[SODTYPE] = 13
    AND customer.[ISACTIVE] = 1
    AND customer.[TRDGROUP] IS NOT NULL
) AS active_groups
  ON active_groups.[TRDGROUP] = customer_group.[TRDGROUP]`;

type SourceRow = Record<string, unknown>;

function numericIdentifiers(values: string[]) {
  if (
    values.length === 0 ||
    values.length > SOFTONE_NAME_BATCH_SIZE ||
    values.some(value => !/^\d+$/.test(value))
  ) {
    throw new Error("Invalid SoftOne name lookup identifiers.");
  }
  return values.join(", ");
}

export function buildSoftOneCustomerNamesQuery(softoneIds: string[]) {
  return `SELECT
  CAST(customer.[TRDR] AS bigint) AS [TRDR],
  CAST(customer.[NAME] AS nchar(128)) AS [NAME]
FROM [dbo].[TRDR] AS customer
WHERE customer.[TRDR] IN (${numericIdentifiers(softoneIds)})`;
}

export function buildSoftOneCustomerGroupNamesQuery(groupIds: string[]) {
  return `SELECT
  CAST(customer_group.[TRDGROUP] AS bigint) AS [TRDGROUP],
  CAST(customer_group.[NAME] AS nchar(128)) AS [NAME]
FROM [dbo].[TRDGROUP] AS customer_group
WHERE customer_group.[TRDGROUP] IN (${numericIdentifiers(groupIds)})`;
}

async function queryNamesInBatches(
  pool: ConnectionPool,
  identifiers: string[],
  buildQuery: (batch: string[]) => string,
) {
  const rows: SourceRow[] = [];
  for (
    let index = 0;
    index < identifiers.length;
    index += SOFTONE_NAME_BATCH_SIZE
  ) {
    const result = await pool
      .request()
      .query<SourceRow>(
        buildQuery(identifiers.slice(index, index + SOFTONE_NAME_BATCH_SIZE)),
      );
    rows.push(...result.recordset);
  }
  return rows;
}

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

export function normalizeSoftOneCustomerRows(
  rows: SourceRow[],
  synchronizedAt = new Date(),
  externalGroupNames = new Map<string, string>(),
  customerGroupNames = new Map<string, string>(),
) {
  if (rows.length === 0) throw new Error("SoftOne returned no customer rows.");
  if (rows.length > MAX_CUSTOMERS) throw new Error("SoftOne customer row limit exceeded.");

  const identifiers = new Set<string>();
  const nameBySoftOneId = new Map<string, string>();
  for (const row of rows) {
    const softoneId = readIdentity(row, "TRDR");
    if (identifiers.has(softoneId)) throw new Error("SoftOne returned duplicate TRDR.");
    identifiers.add(softoneId);
    nameBySoftOneId.set(softoneId, readIdentity(row, "NAME"));
  }

  return rows.map(row => {
    const softoneId = readIdentity(row, "TRDR");
    const name = nameBySoftOneId.get(softoneId)!;
    const masterSoftoneId =
      row.MASTERTRDR == null ? null : String(row.MASTERTRDR).trim() || null;
    const groupSoftoneId =
      row.TRDGROUP == null ? null : String(row.TRDGROUP).trim() || null;
    const customerGroup =
      (groupSoftoneId ? customerGroupNames.get(groupSoftoneId) : undefined) ??
      (groupSoftoneId ? nameBySoftOneId.get(groupSoftoneId) : undefined) ??
      (masterSoftoneId ? externalGroupNames.get(masterSoftoneId) : undefined) ??
      (masterSoftoneId ? nameBySoftOneId.get(masterSoftoneId) : undefined) ??
      name;
    return {
      code: softoneId,
      name,
      customerGroup,
      masterSoftoneId,
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

export async function openSoftOneSqlPool() {
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
  const pool = await openSoftOneSqlPool();
  await pool.close();
  return { connected: true as const };
}

export async function inspectSoftOneGroupResolution() {
  if (!isSoftOneSqlConfigured()) throw new Error("SoftOne SQL is not configured.");
  const pool = await openSoftOneSqlPool();
  try {
    const result = await pool.request().query<{
      totalRows: number;
      masterMatches: number;
      groupMatches: number;
      unresolvedRows: number;
    }>(`SELECT
  COUNT(*) AS [totalRows],
  SUM(CASE WHEN master.[TRDR] IS NOT NULL THEN 1 ELSE 0 END) AS [masterMatches],
  SUM(CASE WHEN customerGroup.[TRDR] IS NOT NULL THEN 1 ELSE 0 END) AS [groupMatches],
  SUM(CASE
    WHEN master.[TRDR] IS NULL AND customerGroup.[TRDR] IS NULL THEN 1
    ELSE 0
  END) AS [unresolvedRows]
FROM [dbo].[CustomerGroupFinData] AS source
LEFT JOIN [dbo].[TRDR] AS master ON master.[TRDR] = source.[MASTERTRDR]
LEFT JOIN [dbo].[TRDR] AS customerGroup ON customerGroup.[TRDR] = source.[TRDGROUP]`);
    const row = result.recordset[0];
    if (!row) throw new Error("SoftOne group diagnostic returned no result.");
    return {
      totalRows: Number(row.totalRows),
      masterMatches: Number(row.masterMatches),
      groupMatches: Number(row.groupMatches),
      unresolvedRows: Number(row.unresolvedRows),
    };
  } finally {
    await pool.close().catch(() => undefined);
  }
}

export async function syncSoftOneCustomers() {
  if (process.env.SOFTONE_SQL_SYNC_ENABLED !== "true") {
    throw new Error("SoftOne SQL customer synchronization is disabled.");
  }
  if (!isSoftOneSqlConfigured()) throw new Error("SoftOne SQL is not configured.");

  let pool: ConnectionPool | null = null;
  let stage = "connect";
  try {
    pool = await openSoftOneSqlPool();
    stage = "query CustomerGroupFinData financials";
    const result = await pool.request().query<SourceRow>(softOneCustomersQuery);
    const customerAndMasterIds = Array.from(
      new Set(
        result.recordset.flatMap(row =>
          [row.TRDR, row.MASTERTRDR]
            .filter(value => value != null && String(value).trim())
            .map(value => String(value).trim()),
        ),
      ),
    );
    const customerGroupIds = Array.from(
      new Set(
        result.recordset
          .map(row => row.TRDGROUP)
          .filter(value => value != null && String(value).trim())
          .map(value => String(value).trim()),
      ),
    );
    stage = "query customer and master names";
    const customerNameRows = await queryNamesInBatches(
      pool,
      customerAndMasterIds,
      buildSoftOneCustomerNamesQuery,
    );
    stage = "query active customer group names";
    const customerGroupRows = await queryNamesInBatches(
      pool,
      customerGroupIds,
      buildSoftOneCustomerGroupNamesQuery,
    );
    const allNames = new Map(
      customerNameRows.map(row => [
        readIdentity(row, "TRDR"),
        readIdentity(row, "NAME"),
      ]),
    );
    const rowsWithNames = result.recordset.map(row => ({
      ...row,
      NAME: allNames.get(readIdentity(row, "TRDR")),
    }));
    const customerGroupNames = new Map(
      customerGroupRows.map(row => [
        readIdentity(row, "TRDGROUP"),
        readIdentity(row, "NAME"),
      ]),
    );
    stage = "normalize customer groups";
    const records = normalizeSoftOneCustomerRows(
      rowsWithNames,
      new Date(),
      allNames,
      customerGroupNames,
    );
    stage = "upsert MariaDB customers";
    await db.upsertSoftOneCustomers(records);
    stage = "write MariaDB sync log";
    await db.addSyncLog({
      direction: "Pull",
      entityType: "customers",
      recordCount: records.length,
      status: "Success",
      message: `Read-only SQL sync completed for ${records.length} customers`,
    });
    return { synced: records.length };
  } catch (error) {
    throw new Error(softOneSqlError(error, stage));
  } finally {
    if (pool) {
      await Promise.race([
        pool.close().catch(() => undefined),
        new Promise<void>(resolve => setTimeout(resolve, 5_000)),
      ]);
    }
  }
}

export function softOneSqlError(error: unknown, stage = "unknown stage") {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  if (code.includes("TIME")) return "SoftOne SQL connection or query timed out.";
  if (code.includes("LOGIN") || code.includes("EAUTH")) return "SoftOne SQL authentication failed.";
  if (error instanceof Error && error.message.startsWith("SoftOne ")) return error.message;
  const rawMessage = error instanceof Error ? error.message : String(error);
  const secretNames = [
    "SOFTONE_SQL_SERVER",
    "SOFTONE_SQL_DATABASE",
    "SOFTONE_SQL_USER",
    "SOFTONE_SQL_PASSWORD",
  ];
  const safeMessage = secretNames.reduce((message, name) => {
    const value = process.env[name];
    return value ? message.replaceAll(value, "[redacted]") : message;
  }, rawMessage).slice(0, 500);
  return `SoftOne SQL synchronization failed during ${stage}${code ? ` (${code})` : ""}: ${safeMessage}`;
}
