import type { ConnectionPool } from "mssql";
import type { SoftOneInvoiceUpsert } from "../db";
import * as db from "../db";
import { toEur } from "./arLogic";
import {
  isSoftOneSqlConfigured,
  openSoftOneSqlPool,
  softOneSqlError,
} from "./softoneSql";

const MAX_OPEN_INVOICES = 50_000;
type SourceRow = Record<string, unknown>;

export const softOneOpenInvoiceFinancialsQuery = `SELECT TOP (50000)
  CAST(FP.[FINDOC] AS bigint) AS [FINDOC],
  CAST(FP.[TRDR] AS bigint) AS [TRDR],
  CAST(FIN.[COMPANY] AS int) AS [COMPANY],
  CAST(FP.[SOCURRENCY] AS int) AS [SOCURRENCY],
  CAST(CONVERT(char(8), FP.[TRNDATE], 112) AS int) AS [ISSUE_DATE],
  CAST(CONVERT(char(8), MAX(FP.[FINALDATE]), 112) AS int) AS [DUE_DATE],
  SUM(CAST(FP.[TAMNT] AS float) * CAST(FP.[PAYDEMANDMD] AS float)) AS [ORIGINAL_AMOUNT],
  SUM(CAST(FP.[OPNTAMNT] AS float) * CAST(FP.[PAYDEMANDMD] AS float)) AS [OPEN_AMOUNT]
FROM [dbo].[FINPAYTERMS] AS FP
INNER JOIN [dbo].[FINDOC] AS FIN
  ON FIN.[COMPANY] = FP.[COMPANY] AND FIN.[FINDOC] = FP.[FINDOC]
WHERE FP.[ISCLOSE] = 0
  AND FP.[ISCANCEL] = 0
  AND FP.[APPRV] = 1
  AND FP.[PAYDEMANDMD] IN (-1, 1)
  AND FIN.[SOSOURCE] = 1351
  AND FIN.[SOREDIR] = 0
GROUP BY
  FP.[FINDOC], FP.[TRDR], FIN.[COMPANY], FP.[SOCURRENCY], FP.[TRNDATE]
HAVING SUM(CAST(FP.[OPNTAMNT] AS float) * CAST(FP.[PAYDEMANDMD] AS float)) > 0.005`;

export const softOneOpenInvoiceAmountSummaryQuery = `WITH source AS (
  SELECT
    CAST(SUM(FP.[TAMNT] * FP.[PAYDEMANDMD]) AS float) AS [ORIGINAL_AMOUNT],
    CAST(SUM((FP.[TAMNT] - FP.[OPNTAMNT]) * FP.[PAYDEMANDMD]) AS float) AS [OPEN_AMOUNT],
    CAST(SUM(FP.[OPNTAMNT] * FP.[PAYDEMANDMD]) AS float) AS [REMAINING_AMOUNT]
  FROM [dbo].[FINPAYTERMS] AS FP
  INNER JOIN [dbo].[FINDOC] AS FIN
    ON FIN.[COMPANY] = FP.[COMPANY] AND FIN.[FINDOC] = FP.[FINDOC]
  WHERE FP.[ISCLOSE] = 0
    AND FP.[ISCANCEL] = 0
    AND FP.[APPRV] = 1
    AND FP.[PAYDEMANDMD] IN (-1, 1)
  GROUP BY
    FP.[FINDOC], FP.[TRDR], FIN.[COMPANY], FP.[SOCURRENCY], FP.[TRNDATE]
)
SELECT
  CAST(COUNT(*) AS bigint) AS [GROUPED_ROWS],
  CAST(SUM(CASE WHEN [OPEN_AMOUNT] > 0.005 THEN 1 ELSE 0 END) AS bigint) AS [POSITIVE_OPEN],
  CAST(SUM(CASE WHEN ABS([OPEN_AMOUNT]) <= 0.005 THEN 1 ELSE 0 END) AS bigint) AS [ZERO_OPEN],
  CAST(SUM(CASE WHEN [OPEN_AMOUNT] < -0.005 THEN 1 ELSE 0 END) AS bigint) AS [NEGATIVE_OPEN],
  CAST(SUM(CASE WHEN [ORIGINAL_AMOUNT] > 0.005 THEN 1 ELSE 0 END) AS bigint) AS [POSITIVE_ORIGINAL],
  CAST(SUM(CASE WHEN [REMAINING_AMOUNT] > 0.005 THEN 1 ELSE 0 END) AS bigint) AS [POSITIVE_REMAINING],
  CAST(SUM(CASE WHEN ABS([REMAINING_AMOUNT]) <= 0.005 THEN 1 ELSE 0 END) AS bigint) AS [ZERO_REMAINING],
  CAST(SUM(CASE WHEN [REMAINING_AMOUNT] < -0.005 THEN 1 ELSE 0 END) AS bigint) AS [NEGATIVE_REMAINING],
  CAST(SUM(CASE
    WHEN [ORIGINAL_AMOUNT] > 0.005 AND [OPEN_AMOUNT] <= 0.005 THEN 1
    ELSE 0
  END) AS bigint) AS [POSITIVE_ORIGINAL_WITHOUT_POSITIVE_OPEN]
FROM source`;

export const softOneOpenInvoiceTypeBreakdownQuery = `WITH documents AS (
  SELECT
    CAST(FIN.[SOSOURCE] AS int) AS [SOSOURCE],
    CAST(FIN.[SOREDIR] AS int) AS [SOREDIR],
    CAST(SUM(FP.[OPNTAMNT] * FP.[PAYDEMANDMD]) AS float) AS [REMAINING_AMOUNT]
  FROM [dbo].[FINPAYTERMS] AS FP
  INNER JOIN [dbo].[FINDOC] AS FIN
    ON FIN.[COMPANY] = FP.[COMPANY] AND FIN.[FINDOC] = FP.[FINDOC]
  WHERE FP.[ISCLOSE] = 0
    AND FP.[ISCANCEL] = 0
    AND FP.[APPRV] = 1
    AND FP.[PAYDEMANDMD] IN (-1, 1)
  GROUP BY FIN.[FINDOC], FIN.[SOSOURCE], FIN.[SOREDIR]
)
SELECT
  [SOSOURCE],
  [SOREDIR],
  CAST(COUNT(*) AS bigint) AS [TOTAL_ROWS],
  CAST(SUM(CASE WHEN [REMAINING_AMOUNT] > 0.005 THEN 1 ELSE 0 END) AS bigint) AS [POSITIVE_REMAINING],
  CAST(SUM(CASE WHEN ABS([REMAINING_AMOUNT]) <= 0.005 THEN 1 ELSE 0 END) AS bigint) AS [ZERO_REMAINING],
  CAST(SUM(CASE WHEN [REMAINING_AMOUNT] < -0.005 THEN 1 ELSE 0 END) AS bigint) AS [NEGATIVE_REMAINING]
FROM documents
GROUP BY [SOSOURCE], [SOREDIR]
ORDER BY [SOSOURCE], [SOREDIR]`;

export const softOneOpenInvoiceDocumentsQuery = `SELECT
  CAST(FIN.[FINDOC] AS bigint) AS [FINDOC],
  CAST(FIN.[FINCODE] AS nchar(64)) AS [FINCODE]
FROM [dbo].[FINDOC] AS FIN
WHERE EXISTS (
  SELECT 1
  FROM [dbo].[FINPAYTERMS] AS FP
  WHERE FP.[COMPANY] = FIN.[COMPANY]
    AND FP.[FINDOC] = FIN.[FINDOC]
    AND FP.[ISCLOSE] = 0
    AND FP.[ISCANCEL] = 0
    AND FP.[APPRV] = 1
    AND FP.[PAYDEMANDMD] IN (-1, 1)
    AND FIN.[SOSOURCE] = 1351
    AND FIN.[SOREDIR] = 0
)`;

export const softOneCompaniesQuery = `SELECT
  CAST([COMPANY] AS int) AS [COMPANY],
  CAST([NAME] AS nchar(128)) AS [NAME]
FROM [dbo].[COMPANY]`;

export const softOneCurrenciesQuery = `SELECT
  CAST([SOCURRENCY] AS int) AS [SOCURRENCY],
  CAST([NAME] AS nchar(64)) AS [NAME]
FROM [dbo].[SOCURRENCY]`;

function identity(row: SourceRow, field: string) {
  const value = String(row[field] ?? "").trim();
  if (!value) throw new Error(`SoftOne invoice row is missing ${field}.`);
  return value;
}

function numberValue(row: SourceRow, field: string) {
  const value = Number(row[field]);
  if (!Number.isFinite(value)) {
    throw new Error(`SoftOne invoice row has invalid ${field}.`);
  }
  return value;
}

function dateKeyToUtc(value: unknown, field: string) {
  const text = String(value ?? "").trim();
  if (!/^\d{8}$/.test(text)) {
    throw new Error(`SoftOne invoice row has invalid ${field}.`);
  }
  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(4, 6));
  const day = Number(text.slice(6, 8));
  const timestamp = Date.UTC(year, month - 1, day, 12);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`SoftOne invoice row has invalid ${field}.`);
  }
  return timestamp;
}

export function normalizeSoftOneCurrencyName(value: string) {
  const normalized = value.trim().toUpperCase();
  const aliases: Record<string, string> = {
    EURO: "EUR",
    EUROS: "EUR",
    DIRHAM: "AED",
    "UAE DIRHAM": "AED",
    "SINGAPORE DOLLAR": "SGD",
    "US DOLLAR": "USD",
  };
  return aliases[normalized] ?? normalized;
}

export function normalizeSoftOneOpenInvoiceRows(
  rows: SourceRow[],
  documents: Map<string, string>,
  companies: Map<string, string>,
  currencies: Map<string, string>,
  now = Date.now(),
) {
  if (rows.length === 0) throw new Error("SoftOne returned no open invoices.");
  if (rows.length > MAX_OPEN_INVOICES) {
    throw new Error("SoftOne open invoice row limit exceeded.");
  }
  const identifiers = new Set<string>();
  return rows.map(row => {
    const softoneId = identity(row, "FINDOC");
    if (identifiers.has(softoneId)) {
      throw new Error("SoftOne returned duplicate FINDOC.");
    }
    identifiers.add(softoneId);
    const customerSoftoneId = identity(row, "TRDR");
    const invoiceNumber = documents.get(softoneId);
    const company = companies.get(identity(row, "COMPANY"));
    const currencyName = currencies.get(identity(row, "SOCURRENCY"));
    if (!invoiceNumber) throw new Error(`SoftOne FINDOC ${softoneId} has no document number.`);
    if (!company) throw new Error(`SoftOne FINDOC ${softoneId} has no company mapping.`);
    if (!currencyName) throw new Error(`SoftOne FINDOC ${softoneId} has no currency mapping.`);

    const issueDate = dateKeyToUtc(row.ISSUE_DATE, "ISSUE_DATE");
    const dueDate = dateKeyToUtc(row.DUE_DATE, "DUE_DATE");
    const originalAmount = Math.round(numberValue(row, "ORIGINAL_AMOUNT") * 100) / 100;
    const openAmount = Math.round(numberValue(row, "OPEN_AMOUNT") * 100) / 100;
    if (openAmount <= 0) {
      throw new Error(`SoftOne FINDOC ${softoneId} has invalid open amount.`);
    }
    // FINPAYTERMS can expose an open balance greater than its aggregated TAMNT
    // after adjustments or currency/accounting movements. The open balance is
    // authoritative for this read-only AR sync, so never reduce it to fit TAMNT.
    const amount = Math.max(originalAmount, openAmount);
    const paidAmount = Math.max(0, amount - openAmount);
    const currency = normalizeSoftOneCurrencyName(currencyName);
    return {
      customerSoftoneId,
      invoiceNumber,
      company,
      currency,
      amountEur: toEur(amount, currency).toFixed(2),
      issueDate,
      dueDate,
      amount: amount.toFixed(2),
      paidAmount: paidAmount.toFixed(2),
      status: dueDate < now ? "Overdue" : paidAmount > 0.005 ? "Partially Paid" : "Open",
      softoneId,
    } satisfies SoftOneInvoiceUpsert;
  });
}

async function queryMaps(pool: ConnectionPool) {
  const documentResult = await pool
    .request()
    .query<SourceRow>(softOneOpenInvoiceDocumentsQuery);
  const companyResult = await pool.request().query<SourceRow>(softOneCompaniesQuery);
  const currencyResult = await pool.request().query<SourceRow>(softOneCurrenciesQuery);
  return {
    documents: new Map(
      documentResult.recordset.map(row => [
        identity(row, "FINDOC"),
        identity(row, "FINCODE"),
      ]),
    ),
    companies: new Map(
      companyResult.recordset.map(row => [
        identity(row, "COMPANY"),
        identity(row, "NAME"),
      ]),
    ),
    currencies: new Map(
      currencyResult.recordset.map(row => [
        identity(row, "SOCURRENCY"),
        identity(row, "NAME"),
      ]),
    ),
  };
}

async function querySoftOneOpenInvoiceSource(pool: ConnectionPool) {
  const result = await pool
    .request()
    .query<SourceRow>(softOneOpenInvoiceFinancialsQuery);
  return result.recordset;
}

async function loadSoftOneOpenInvoices(pool: ConnectionPool) {
  const rows = await querySoftOneOpenInvoiceSource(pool);
  const maps = await queryMaps(pool);
  return normalizeSoftOneOpenInvoiceRows(
    rows,
    maps.documents,
    maps.companies,
    maps.currencies,
  );
}

export async function inspectSoftOneOpenInvoices() {
  if (!isSoftOneSqlConfigured()) throw new Error("SoftOne SQL is not configured.");
  let pool: ConnectionPool | null = null;
  let stage = "connect";
  try {
    pool = await openSoftOneSqlPool();
    stage = "query server-side open invoice amount summary";
    const summaryResult = await pool
      .request()
      .query<SourceRow>(softOneOpenInvoiceAmountSummaryQuery);
    const summary = summaryResult.recordset[0];
    if (!summary) throw new Error("SoftOne returned no open invoice amount summary.");
    stage = "query server-side document type breakdown";
    const typeResult = await pool
      .request()
      .query<SourceRow>(softOneOpenInvoiceTypeBreakdownQuery);
    stage = "query positive open invoice candidates";
    const positiveOpenRows = await querySoftOneOpenInvoiceSource(pool);
    stage = "query open invoice lookups";
    const maps = await queryMaps(pool);
    stage = "normalize positive open invoice preview";
    const records = normalizeSoftOneOpenInvoiceRows(
      positiveOpenRows,
      maps.documents,
      maps.companies,
      maps.currencies,
    );
    const counts = new Map<string, number>();
    for (const record of records) {
      const key = `${record.company} | ${record.currency}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return {
      total: records.length,
      sourceSummary: {
        groupedRows: numberValue(summary, "GROUPED_ROWS"),
        positiveOpen: numberValue(summary, "POSITIVE_OPEN"),
        zeroOpen: numberValue(summary, "ZERO_OPEN"),
        negativeOpen: numberValue(summary, "NEGATIVE_OPEN"),
        positiveOriginal: numberValue(summary, "POSITIVE_ORIGINAL"),
        positiveRemaining: numberValue(summary, "POSITIVE_REMAINING"),
        zeroRemaining: numberValue(summary, "ZERO_REMAINING"),
        negativeRemaining: numberValue(summary, "NEGATIVE_REMAINING"),
        positiveOriginalWithoutPositiveOpen: numberValue(
          summary,
          "POSITIVE_ORIGINAL_WITHOUT_POSITIVE_OPEN",
        ),
      },
      typeBreakdown: typeResult.recordset.map(row => ({
        sosource: numberValue(row, "SOSOURCE"),
        soredir: numberValue(row, "SOREDIR"),
        total: numberValue(row, "TOTAL_ROWS"),
        positiveRemaining: numberValue(row, "POSITIVE_REMAINING"),
        zeroRemaining: numberValue(row, "ZERO_REMAINING"),
        negativeRemaining: numberValue(row, "NEGATIVE_REMAINING"),
      })),
      breakdown: Array.from(counts.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, count]) => ({ key, count })),
      preview: records.slice(0, 10),
    };
  } catch (error) {
    throw new Error(softOneSqlError(error, stage));
  } finally {
    await pool?.close().catch(() => undefined);
  }
}

export async function syncSoftOneOpenInvoices() {
  if (process.env.SOFTONE_SQL_INVOICE_SYNC_ENABLED !== "true") {
    throw new Error("SoftOne SQL invoice synchronization is disabled.");
  }
  if (!isSoftOneSqlConfigured()) throw new Error("SoftOne SQL is not configured.");
  let pool: ConnectionPool | null = null;
  let stage = "connect";
  try {
    pool = await openSoftOneSqlPool();
    stage = "query and normalize open invoices";
    const records = await loadSoftOneOpenInvoices(pool);
    stage = "upsert MariaDB invoices";
    await db.upsertSoftOneInvoices(records);
    await db.addSyncLog({
      direction: "Pull",
      entityType: "invoices",
      recordCount: records.length,
      status: "Success",
      message: `Read-only SQL sync upserted ${records.length} open invoices`,
    });
    return { synced: records.length };
  } catch (error) {
    throw new Error(softOneSqlError(error, stage));
  } finally {
    await pool?.close().catch(() => undefined);
  }
}
