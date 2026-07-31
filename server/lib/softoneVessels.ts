import type { ConnectionPool } from "mssql";
import * as db from "../db";
import {
  isSoftOneSqlConfigured,
  openSoftOneSqlPool,
  querySoftOneWithWatchdog,
  softOneSqlError,
} from "./softoneSql";

type SourceRow = Record<string, unknown>;
const MAX_VESSELS = 50_000;

export const softOneVesselsQuery = `SELECT
  CAST(vessel.[CCCCUSTSHIP] AS bigint) AS [VESSEL_ID],
  CAST(vessel.[TRDR] AS bigint) AS [TRDR],
  CAST(vessel.[CODE] AS nchar(64)) AS [CODE],
  CAST(vessel.[NAME] AS nchar(191)) AS [VESSEL_NAME],
  CAST(vessel.[INNUM] AS nchar(32)) AS [IMO],
  CAST(vessel.[CCCSHIPTYPE] AS nchar(64)) AS [VESSEL_TYPE],
  CAST(owner.[NAME] AS nchar(191)) AS [OWNER_NAME]
FROM [dbo].[CCCCUSTSHIP] AS vessel
INNER JOIN [dbo].[TRDR] AS owner
  ON owner.[TRDR] = vessel.[TRDR]
WHERE vessel.[ISACTIVE] = 1
  AND owner.[COMPANY] = 1
  AND owner.[SODTYPE] = 13
  AND owner.[ISACTIVE] = 1
  AND owner.[TRDGROUP] IS NOT NULL
  AND owner.[TRDGROUP] <> 473
ORDER BY vessel.[CCCCUSTSHIP]`;

function requiredInteger(row: SourceRow, field: string) {
  const value = Number(row[field]);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`SoftOne vessel row has invalid ${field}.`);
  }
  return value;
}

function text(row: SourceRow, field: string) {
  return String(row[field] ?? "").trim();
}

export function normalizeSoftOneVessels(rows: SourceRow[]) {
  if (rows.length > MAX_VESSELS) throw new Error("SoftOne vessel row limit exceeded.");
  const ids = new Set<number>();
  return rows.map(row => {
    const id = requiredInteger(row, "VESSEL_ID");
    if (ids.has(id)) throw new Error(`SoftOne returned duplicate vessel id ${id}.`);
    ids.add(id);
    const name = text(row, "VESSEL_NAME") || text(row, "CODE");
    if (!name) throw new Error(`SoftOne vessel ${id} has no name.`);
    return {
      id,
      customerSoftoneId: String(requiredInteger(row, "TRDR")),
      name,
      imo: text(row, "IMO") || null,
      vesselType: text(row, "VESSEL_TYPE") || null,
      ownerName: text(row, "OWNER_NAME") || null,
    };
  });
}

async function loadSoftOneVessels(pool: ConnectionPool) {
  const result = await querySoftOneWithWatchdog<SourceRow>(
    pool,
    softOneVesselsQuery,
    "vessel registry",
  );
  return normalizeSoftOneVessels(result.recordset);
}

export async function inspectSoftOneVessels() {
  if (!isSoftOneSqlConfigured()) throw new Error("SoftOne SQL is not configured.");
  let pool: ConnectionPool | null = null;
  try {
    pool = await openSoftOneSqlPool();
    const records = await loadSoftOneVessels(pool);
    return { total: records.length, preview: records.slice(0, 20) };
  } catch (error) {
    throw new Error(softOneSqlError(error, "query vessel registry"));
  } finally {
    await pool?.close().catch(() => undefined);
  }
}

export async function syncSoftOneVessels() {
  if (process.env.SOFTONE_SQL_VESSEL_SYNC_ENABLED !== "true") {
    throw new Error("SoftOne SQL vessel synchronization is disabled.");
  }
  if (!isSoftOneSqlConfigured()) throw new Error("SoftOne SQL is not configured.");
  let pool: ConnectionPool | null = null;
  try {
    pool = await openSoftOneSqlPool();
    const records = await loadSoftOneVessels(pool);
    const result = await db.upsertSoftOneVessels(records);
    await db.addSyncLog({
      direction: "Pull",
      entityType: "vessels",
      recordCount: result.synced,
      status: "Success",
      message: `Read-only SQL sync upserted ${result.synced} vessels`,
    });
    return result;
  } catch (error) {
    throw new Error(softOneSqlError(error, "synchronize vessels"));
  } finally {
    await pool?.close().catch(() => undefined);
  }
}
