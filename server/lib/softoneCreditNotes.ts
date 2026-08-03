import type { SoftOneCreditNoteUpsert } from "../db";
import * as db from "../db";
import { toEur } from "./arLogic";
import {
  buildSoftOneOpenInvoiceDocumentsQuery,
  normalizeSoftOneCurrencyName,
  softOneCompaniesQuery,
  softOneCurrenciesQuery,
} from "./softoneInvoices";
import { isSoftOneSqlConfigured, querySoftOneWithFreshPool, softOneSqlError } from "./softoneSql";

type SourceRow = Record<string, unknown>;
// The production unixODBC driver can raise HY010/Function sequence errors on
// result sets of 100 rows even when every selected value is fixed-width. Keep
// credit-note pages deliberately small and retain fresh-connection keyset reads.
const PAGE_SIZE = 25;
const MAX_PAGES = 2_000;
const LOOKUP_BATCH = 250;

function yearSetting() {
  const year = Number(process.env.SOFTONE_SQL_CREDIT_NOTE_YEAR ?? "2026");
  if (!Number.isSafeInteger(year) || year < 2000 || year > 2100) throw new Error("Invalid SoftOne credit-note year.");
  return year;
}

function inspectionMonthSetting() {
  const raw = process.env.SOFTONE_SQL_CREDIT_NOTE_MONTH?.trim();
  if (!raw) return undefined;
  const month = Number(raw);
  if (!Number.isSafeInteger(month) || month < 1 || month > 12) throw new Error("Invalid SoftOne credit-note inspection month.");
  return month;
}

function numberValue(row: SourceRow, key: string) {
  const value = Number(row[key]);
  if (!Number.isFinite(value)) throw new Error(`SoftOne credit note has invalid ${key}.`);
  return value;
}

function identity(row: SourceRow, key: string) {
  const value = String(row[key] ?? "").trim();
  if (!value) throw new Error(`SoftOne credit note has empty ${key}.`);
  return value;
}

function dateKeyToUtc(value: unknown) {
  const text = String(value ?? "");
  if (!/^\d{8}$/.test(text)) throw new Error("SoftOne credit note has invalid document date.");
  return Date.UTC(Number(text.slice(0, 4)), Number(text.slice(4, 6)) - 1, Number(text.slice(6, 8)));
}

/** Greece, export and special credit-note series supplied by the SoftOne operator. */
export function buildSoftOneCreditNotesQuery(afterFindoc: number, year = 2026, month?: number) {
  if (!Number.isSafeInteger(afterFindoc) || afterFindoc < 0) throw new Error("Invalid SoftOne credit-note cursor.");
  if (!Number.isSafeInteger(year) || year < 2000 || year > 2100) throw new Error("Invalid SoftOne credit-note year.");
  if (month !== undefined && (!Number.isSafeInteger(month) || month < 1 || month > 12)) throw new Error("Invalid SoftOne credit-note month.");
  const startMonth = String(month ?? 1).padStart(2, "0");
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = String(month === undefined ? 1 : month === 12 ? 1 : month + 1).padStart(2, "0");
  const rangeStart = `${year}${startMonth}01`;
  const rangeEnd = month === undefined ? `${year + 1}0101` : `${nextYear}${nextMonth}01`;
  return `SELECT TOP (${PAGE_SIZE})
  CAST(document.[FINDOC] AS bigint) AS [FINDOC],
  CAST(document.[TRDR] AS bigint) AS [TRDR],
  CAST(document.[COMPANY] AS int) AS [COMPANY],
  CAST(document.[CCCCUSTSHIP] AS bigint) AS [VESSEL_ID],
  CAST(document.[SOCURRENCY] AS int) AS [SOCURRENCY],
  CAST(CONVERT(char(8), document.[TRNDATE], 112) AS int) AS [DOC_DATE],
  CAST(document.[SERIES] AS bigint) AS [SERIES],
  ABS(CAST(COALESCE(document.[SUMAMNT], 0) AS float)) AS [AMOUNT],
  ABS(CAST(COALESCE((
    SELECT SUM(terms.[OPNTAMNT] * terms.[PAYDEMANDMD])
    FROM [dbo].[FINPAYTERMS] AS terms
    WHERE terms.[COMPANY] = document.[COMPANY]
      AND terms.[FINDOC] = document.[FINDOC]
      AND terms.[ISCANCEL] = 0
      AND terms.[APPRV] = 1
      AND terms.[PAYDEMANDMD] IN (-1, 1)
  ), 0) AS float)) AS [OPEN_AMOUNT]
FROM [dbo].[FINDOC] AS document
WHERE document.[COMPANY] = 1
  AND document.[SODTYPE] = 13
  AND document.[ISCANCEL] = 0
  AND document.[TRNDATE] >= '${rangeStart}'
  AND document.[TRNDATE] < '${rangeEnd}'
  AND document.[FINDOC] > ${afterFindoc}
  AND (
    (document.[SOSOURCE] = 1351
      AND document.[SOREDIR] = 0
      AND document.[FULLYTRANSF] IN (0, 2)
      AND document.[SERIES] IN (7062, 7063, 7064, 7066, 7069, 7070, 7072, 7109, 7111, 7164, 7166, 7169, 7170, 7186, 7209, 7211))
    OR
    (document.[SOSOURCE] = 1353
      AND document.[SERIES] IN (4301, 4302, 4303, 4304, 4308, 6651))
  )
ORDER BY document.[FINDOC]`;
}

export function normalizeSoftOneCreditNotes(
  rows: SourceRow[],
  documents: Map<string, string>,
  companies: Map<string, string>,
  currencies: Map<string, string>,
) {
  const seen = new Set<string>();
  return rows.map(row => {
    const softoneId = identity(row, "FINDOC");
    if (seen.has(softoneId)) throw new Error(`SoftOne returned duplicate credit note ${softoneId}.`);
    seen.add(softoneId);
    const docNumber = documents.get(softoneId);
    const branch = companies.get(identity(row, "COMPANY"));
    const currencyName = currencies.get(identity(row, "SOCURRENCY"));
    if (!docNumber || !branch || !currencyName) throw new Error(`SoftOne credit note ${softoneId} has incomplete lookup data.`);
    const sourceAmount = Math.round(numberValue(row, "AMOUNT") * 100) / 100;
    const sourceOpen = Math.round(numberValue(row, "OPEN_AMOUNT") * 100) / 100;
    const amount = Math.max(sourceAmount, sourceOpen);
    const openAmount = Math.min(amount, Math.max(0, sourceOpen));
    if (amount <= 0) throw new Error(`SoftOne credit note ${softoneId} has invalid amount.`);
    const currency = normalizeSoftOneCurrencyName(currencyName);
    return {
      customerSoftoneId: identity(row, "TRDR"),
      docNumber,
      softoneId,
      docDate: dateKeyToUtc(row.DOC_DATE),
      branch,
      currency,
      amount: amount.toFixed(2),
      openAmount: openAmount.toFixed(2),
      openAmountEur: toEur(openAmount, currency).toFixed(2),
      vesselId: numberValue(row, "VESSEL_ID") > 0 ? numberValue(row, "VESSEL_ID") : null,
      notes: `SoftOne series ${identity(row, "SERIES")}`,
    } satisfies SoftOneCreditNoteUpsert;
  });
}

async function load(onProgress: (stage: string) => void, month?: number) {
  const rows: SourceRow[] = [];
  let cursor = 0;
  const year = yearSetting();
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const label = `credit-note source page ${page} after FINDOC ${cursor}`;
    onProgress(label);
    const result = await querySoftOneWithFreshPool<SourceRow>(buildSoftOneCreditNotesQuery(cursor, year, month), label);
    if (result.recordset.length === 0) break;
    rows.push(...result.recordset);
    const next = Math.max(...result.recordset.map(row => numberValue(row, "FINDOC")));
    if (next <= cursor) throw new Error("SoftOne credit-note pagination did not advance.");
    cursor = next;
    if (result.recordset.length < PAGE_SIZE) break;
    if (page === MAX_PAGES) throw new Error("SoftOne credit-note page limit exceeded.");
  }
  if (rows.length === 0) {
    if (month !== undefined) return [];
    throw new Error("SoftOne returned no credit notes.");
  }
  const findocs = rows.map(row => identity(row, "FINDOC"));
  const documentRows: SourceRow[] = [];
  for (let index = 0; index < findocs.length; index += LOOKUP_BATCH) {
    const label = `credit-note document lookup batch ${Math.floor(index / LOOKUP_BATCH) + 1}`;
    onProgress(label);
    const result = await querySoftOneWithFreshPool<SourceRow>(buildSoftOneOpenInvoiceDocumentsQuery(findocs.slice(index, index + LOOKUP_BATCH)), label);
    documentRows.push(...result.recordset);
  }
  onProgress("credit-note company lookup");
  const companyRows = await querySoftOneWithFreshPool<SourceRow>(softOneCompaniesQuery, "credit-note company lookup");
  onProgress("credit-note currency lookup");
  const currencyRows = await querySoftOneWithFreshPool<SourceRow>(softOneCurrenciesQuery, "credit-note currency lookup");
  return normalizeSoftOneCreditNotes(
    rows,
    new Map(documentRows.map(row => [identity(row, "FINDOC"), identity(row, "FINCODE")])),
    new Map(companyRows.recordset.map(row => [identity(row, "COMPANY"), identity(row, "NAME")])),
    new Map(currencyRows.recordset.map(row => [identity(row, "SOCURRENCY"), identity(row, "NAME")])),
  );
}

function summary(records: SoftOneCreditNoteUpsert[], month?: number) {
  const open = records.filter(record => Number(record.openAmount) >= Number(record.amount) - 0.005).length;
  const used = records.filter(record => Number(record.openAmount) <= 0.005).length;
  return { year: yearSetting(), month, total: records.length, open, partial: records.length - open - used, used,
    openAmount: records.reduce((sum, record) => sum + Number(record.openAmount), 0), preview: records.slice(0, 20) };
}

export async function inspectSoftOneCreditNotes(onProgress: (stage: string) => void = () => undefined) {
  if (!isSoftOneSqlConfigured()) throw new Error("SoftOne SQL is not configured.");
  let stage = "connect";
  try {
    const month = inspectionMonthSetting();
    return summary(await load(value => { stage = value; onProgress(value); }, month), month);
  }
  catch (error) { throw new Error(softOneSqlError(error, stage)); }
}

export async function syncSoftOneCreditNotes(onProgress: (stage: string) => void = () => undefined) {
  if (process.env.SOFTONE_SQL_CREDIT_NOTE_SYNC_ENABLED !== "true") throw new Error("SoftOne SQL credit-note synchronization is disabled.");
  if (!isSoftOneSqlConfigured()) throw new Error("SoftOne SQL is not configured.");
  let stage = "connect";
  try {
    const records = await load(value => { stage = value; onProgress(value); });
    stage = "upsert Hub credit notes";
    const result = await db.upsertSoftOneCreditNotes(records);
    await db.addSyncLog({ direction: "Pull", entityType: "credit-notes", recordCount: result.synced, status: "Success", message: `Read-only SQL sync upserted ${result.synced} credit notes` });
    return { ...summary(records), synced: result.synced };
  } catch (error) { throw new Error(softOneSqlError(error, stage)); }
}
