import type { SoftOneInvoiceUpsert } from "../db";
import * as db from "../db";
import { toEur } from "./arLogic";
import {
  isSoftOneSqlConfigured,
  querySoftOneWithFreshPool,
  softOneSqlError,
} from "./softoneSql";

const MAX_OPEN_INVOICES = 50_000;
const MAX_PAID_INVOICES = 50_000;
// Keep each ODBC result set deliberately small. Some SoftOne documents expand
// to many FINPAYTERMS rows and msnodesqlv8 can otherwise fail while fetching a
// large page with HY010 (Function sequence error). Pagination remains keyed by
// FINDOC, so reducing this value changes only the number of read-only queries.
const SOFTONE_INVOICE_PAGE_SIZE = 25;
const MAX_SOFTONE_INVOICE_PAGES = 500;
const SOFTONE_PAID_INVOICE_PAGE_SIZE = 25;
const MAX_SOFTONE_PAID_INVOICE_PAGES = 2_000;
const SOFTONE_DOCUMENT_LOOKUP_BATCH_SIZE = 250;
const SOFTONE_CUSTOMER_LOOKUP_BATCH_SIZE = 250;
const SOFTONE_INSTALLMENT_LOOKUP_BATCH_SIZE = 250;
type SourceRow = Record<string, unknown>;

const softOneInvoiceVesselSelect =
  process.env.SOFTONE_SQL_VESSEL_SYNC_ENABLED === "true"
    ? "CAST(FIN.[CCCCUSTSHIP] AS bigint)"
    : "CAST(NULL AS bigint)";

function eligibleReceivablesCustomer(alias: string, trdrExpression: string) {
  return `EXISTS (
      SELECT 1
      FROM [dbo].[TRDR] AS ${alias}
      WHERE ${alias}.[TRDR] = ${trdrExpression}
        AND ${alias}.[COMPANY] = 1
        AND ${alias}.[SODTYPE] = 13
        AND ${alias}.[ISACTIVE] = 1
        AND ${alias}.[TRDGROUP] IS NOT NULL
        AND ${alias}.[TRDGROUP] <> 473
    )`;
}

export function buildSoftOneOpenInvoiceFinancialsQuery(afterFindoc: number) {
  if (!Number.isSafeInteger(afterFindoc) || afterFindoc < 0) {
    throw new Error("Invalid SoftOne invoice page cursor.");
  }
  return `WITH document_page AS (
  SELECT TOP (${SOFTONE_INVOICE_PAGE_SIZE})
    FP_PAGE.[FINDOC]
  FROM [dbo].[FINPAYTERMS] AS FP_PAGE
  INNER JOIN [dbo].[FINDOC] AS FIN_PAGE
    ON FIN_PAGE.[COMPANY] = FP_PAGE.[COMPANY]
    AND FIN_PAGE.[FINDOC] = FP_PAGE.[FINDOC]
  WHERE FP_PAGE.[ISCLOSE] = 0
    AND FP_PAGE.[ISCANCEL] = 0
    AND FP_PAGE.[APPRV] = 1
    AND FP_PAGE.[PAYDEMANDMD] IN (-1, 1)
    AND ${eligibleReceivablesCustomer("AR_CUSTOMER_PAGE", "FP_PAGE.[TRDR]")}
    AND FP_PAGE.[FINDOC] > ${afterFindoc}
  GROUP BY FP_PAGE.[FINDOC]
  ORDER BY FP_PAGE.[FINDOC]
)
SELECT
  CAST(FP.[FINDOC] AS bigint) AS [FINDOC],
  CAST(FP.[TRDR] AS bigint) AS [TRDR],
  CAST(FIN.[COMPANY] AS int) AS [COMPANY],
  ${softOneInvoiceVesselSelect} AS [VESSEL_ID],
  CAST(FIN.[SOCURRENCY] AS int) AS [SOCURRENCY],
  CAST(CONVERT(char(8), FP.[TRNDATE], 112) AS int) AS [ISSUE_DATE],
  CAST(CONVERT(char(8), FP.[FINALDATE], 112) AS int) AS [DUE_DATE],
  CAST(FP.[TAMNT] AS float) * CAST(FP.[PAYDEMANDMD] AS float) AS [ORIGINAL_AMOUNT_PART],
  -- The SoftOne report exposes TAMNT - OPNTAMNT as the allocated/settled
  -- portion (OPNTVAL). The displayed Unpaid amount is the remaining
  -- OPNTAMNT, signed by PAYDEMANDMD.
  CAST(FP.[OPNTAMNT] AS float)
    * CAST(FP.[PAYDEMANDMD] AS float) AS [OPEN_AMOUNT_PART]
FROM [dbo].[FINPAYTERMS] AS FP
INNER JOIN [dbo].[FINDOC] AS FIN
  ON FIN.[COMPANY] = FP.[COMPANY] AND FIN.[FINDOC] = FP.[FINDOC]
INNER JOIN document_page AS PAGE
  ON PAGE.[FINDOC] = FP.[FINDOC]
WHERE FP.[ISCLOSE] = 0
  AND FP.[ISCANCEL] = 0
  AND FP.[APPRV] = 1
  AND FP.[PAYDEMANDMD] IN (-1, 1)
  AND ${eligibleReceivablesCustomer("AR_CUSTOMER", "FP.[TRDR]")}
ORDER BY FP.[FINDOC], FP.[TRDR]`;
}

export const softOneOpenInvoiceFinancialsQuery =
  buildSoftOneOpenInvoiceFinancialsQuery(0);

function paidInvoiceYear() {
  const year = Number(process.env.SOFTONE_SQL_PAID_INVOICE_YEAR ?? "2026");
  if (!Number.isSafeInteger(year) || year < 2000 || year > 2100) {
    throw new Error("Invalid SoftOne paid invoice year.");
  }
  return year;
}

/**
 * Closed customer documents supplied by the SoftOne OpenItem report.
 *
 * PAYDEMANDMD=-2 is the report's settled side. The query is intentionally
 * numeric/fixed-width because the production unixODBC driver is unstable when
 * large result sets mix variable text and numeric values. Document, company
 * and currency names are resolved afterwards in small, fresh connections.
 */
export function buildSoftOnePaidInvoiceFinancialsQuery(
  afterFinpayterms: number,
  year = 2026,
) {
  if (!Number.isSafeInteger(afterFinpayterms) || afterFinpayterms < 0) {
    throw new Error("Invalid SoftOne paid invoice page cursor.");
  }
  if (!Number.isSafeInteger(year) || year < 2000 || year > 2100) {
    throw new Error("Invalid SoftOne paid invoice year.");
  }
  const start = `${year}0101`;
  const end = `${year + 1}0101`;
  return `WITH term_page AS (
  SELECT TOP (${SOFTONE_PAID_INVOICE_PAGE_SIZE})
    paid_page.[FINPAYTERMS]
  FROM [dbo].[CCCVOBFINPAY] AS paid_page
  INNER JOIN [dbo].[FINDOC] AS document_page
    ON document_page.[FINDOC] = paid_page.[FINDOC]
  WHERE paid_page.[COMPANY] IN (1, 2, 3, 5, 6, 7, 8)
    AND paid_page.[PAYDEMANDMD] = -2
    AND document_page.[SOSOURCE] IN (1313, 1312, 1381, 1413)
    AND document_page.[ISCANCEL] = 0
    AND document_page.[TRNDATE] >= '${start}'
    AND document_page.[TRNDATE] < '${end}'
    AND document_page.[FINCODE] NOT LIKE N'%ΠΦΠ%'
    AND ABS(COALESCE(paid_page.[OPNTAMNT], 0)) <= 0.005
    AND ${eligibleReceivablesCustomer("PAID_CUSTOMER_PAGE", "paid_page.[TRDR]")}
    AND paid_page.[FINPAYTERMS] > ${afterFinpayterms}
  ORDER BY paid_page.[FINPAYTERMS]
)
SELECT
  CAST(paid.[FINPAYTERMS] AS bigint) AS [FINPAYTERMS],
  CAST(paid.[FINDOC] AS bigint) AS [FINDOC],
  CAST(paid.[TRDR] AS bigint) AS [TRDR],
  CAST(document.[COMPANY] AS int) AS [COMPANY],
  ${softOneInvoiceVesselSelect.replaceAll("FIN.", "document.")} AS [VESSEL_ID],
  CAST(document.[SOCURRENCY] AS int) AS [SOCURRENCY],
  CAST(CONVERT(char(8), document.[TRNDATE], 112) AS int) AS [ISSUE_DATE],
  CAST(CONVERT(char(8), COALESCE(paid.[FINALDATE], document.[TRNDATE]), 112) AS int) AS [DUE_DATE],
  ABS(CAST(COALESCE(paid.[TAMNT], 0) AS float)) AS [AMOUNT_PART],
  ABS(CAST(COALESCE(paid.[OPNTAMNT], 0) AS float)) AS [OPEN_AMOUNT_PART]
FROM [dbo].[CCCVOBFINPAY] AS paid
INNER JOIN [dbo].[FINDOC] AS document
  ON document.[FINDOC] = paid.[FINDOC]
INNER JOIN term_page AS page
  ON page.[FINPAYTERMS] = paid.[FINPAYTERMS]
WHERE paid.[COMPANY] IN (1, 2, 3, 5, 6, 7, 8)
  AND paid.[PAYDEMANDMD] = -2
  AND document.[SOSOURCE] IN (1313, 1312, 1381, 1413)
  AND document.[ISCANCEL] = 0
  AND document.[TRNDATE] >= '${start}'
  AND document.[TRNDATE] < '${end}'
  AND document.[FINCODE] NOT LIKE N'%ΠΦΠ%'
  AND ABS(COALESCE(paid.[OPNTAMNT], 0)) <= 0.005
  AND ${eligibleReceivablesCustomer("PAID_CUSTOMER", "paid.[TRDR]")}
ORDER BY paid.[FINPAYTERMS]`;
}

export const softOnePaidInvoiceFinancialsQuery =
  buildSoftOnePaidInvoiceFinancialsQuery(0, 2026);

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
    AND NOT EXISTS (
      SELECT 1 FROM [dbo].[TRDR] AS INTERNAL_CUSTOMER
      WHERE INTERNAL_CUSTOMER.[TRDR] = FP.[TRDR]
        AND INTERNAL_CUSTOMER.[COMPANY] = 1
        AND INTERNAL_CUSTOMER.[SODTYPE] = 13
        AND INTERNAL_CUSTOMER.[TRDGROUP] = 473
    )
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
    AND NOT EXISTS (
      SELECT 1 FROM [dbo].[TRDR] AS INTERNAL_CUSTOMER
      WHERE INTERNAL_CUSTOMER.[TRDR] = FP.[TRDR]
        AND INTERNAL_CUSTOMER.[COMPANY] = 1
        AND INTERNAL_CUSTOMER.[SODTYPE] = 13
        AND INTERNAL_CUSTOMER.[TRDGROUP] = 473
    )
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

export const softOneInvoiceAmountSamplesQuery = `SELECT
  CAST(FP.[FINDOC] AS bigint) AS [FINDOC],
  CAST(FP.[PAYDEMANDMD] AS int) AS [PAYDEMANDMD],
  CAST(FP.[TAMNT] AS float) AS [TAMNT],
  CAST(FP.[OPNTAMNT] AS float) AS [OPNTAMNT],
  CAST((FP.[TAMNT] - FP.[OPNTAMNT]) * FP.[PAYDEMANDMD] AS float) AS [REPORT_UNPAID]
FROM [dbo].[FINPAYTERMS] AS FP
WHERE FP.[FINDOC] IN (1403582, 1422083, 1397407, 1407203, 1414197)
ORDER BY FP.[FINDOC], FP.[FINALDATE]`;

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
    AND NOT EXISTS (
      SELECT 1 FROM [dbo].[TRDR] AS INTERNAL_CUSTOMER
      WHERE INTERNAL_CUSTOMER.[TRDR] = FP.[TRDR]
        AND INTERNAL_CUSTOMER.[COMPANY] = 1
        AND INTERNAL_CUSTOMER.[SODTYPE] = 13
        AND INTERNAL_CUSTOMER.[TRDGROUP] = 473
    )
)`;

export function buildSoftOneOpenInvoiceDocumentsQuery(findocs: string[]) {
  if (
    findocs.length === 0 ||
    findocs.length > SOFTONE_DOCUMENT_LOOKUP_BATCH_SIZE ||
    findocs.some(value => !/^\d+$/.test(value))
  ) {
    throw new Error("Invalid SoftOne document lookup identifiers.");
  }
  return `SELECT
  CAST(FIN.[FINDOC] AS bigint) AS [FINDOC],
  CAST(FIN.[FINCODE] AS nchar(64)) AS [FINCODE]
FROM [dbo].[FINDOC] AS FIN
WHERE FIN.[FINDOC] IN (${findocs.join(", ")})`;
}

export const softOneCompaniesQuery = `SELECT
  CAST([COMPANY] AS int) AS [COMPANY],
  CAST([NAME] AS nchar(128)) AS [NAME]
FROM [dbo].[COMPANY]`;

export const softOneCurrenciesQuery = `SELECT
  CAST([SOCURRENCY] AS int) AS [SOCURRENCY],
  CAST([NAME] AS nchar(64)) AS [NAME]
FROM [dbo].[SOCURRENCY]`;

export function buildSoftOneInvoiceCustomerLookupQuery(softoneIds: string[]) {
  if (
    softoneIds.length === 0 ||
    softoneIds.length > SOFTONE_CUSTOMER_LOOKUP_BATCH_SIZE ||
    softoneIds.some(value => !/^\d+$/.test(value))
  ) {
    throw new Error("Invalid SoftOne invoice customer lookup identifiers.");
  }
  return `SELECT
  CAST(customer.[TRDR] AS bigint) AS [TRDR],
  CAST(customer.[NAME] AS nchar(255)) AS [NAME],
  CAST(customer_group.[TRDR] AS bigint) AS [MASTERTRDR],
  CAST(COALESCE(customer_group.[NAME], customer.[NAME]) AS nchar(255)) AS [GROUP_NAME]
FROM [dbo].[TRDR] AS customer
LEFT JOIN [dbo].[TRDR] AS customer_group
  ON customer_group.[TRDR] = customer.[TRDGROUP]
WHERE customer.[TRDR] IN (${softoneIds.join(", ")})
  AND customer.[COMPANY] = 1
  AND customer.[SODTYPE] = 13
  AND customer.[ISACTIVE] = 1
  AND customer.[TRDGROUP] IS NOT NULL
  AND customer.[TRDGROUP] <> 473`;
}

export function buildSoftOneInvoiceInstallmentLookupQuery(findocs: string[]) {
  if (
    findocs.length === 0 ||
    findocs.length > SOFTONE_INSTALLMENT_LOOKUP_BATCH_SIZE ||
    findocs.some(value => !/^\d+$/.test(value))
  ) {
    throw new Error("Invalid SoftOne installment lookup identifiers.");
  }
  return `SELECT
  CAST(installment.[CCCINSTALMENTS] AS bigint) AS [INSTALLMENT_ID],
  CAST(installment.[CCCPRJC] AS bigint) AS [CONTRACT_ID],
  CAST(installment.[FINDOC] AS bigint) AS [FINDOC],
  CAST(installment.[TRDR] AS bigint) AS [TRDR],
  CAST(installment.[CCCCUSTSHIP] AS bigint) AS [VESSEL_ID],
  CAST(installment.[VALUE] AS float) AS [ALLOCATION_AMOUNT]
FROM [dbo].[CCCINSTALMENTS] AS installment
INNER JOIN [dbo].[CCCPRJC] AS contract
  ON contract.[CCCPRJC] = installment.[CCCPRJC]
WHERE contract.[ACTIVE247] = 1
  AND installment.[FINDOC] IN (${findocs.join(", ")})
ORDER BY installment.[FINDOC], installment.[CCCINSTALMENTS]`;
}

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

export function aggregateSoftOneOpenInvoiceParts(rows: SourceRow[]) {
  const grouped = new Map<string, SourceRow>();
  for (const row of rows) {
    const findoc = identity(row, "FINDOC");
    const trdr = identity(row, "TRDR");
    const sourceKey = `${findoc}:${trdr}`;
    const existing = grouped.get(sourceKey);
    const originalPart = numberValue(row, "ORIGINAL_AMOUNT_PART");
    const openPart = numberValue(row, "OPEN_AMOUNT_PART");
    const dueDate = numberValue(row, "DUE_DATE");
    if (!existing) {
      grouped.set(sourceKey, {
        FINDOC: row.FINDOC,
        TRDR: row.TRDR,
        COMPANY: row.COMPANY,
        VESSEL_ID: row.VESSEL_ID,
        SOCURRENCY: row.SOCURRENCY,
        ISSUE_DATE: row.ISSUE_DATE,
        DUE_DATE: dueDate,
        ORIGINAL_AMOUNT: originalPart,
        OPEN_AMOUNT: openPart,
      });
      continue;
    }
    for (const field of ["COMPANY", "SOCURRENCY", "ISSUE_DATE"]) {
      if (identity(existing, field) !== identity(row, field)) {
        throw new Error(`SoftOne FINDOC ${findoc} has inconsistent ${field}.`);
      }
    }
    if (String(existing.VESSEL_ID ?? "") !== String(row.VESSEL_ID ?? "")) {
      throw new Error(`SoftOne FINDOC ${findoc} has inconsistent VESSEL_ID.`);
    }
    existing.DUE_DATE = Math.max(numberValue(existing, "DUE_DATE"), dueDate);
    existing.ORIGINAL_AMOUNT =
      numberValue(existing, "ORIGINAL_AMOUNT") + originalPart;
    existing.OPEN_AMOUNT = numberValue(existing, "OPEN_AMOUNT") + openPart;
  }
  const positiveRows = Array.from(grouped.values()).filter(
    row => numberValue(row, "OPEN_AMOUNT") > 0.005,
  );
  const rowsPerDocument = new Map<string, number>();
  for (const row of positiveRows) {
    const findoc = identity(row, "FINDOC");
    rowsPerDocument.set(findoc, (rowsPerDocument.get(findoc) ?? 0) + 1);
  }
  const firstCustomerPerDocument = new Set<string>();
  return positiveRows.map(row => {
    const findoc = identity(row, "FINDOC");
    const trdr = identity(row, "TRDR");
    const hasMultipleCustomers = (rowsPerDocument.get(findoc) ?? 0) > 1;
    const retainLegacyId = !hasMultipleCustomers || !firstCustomerPerDocument.has(findoc);
    firstCustomerPerDocument.add(findoc);
    return {
      ...row,
      SOFTONE_ID: retainLegacyId ? findoc : `${findoc}:${trdr}`,
    };
  });
}

export function aggregateSoftOnePaidInvoiceParts(rows: SourceRow[]) {
  const terms = new Set<string>();
  const grouped = new Map<string, SourceRow>();
  for (const row of rows) {
    const term = identity(row, "FINPAYTERMS");
    if (terms.has(term)) {
      throw new Error(`SoftOne returned duplicate paid FINPAYTERMS ${term}.`);
    }
    terms.add(term);
    const findoc = identity(row, "FINDOC");
    const trdr = identity(row, "TRDR");
    const key = `${findoc}:${trdr}`;
    const amountPart = numberValue(row, "AMOUNT_PART");
    const openPart = numberValue(row, "OPEN_AMOUNT_PART");
    if (openPart > 0.005) {
      throw new Error(`SoftOne paid FINDOC ${findoc} still has an open amount.`);
    }
    const dueDate = numberValue(row, "DUE_DATE");
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        FINDOC: row.FINDOC,
        TRDR: row.TRDR,
        COMPANY: row.COMPANY,
        VESSEL_ID: row.VESSEL_ID,
        SOCURRENCY: row.SOCURRENCY,
        ISSUE_DATE: row.ISSUE_DATE,
        DUE_DATE: dueDate,
        PAID_AMOUNT: amountPart,
      });
      continue;
    }
    for (const field of ["COMPANY", "SOCURRENCY", "ISSUE_DATE"]) {
      if (identity(existing, field) !== identity(row, field)) {
        throw new Error(`SoftOne paid FINDOC ${findoc} has inconsistent ${field}.`);
      }
    }
    if (String(existing.VESSEL_ID ?? "") !== String(row.VESSEL_ID ?? "")) {
      throw new Error(`SoftOne paid FINDOC ${findoc} has inconsistent VESSEL_ID.`);
    }
    existing.DUE_DATE = Math.max(numberValue(existing, "DUE_DATE"), dueDate);
    existing.PAID_AMOUNT = numberValue(existing, "PAID_AMOUNT") + amountPart;
  }
  const paidRows = Array.from(grouped.values()).filter(
    row => numberValue(row, "PAID_AMOUNT") > 0.005,
  );
  const rowsPerDocument = new Map<string, number>();
  for (const row of paidRows) {
    const findoc = identity(row, "FINDOC");
    rowsPerDocument.set(findoc, (rowsPerDocument.get(findoc) ?? 0) + 1);
  }
  const firstCustomerPerDocument = new Set<string>();
  return paidRows.map(row => {
    const findoc = identity(row, "FINDOC");
    const trdr = identity(row, "TRDR");
    const hasMultipleCustomers = (rowsPerDocument.get(findoc) ?? 0) > 1;
    const retainLegacyId = !hasMultipleCustomers || !firstCustomerPerDocument.has(findoc);
    firstCustomerPerDocument.add(findoc);
    return {
      ...row,
      SOFTONE_ID: retainLegacyId ? findoc : `${findoc}:${trdr}`,
    };
  });
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
  _now = Date.now(),
) {
  if (rows.length === 0) throw new Error("SoftOne returned no open invoices.");
  if (rows.length > MAX_OPEN_INVOICES) {
    throw new Error("SoftOne open invoice row limit exceeded.");
  }
  const identifiers = new Set<string>();
  return rows.map(row => {
    const findoc = identity(row, "FINDOC");
    const softoneId = identity(row, "SOFTONE_ID");
    if (identifiers.has(softoneId)) {
      throw new Error("SoftOne returned duplicate FINDOC.");
    }
    identifiers.add(softoneId);
    const customerSoftoneId = identity(row, "TRDR");
    const invoiceNumber = documents.get(findoc);
    const company = companies.get(identity(row, "COMPANY"));
    const currencyName = currencies.get(identity(row, "SOCURRENCY"));
    if (!invoiceNumber) throw new Error(`SoftOne FINDOC ${findoc} has no document number.`);
    if (!company) throw new Error(`SoftOne FINDOC ${findoc} has no company mapping.`);
    if (!currencyName) throw new Error(`SoftOne FINDOC ${findoc} has no currency mapping.`);

    const issueDate = dateKeyToUtc(row.ISSUE_DATE, "ISSUE_DATE");
    const dueDate = dateKeyToUtc(row.DUE_DATE, "DUE_DATE");
    const originalAmount = Math.round(numberValue(row, "ORIGINAL_AMOUNT") * 100) / 100;
    const openAmount = Math.round(numberValue(row, "OPEN_AMOUNT") * 100) / 100;
    if (openAmount <= 0) {
      throw new Error(`SoftOne FINDOC ${findoc} has invalid open amount.`);
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
      // Manus treats overdue as a value derived from dueDate at read time.
      // Persist only the settlement state so SoftOne-sourced invoices follow
      // the exact same filters and badge behavior as the application UI.
      status: paidAmount > 0.005 ? "Partially Paid" : "Open",
      vesselId: Number(row.VESSEL_ID) > 0 ? Number(row.VESSEL_ID) : null,
      softoneId,
    } satisfies SoftOneInvoiceUpsert;
  });
}

export function normalizeSoftOnePaidInvoiceRows(
  rows: SourceRow[],
  documents: Map<string, string>,
  companies: Map<string, string>,
  currencies: Map<string, string>,
) {
  if (rows.length === 0) throw new Error("SoftOne returned no paid invoices.");
  if (rows.length > MAX_PAID_INVOICES) {
    throw new Error("SoftOne paid invoice row limit exceeded.");
  }
  const identifiers = new Set<string>();
  return rows.map(row => {
    const findoc = identity(row, "FINDOC");
    const softoneId = identity(row, "SOFTONE_ID");
    if (identifiers.has(softoneId)) {
      throw new Error("SoftOne returned duplicate paid FINDOC.");
    }
    identifiers.add(softoneId);
    const invoiceNumber = documents.get(findoc);
    const company = companies.get(identity(row, "COMPANY"));
    const currencyName = currencies.get(identity(row, "SOCURRENCY"));
    if (!invoiceNumber) throw new Error(`SoftOne paid FINDOC ${findoc} has no document number.`);
    if (invoiceNumber.toLocaleUpperCase("el-GR").includes("ΠΦΠ")) {
      throw new Error(`SoftOne paid FINDOC ${findoc} is an excluded ΠΦΠ document.`);
    }
    if (!company) throw new Error(`SoftOne paid FINDOC ${findoc} has no company mapping.`);
    if (!currencyName) throw new Error(`SoftOne paid FINDOC ${findoc} has no currency mapping.`);
    const amount = Math.round(numberValue(row, "PAID_AMOUNT") * 100) / 100;
    if (amount <= 0) throw new Error(`SoftOne paid FINDOC ${findoc} has invalid amount.`);
    const currency = normalizeSoftOneCurrencyName(currencyName);
    return {
      customerSoftoneId: identity(row, "TRDR"),
      invoiceNumber,
      company,
      currency,
      amountEur: toEur(amount, currency).toFixed(2),
      issueDate: dateKeyToUtc(row.ISSUE_DATE, "ISSUE_DATE"),
      dueDate: dateKeyToUtc(row.DUE_DATE, "DUE_DATE"),
      amount: amount.toFixed(2),
      paidAmount: amount.toFixed(2),
      status: "Paid",
      vesselId: Number(row.VESSEL_ID) > 0 ? Number(row.VESSEL_ID) : null,
      softoneId,
    } satisfies SoftOneInvoiceUpsert;
  });
}

async function queryMaps(
  rows: SourceRow[],
  setStage: (stage: string) => void,
) {
  const findocs = Array.from(new Set(rows.map(row => identity(row, "FINDOC"))));
  const documentRows: SourceRow[] = [];
  for (
    let index = 0;
    index < findocs.length;
    index += SOFTONE_DOCUMENT_LOOKUP_BATCH_SIZE
  ) {
    const batch = findocs.slice(index, index + SOFTONE_DOCUMENT_LOOKUP_BATCH_SIZE);
    setStage(
      `query open invoice document lookup batch ${Math.floor(index / SOFTONE_DOCUMENT_LOOKUP_BATCH_SIZE) + 1}`,
    );
    const result = await querySoftOneWithFreshPool<SourceRow>(
      buildSoftOneOpenInvoiceDocumentsQuery(batch),
      `open invoice document lookup batch ${Math.floor(index / SOFTONE_DOCUMENT_LOOKUP_BATCH_SIZE) + 1}`,
    );
    documentRows.push(...result.recordset);
  }
  setStage("query SoftOne companies");
  const companyResult = await querySoftOneWithFreshPool<SourceRow>(
    softOneCompaniesQuery,
    "SoftOne companies",
  );
  setStage("query SoftOne currencies");
  const currencyResult = await querySoftOneWithFreshPool<SourceRow>(
    softOneCurrenciesQuery,
    "SoftOne currencies",
  );
  return {
    documents: new Map(
      documentRows.map(row => [
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

async function querySoftOneOpenInvoiceSource(
  setStage: (stage: string) => void = () => undefined,
) {
  const records: SourceRow[] = [];
  let afterFindoc = 0;
  for (let page = 0; page < MAX_SOFTONE_INVOICE_PAGES; page += 1) {
    setStage(`query open invoice source page ${page + 1} after FINDOC ${afterFindoc}`);
    const result = await querySoftOneWithFreshPool<SourceRow>(
      buildSoftOneOpenInvoiceFinancialsQuery(afterFindoc),
      `open invoice source page ${page + 1} after FINDOC ${afterFindoc}`,
    );
    if (result.recordset.length === 0) return records;
    const pageRecords = aggregateSoftOneOpenInvoiceParts(result.recordset);
    records.push(...pageRecords);
    if (records.length > MAX_OPEN_INVOICES) {
      throw new Error("SoftOne open invoice row limit exceeded.");
    }
    const pageFindocs = Array.from(
      new Set(result.recordset.map(row => numberValue(row, "FINDOC"))),
    ).sort((left, right) => left - right);
    const nextCursor = pageFindocs.at(-1);
    if (nextCursor === undefined || nextCursor <= afterFindoc) {
      throw new Error("SoftOne invoice pagination did not advance.");
    }
    afterFindoc = nextCursor;
    if (pageFindocs.length < SOFTONE_INVOICE_PAGE_SIZE) return records;
  }
  throw new Error("SoftOne invoice page limit exceeded.");
}

async function querySoftOnePaidInvoiceSource(
  setStage: (stage: string) => void = () => undefined,
) {
  const records: SourceRow[] = [];
  let afterFinpayterms = 0;
  const year = paidInvoiceYear();
  for (let page = 0; page < MAX_SOFTONE_PAID_INVOICE_PAGES; page += 1) {
    setStage(
      `query paid invoice source page ${page + 1} after FINPAYTERMS ${afterFinpayterms}`,
    );
    const result = await querySoftOneWithFreshPool<SourceRow>(
      buildSoftOnePaidInvoiceFinancialsQuery(afterFinpayterms, year),
      `paid invoice source page ${page + 1} after FINPAYTERMS ${afterFinpayterms}`,
    );
    if (result.recordset.length === 0) return records;
    records.push(...result.recordset);
    if (records.length > MAX_PAID_INVOICES) {
      throw new Error("SoftOne paid invoice row limit exceeded.");
    }
    const pageTerms = Array.from(
      new Set(result.recordset.map(row => numberValue(row, "FINPAYTERMS"))),
    ).sort((left, right) => left - right);
    const nextCursor = pageTerms.at(-1);
    if (nextCursor === undefined || nextCursor <= afterFinpayterms) {
      throw new Error("SoftOne paid invoice pagination did not advance.");
    }
    afterFinpayterms = nextCursor;
    if (pageTerms.length < SOFTONE_PAID_INVOICE_PAGE_SIZE) return records;
  }
  throw new Error("SoftOne paid invoice page limit exceeded.");
}

async function loadSoftOneOpenInvoices(
  setStage: (stage: string) => void,
) {
  const rows = await querySoftOneOpenInvoiceSource(setStage);
  const maps = await queryMaps(rows, setStage);
  const records = normalizeSoftOneOpenInvoiceRows(
    rows,
    maps.documents,
    maps.companies,
    maps.currencies,
  );
  if (process.env.SOFTONE_SQL_CONTRACT_INSTALLMENT_SYNC_ENABLED !== "true") {
    return records;
  }
  const findocs = Array.from(
    new Set(records.map(record => String(record.softoneId).split(":", 1)[0])),
  );
  const installmentRows: SourceRow[] = [];
  for (
    let index = 0;
    index < findocs.length;
    index += SOFTONE_INSTALLMENT_LOOKUP_BATCH_SIZE
  ) {
    const batch = findocs.slice(index, index + SOFTONE_INSTALLMENT_LOOKUP_BATCH_SIZE);
    setStage(`query contract installment lookup batch ${Math.floor(index / SOFTONE_INSTALLMENT_LOOKUP_BATCH_SIZE) + 1}`);
    const result = await querySoftOneWithFreshPool<SourceRow>(
      buildSoftOneInvoiceInstallmentLookupQuery(batch),
      `contract installment lookup batch ${Math.floor(index / SOFTONE_INSTALLMENT_LOOKUP_BATCH_SIZE) + 1}`,
    );
    installmentRows.push(...result.recordset);
  }
  const allocationsByInvoiceCustomer = new Map<string, SoftOneInvoiceUpsert["vesselAllocations"]>();
  const installmentIds = new Set<string>();
  for (const row of installmentRows) {
    const installmentId = identity(row, "INSTALLMENT_ID");
    if (installmentIds.has(installmentId)) {
      throw new Error(`SoftOne returned duplicate installment id ${installmentId}.`);
    }
    installmentIds.add(installmentId);
    const findoc = identity(row, "FINDOC");
    const trdr = identity(row, "TRDR");
    const vesselId = numberValue(row, "VESSEL_ID");
    const amount = Math.round(numberValue(row, "ALLOCATION_AMOUNT") * 100) / 100;
    if (!Number.isSafeInteger(vesselId) || vesselId <= 0 || amount < 0) {
      throw new Error(`SoftOne installment ${installmentId} has invalid vessel or amount.`);
    }
    const key = `${findoc}:${trdr}`;
    const allocations = allocationsByInvoiceCustomer.get(key) ?? [];
    allocations.push({
      softoneInstallmentId: installmentId,
      contractSoftoneId: identity(row, "CONTRACT_ID"),
      vesselId,
      amount: amount.toFixed(2),
    });
    allocationsByInvoiceCustomer.set(key, allocations);
  }
  return records.map(record => {
    const findoc = String(record.softoneId).split(":", 1)[0];
    const vesselAllocations = allocationsByInvoiceCustomer.get(
      `${findoc}:${record.customerSoftoneId}`,
    ) ?? [];
    return {
      ...record,
      isContractInstallment: vesselAllocations.length > 0,
      vesselId: vesselAllocations[0]?.vesselId ?? record.vesselId ?? null,
      vesselAllocations,
    };
  });
}

async function loadSoftOnePaidInvoices(setStage: (stage: string) => void) {
  const sourceRows = await querySoftOnePaidInvoiceSource(setStage);
  const rows = aggregateSoftOnePaidInvoiceParts(sourceRows);
  if (rows.length === 0) throw new Error("SoftOne returned no paid invoice candidates.");
  const maps = await queryMaps(rows, setStage);
  return normalizeSoftOnePaidInvoiceRows(
    rows,
    maps.documents,
    maps.companies,
    maps.currencies,
  );
}

async function ensureInvoiceCustomers(
  records: SoftOneInvoiceUpsert[],
) {
  const existingIds = new Set(
    (await db.listCustomers())
      .map(customer => customer.softoneId)
      .filter((value): value is string => Boolean(value)),
  );
  const missingIds = Array.from(
    new Set(
      records
        .map(record => record.customerSoftoneId)
        .filter(softoneId => !existingIds.has(softoneId)),
    ),
  );
  if (missingIds.length === 0) return 0;

  const rows: SourceRow[] = [];
  for (
    let index = 0;
    index < missingIds.length;
    index += SOFTONE_CUSTOMER_LOOKUP_BATCH_SIZE
  ) {
    const batch = missingIds.slice(
      index,
      index + SOFTONE_CUSTOMER_LOOKUP_BATCH_SIZE,
    );
    const result = await querySoftOneWithFreshPool<SourceRow>(
      buildSoftOneInvoiceCustomerLookupQuery(batch),
      `invoice customer lookup batch ${Math.floor(index / SOFTONE_CUSTOMER_LOOKUP_BATCH_SIZE) + 1}`,
    );
    rows.push(...result.recordset);
  }
  const synchronizedAt = new Date();
  const customers = rows.map(row => {
    const softoneId = identity(row, "TRDR");
    const name = identity(row, "NAME");
    const masterSoftoneId =
      row.MASTERTRDR == null ? null : String(row.MASTERTRDR).trim() || null;
    return {
      code: softoneId,
      name,
      customerGroup: String(row.GROUP_NAME ?? "").trim() || name,
      masterSoftoneId,
      softoneId,
      softoneSyncedAt: synchronizedAt,
    };
  });
  const resolvedIds = new Set(customers.map(customer => customer.softoneId));
  const unresolvedIds = missingIds.filter(softoneId => !resolvedIds.has(softoneId));
  if (unresolvedIds.length > 0) {
    throw new Error(
      `SoftOne did not resolve ${unresolvedIds.length} invoice customers.`,
    );
  }
  await db.insertMissingSoftOneCustomers(customers);
  return customers.length;
}

export async function inspectSoftOneOpenInvoices() {
  if (!isSoftOneSqlConfigured()) throw new Error("SoftOne SQL is not configured.");
  let stage = "connect";
  try {
    stage = "query server-side open invoice amount summary";
    const summaryResult = await querySoftOneWithFreshPool<SourceRow>(
      softOneOpenInvoiceAmountSummaryQuery,
      "open invoice amount summary",
    );
    const summary = summaryResult.recordset[0];
    if (!summary) throw new Error("SoftOne returned no open invoice amount summary.");
    stage = "query server-side document type breakdown";
    const typeResult = await querySoftOneWithFreshPool<SourceRow>(
      softOneOpenInvoiceTypeBreakdownQuery,
      "open invoice type breakdown",
    );
    stage = "query known report invoice amount samples";
    const sampleResult = await querySoftOneWithFreshPool<SourceRow>(
      softOneInvoiceAmountSamplesQuery,
      "open invoice amount samples",
    );
    stage = "query positive open invoice candidates";
    const positiveOpenRows = await querySoftOneOpenInvoiceSource();
    stage = "query open invoice lookups";
    const maps = await queryMaps(positiveOpenRows, stageName => {
      stage = stageName;
    });
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
      amountSamples: sampleResult.recordset.map(row => ({
        findoc: identity(row, "FINDOC"),
        direction: numberValue(row, "PAYDEMANDMD"),
        total: numberValue(row, "TAMNT"),
        opntamnt: numberValue(row, "OPNTAMNT"),
        reportUnpaid: numberValue(row, "REPORT_UNPAID"),
      })),
      breakdown: Array.from(counts.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, count]) => ({ key, count })),
      preview: records.slice(0, 10),
    };
  } catch (error) {
    throw new Error(softOneSqlError(error, stage));
  }
}

export async function syncSoftOneOpenInvoices() {
  if (process.env.SOFTONE_SQL_INVOICE_SYNC_ENABLED !== "true") {
    throw new Error("SoftOne SQL invoice synchronization is disabled.");
  }
  if (!isSoftOneSqlConfigured()) throw new Error("SoftOne SQL is not configured.");
  let stage = "connect";
  try {
    stage = "query and normalize open invoices";
    const records = await loadSoftOneOpenInvoices(stageName => {
      stage = stageName;
    });
    stage = "resolve invoice-only customers";
    const insertedCustomers = await ensureInvoiceCustomers(records);
    stage = "upsert MariaDB invoices";
    await db.upsertSoftOneInvoices(records);
    await db.addSyncLog({
      direction: "Pull",
      entityType: "invoices",
      recordCount: records.length,
      status: "Success",
      message: `Read-only SQL sync upserted ${records.length} open invoices`,
    });
    return { synced: records.length, insertedCustomers };
  } catch (error) {
    throw new Error(softOneSqlError(error, stage));
  }
}

export async function inspectSoftOnePaidInvoices() {
  if (!isSoftOneSqlConfigured()) throw new Error("SoftOne SQL is not configured.");
  let stage = "connect";
  try {
    const records = await loadSoftOnePaidInvoices(stageName => {
      stage = stageName;
    });
    const counts = new Map<string, number>();
    for (const record of records) {
      const key = `${record.company} | ${record.currency}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return {
      year: paidInvoiceYear(),
      total: records.length,
      amount: records.reduce((sum, record) => sum + Number(record.amount), 0),
      breakdown: Array.from(counts.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, count]) => ({ key, count })),
      preview: records.slice(0, 20),
    };
  } catch (error) {
    throw new Error(softOneSqlError(error, stage));
  }
}

export async function syncSoftOnePaidInvoices() {
  if (process.env.SOFTONE_SQL_PAID_INVOICE_SYNC_ENABLED !== "true") {
    throw new Error("SoftOne SQL paid invoice synchronization is disabled.");
  }
  if (!isSoftOneSqlConfigured()) throw new Error("SoftOne SQL is not configured.");
  let stage = "connect";
  try {
    stage = "query and normalize paid invoices";
    const records = await loadSoftOnePaidInvoices(stageName => {
      stage = stageName;
    });
    stage = "resolve paid invoice customers";
    const insertedCustomers = await ensureInvoiceCustomers(records);
    stage = "upsert MariaDB paid invoices";
    await db.upsertSoftOneInvoices(records);
    await db.addSyncLog({
      direction: "Pull",
      entityType: "paid-invoices",
      recordCount: records.length,
      status: "Success",
      message: `Read-only SQL sync upserted ${records.length} paid invoices for ${paidInvoiceYear()}`,
    });
    return { synced: records.length, insertedCustomers, year: paidInvoiceYear() };
  } catch (error) {
    throw new Error(softOneSqlError(error, stage));
  }
}

/** Existing scheduled/manual invoice sync, optionally extended with paid rows. */
export async function syncSoftOneInvoices() {
  const open = await syncSoftOneOpenInvoices();
  const paid = process.env.SOFTONE_SQL_PAID_INVOICE_SYNC_ENABLED === "true"
    ? await syncSoftOnePaidInvoices()
    : { synced: 0, insertedCustomers: 0, year: paidInvoiceYear() };
  return {
    synced: open.synced + paid.synced,
    insertedCustomers: open.insertedCustomers + paid.insertedCustomers,
    openSynced: open.synced,
    paidSynced: paid.synced,
    paidYear: paid.year,
  };
}
