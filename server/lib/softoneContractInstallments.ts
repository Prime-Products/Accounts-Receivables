import type { ConnectionPool } from "mssql";
import {
  isSoftOneSqlConfigured,
  openSoftOneSqlPool,
  querySoftOneWithWatchdog,
  softOneSqlError,
} from "./softoneSql";

type SourceRow = Record<string, unknown>;

const installmentDocumentsCte = `WITH active_installments AS (
  SELECT
    installment.[CCCINSTALMENTS],
    installment.[CCCPRJC],
    installment.[CCCPRJCVESSEL],
    installment.[DATE] AS [INSTALLMENT_DATE],
    installment.[VALUE] AS [INSTALLMENT_VALUE],
    installment.[LINENUM],
    installment.[TRDR],
    installment.[CCCCUSTSHIP],
    installment.[FINDOC]
  FROM [dbo].[CCCINSTALMENTS] AS installment
  INNER JOIN [dbo].[CCCPRJC] AS contract
    ON contract.[CCCPRJC] = installment.[CCCPRJC]
  WHERE contract.[ACTIVE247] = 1
    AND installment.[FINDOC] IS NOT NULL
),
installment_documents AS (
  SELECT
    [FINDOC],
    COUNT(*) AS [ASSIGNMENT_COUNT],
    MIN([CCCINSTALMENTS]) AS [INSTALLMENT_ID],
    MIN([CCCPRJC]) AS [CONTRACT_ID],
    MIN([TRDR]) AS [TRDR],
    MIN([CCCCUSTSHIP]) AS [VESSEL_ID],
    MIN([INSTALLMENT_DATE]) AS [INSTALLMENT_DATE],
    SUM(CAST([INSTALLMENT_VALUE] AS float)) AS [INSTALLMENT_VALUE]
  FROM active_installments
  GROUP BY [FINDOC]
),
open_terms AS (
  SELECT
    payment.[FINDOC],
    MAX(payment.[FINALDATE]) AS [DUE_DATE],
    SUM(CAST(payment.[OPNTAMNT] AS float) * CAST(payment.[PAYDEMANDMD] AS float)) AS [OUTSTANDING]
  FROM [dbo].[FINPAYTERMS] AS payment
  WHERE payment.[ISCLOSE] = 0
    AND payment.[ISCANCEL] = 0
    AND payment.[APPRV] = 1
    AND payment.[PAYDEMANDMD] IN (-1, 1)
  GROUP BY payment.[FINDOC]
)`;

export const softOneContractInstallmentSummaryQuery = `${installmentDocumentsCte}
SELECT
  CAST(COALESCE(SUM(document.[ASSIGNMENT_COUNT]), 0) AS bigint) AS [ACTIVE_INSTALLMENT_ROWS],
  CAST(COUNT(*) AS bigint) AS [DISTINCT_INVOICES],
  CAST(COALESCE(SUM(CASE WHEN document.[ASSIGNMENT_COUNT] > 1 THEN 1 ELSE 0 END), 0) AS bigint) AS [DUPLICATE_INVOICES],
  CAST(COALESCE(SUM(CASE WHEN document.[TRDR] IS NOT NULL THEN 1 ELSE 0 END), 0) AS bigint) AS [WITH_CUSTOMER],
  CAST(COALESCE(SUM(CASE WHEN document.[VESSEL_ID] IS NOT NULL THEN 1 ELSE 0 END), 0) AS bigint) AS [WITH_VESSEL],
  CAST(COALESCE(SUM(CASE WHEN terms.[OUTSTANDING] > 0.005 THEN 1 ELSE 0 END), 0) AS bigint) AS [OPEN_INVOICES],
  CAST(COALESCE(SUM(CASE
    WHEN terms.[OUTSTANDING] > 0.005 AND terms.[DUE_DATE] < CAST(GETDATE() AS date) THEN 1
    ELSE 0
  END), 0) AS bigint) AS [OVERDUE_INVOICES],
  CAST(COALESCE(SUM(CASE WHEN terms.[OUTSTANDING] > 0.005 THEN terms.[OUTSTANDING] ELSE 0 END), 0) AS float) AS [OPEN_AMOUNT],
  CAST(COALESCE(SUM(CASE
    WHEN terms.[OUTSTANDING] > 0.005 AND terms.[DUE_DATE] < CAST(GETDATE() AS date) THEN terms.[OUTSTANDING]
    ELSE 0
  END), 0) AS float) AS [OVERDUE_AMOUNT]
FROM installment_documents AS document
LEFT JOIN open_terms AS terms
  ON terms.[FINDOC] = document.[FINDOC]`;

export const softOneContractInstallmentPreviewQuery = `${installmentDocumentsCte}
SELECT TOP (20)
  CAST(document.[INSTALLMENT_ID] AS bigint) AS [INSTALLMENT_ID],
  CAST(document.[CONTRACT_ID] AS bigint) AS [CONTRACT_ID],
  CAST(document.[FINDOC] AS bigint) AS [FINDOC],
  CAST(invoice.[FINCODE] AS nchar(64)) AS [INVOICE_NUMBER],
  CAST(document.[TRDR] AS bigint) AS [TRDR],
  CAST(customer.[NAME] AS nchar(191)) AS [CUSTOMER_NAME],
  CAST(document.[VESSEL_ID] AS bigint) AS [VESSEL_ID],
  CAST(vessel.[NAME] AS nchar(191)) AS [VESSEL_NAME],
  document.[INSTALLMENT_DATE],
  document.[INSTALLMENT_VALUE],
  terms.[DUE_DATE],
  terms.[OUTSTANDING],
  document.[ASSIGNMENT_COUNT]
FROM installment_documents AS document
INNER JOIN open_terms AS terms
  ON terms.[FINDOC] = document.[FINDOC]
INNER JOIN [dbo].[FINDOC] AS invoice
  ON invoice.[FINDOC] = document.[FINDOC]
LEFT JOIN [dbo].[TRDR] AS customer
  ON customer.[TRDR] = document.[TRDR]
LEFT JOIN [dbo].[CCCCUSTSHIP] AS vessel
  ON vessel.[CCCCUSTSHIP] = document.[VESSEL_ID]
WHERE terms.[OUTSTANDING] > 0.005
ORDER BY
  CASE WHEN terms.[DUE_DATE] < CAST(GETDATE() AS date) THEN 0 ELSE 1 END,
  terms.[DUE_DATE],
  document.[FINDOC]`;

function numberValue(row: SourceRow, field: string) {
  const value = Number(row[field]);
  if (!Number.isFinite(value)) {
    throw new Error(`SoftOne contract installment result has invalid ${field}.`);
  }
  return value;
}

function optionalText(row: SourceRow, field: string) {
  return String(row[field] ?? "").trim() || null;
}

function optionalNumber(row: SourceRow, field: string) {
  if (row[field] == null || String(row[field]).trim() === "") return null;
  return numberValue(row, field);
}

async function loadPreview(pool: ConnectionPool) {
  const summaryResult = await querySoftOneWithWatchdog<SourceRow>(
    pool,
    softOneContractInstallmentSummaryQuery,
    "contract installment summary",
  );
  const summary = summaryResult.recordset[0];
  if (!summary) throw new Error("SoftOne returned no contract installment summary.");
  const previewResult = await querySoftOneWithWatchdog<SourceRow>(
    pool,
    softOneContractInstallmentPreviewQuery,
    "contract installment preview",
  );
  return {
    activeInstallmentRows: numberValue(summary, "ACTIVE_INSTALLMENT_ROWS"),
    distinctInvoices: numberValue(summary, "DISTINCT_INVOICES"),
    duplicateInvoices: numberValue(summary, "DUPLICATE_INVOICES"),
    withCustomer: numberValue(summary, "WITH_CUSTOMER"),
    withVessel: numberValue(summary, "WITH_VESSEL"),
    openInvoices: numberValue(summary, "OPEN_INVOICES"),
    overdueInvoices: numberValue(summary, "OVERDUE_INVOICES"),
    openAmount: numberValue(summary, "OPEN_AMOUNT"),
    overdueAmount: numberValue(summary, "OVERDUE_AMOUNT"),
    preview: previewResult.recordset.map(row => ({
      installmentId: numberValue(row, "INSTALLMENT_ID"),
      contractId: numberValue(row, "CONTRACT_ID"),
      findoc: numberValue(row, "FINDOC"),
      invoiceNumber: optionalText(row, "INVOICE_NUMBER"),
      customerSoftoneId: optionalNumber(row, "TRDR"),
      customerName: optionalText(row, "CUSTOMER_NAME"),
      vesselId: optionalNumber(row, "VESSEL_ID"),
      vesselName: optionalText(row, "VESSEL_NAME"),
      installmentDate: row.INSTALLMENT_DATE,
      installmentValue: numberValue(row, "INSTALLMENT_VALUE"),
      dueDate: row.DUE_DATE,
      outstanding: numberValue(row, "OUTSTANDING"),
      assignmentCount: numberValue(row, "ASSIGNMENT_COUNT"),
    })),
  };
}

export async function inspectSoftOneContractInstallments() {
  if (!isSoftOneSqlConfigured()) throw new Error("SoftOne SQL is not configured.");
  let pool: ConnectionPool | null = null;
  try {
    pool = await openSoftOneSqlPool();
    return await loadPreview(pool);
  } catch (error) {
    throw new Error(softOneSqlError(error, "inspect contract installments"));
  } finally {
    await pool?.close().catch(() => undefined);
  }
}
