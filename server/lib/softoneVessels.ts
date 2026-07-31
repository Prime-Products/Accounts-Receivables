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

export function buildSoftOneVesselOwnerQuery(softoneId: number) {
  if (!Number.isSafeInteger(softoneId) || softoneId <= 0) {
    throw new Error("Invalid SoftOne vessel owner identifier.");
  }
  return `SELECT
  CAST(owner.[TRDR] AS bigint) AS [TRDR],
  CAST(owner.[CODE] AS nchar(64)) AS [CODE],
  CAST(owner.[NAME] AS nchar(191)) AS [OWNER_NAME],
  CAST(owner_group.[NAME] AS nchar(191)) AS [GROUP_NAME]
FROM [dbo].[TRDR] AS owner
LEFT JOIN [dbo].[TRDGROUP] AS owner_group
  ON owner_group.[TRDGROUP] = owner.[TRDGROUP]
WHERE owner.[TRDR] = ${softoneId}
  AND owner.[COMPANY] = 1
  AND owner.[SODTYPE] = 13
  AND owner.[ISACTIVE] = 1
  AND owner.[TRDGROUP] IS NOT NULL
  AND owner.[TRDGROUP] <> 473`;
}

export const softOneVesselsQuery = `SELECT
  CAST(vessel.[CCCCUSTSHIP] AS bigint) AS [VESSEL_ID],
  CAST(vessel.[TRDR] AS bigint) AS [TRDR],
  CAST(vessel.[CODE] AS nchar(64)) AS [CODE],
  CAST(vessel.[NAME] AS nchar(191)) AS [VESSEL_NAME],
  CAST(vessel.[INNUM] AS nchar(32)) AS [IMO],
  CAST(vessel.[CCCSHIPTYPE] AS nchar(64)) AS [VESSEL_TYPE],
  CAST(owner.[NAME] AS nchar(191)) AS [OWNER_NAME],
  CAST(CASE WHEN EXISTS (
    SELECT 1
    FROM [dbo].[CCCPRJCVESSEL] AS contract_vessel
    INNER JOIN [dbo].[CCCPRJC] AS contract
      ON contract.[CCCPRJC] = contract_vessel.[CCCPRJC]
    WHERE contract_vessel.[CCCCUSTSHIP] = vessel.[CCCCUSTSHIP]
      AND contract.[ACTIVE247] = 1
  ) THEN 1 ELSE 0 END AS int) AS [HAS_ACTIVE_CONTRACT]
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
      hasActiveContract: Number(row.HAS_ACTIVE_CONTRACT) === 1,
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
    const withActiveContract = records.filter(record => record.hasActiveContract).length;
    return {
      total: records.length,
      withActiveContract,
      withoutActiveContract: records.length - withActiveContract,
      preview: records.slice(0, 20),
    };
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

/** Insert one explicitly approved, eligible SoftOne vessel owner into Hub only. */
export async function syncSoftOneVesselOwner(softoneId: number) {
  if (process.env.SOFTONE_SQL_VESSEL_OWNER_SYNC_ENABLED !== "true") {
    throw new Error("SoftOne SQL vessel owner synchronization is disabled.");
  }
  if (!isSoftOneSqlConfigured()) throw new Error("SoftOne SQL is not configured.");
  let pool: ConnectionPool | null = null;
  try {
    pool = await openSoftOneSqlPool();
    const result = await querySoftOneWithWatchdog<SourceRow>(
      pool,
      buildSoftOneVesselOwnerQuery(softoneId),
      `approved vessel owner ${softoneId}`,
    );
    if (result.recordset.length !== 1) {
      throw new Error(
        `SoftOne vessel owner ${softoneId} was not found or is not an eligible active customer.`,
      );
    }
    const row = result.recordset[0];
    const ownerName = text(row, "OWNER_NAME");
    if (!ownerName) throw new Error(`SoftOne vessel owner ${softoneId} has no name.`);
    await db.insertMissingSoftOneCustomers([{
      code: text(row, "CODE") || String(softoneId),
      name: ownerName,
      customerGroup: text(row, "GROUP_NAME") || ownerName,
      masterSoftoneId: null,
      softoneId: String(softoneId),
      softoneSyncedAt: new Date(),
    }]);
    return { softoneId, name: ownerName };
  } catch (error) {
    throw new Error(softOneSqlError(error, `synchronize approved vessel owner ${softoneId}`));
  } finally {
    await pool?.close().catch(() => undefined);
  }
}
