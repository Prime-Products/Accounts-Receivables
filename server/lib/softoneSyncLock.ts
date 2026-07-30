import { createConnection, type RowDataPacket } from "mysql2/promise";

export const SOFTONE_SYNC_LOCK_NAME = "ar_pro:softone:read_only_sync";

function requireDatabaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error("DATABASE_URL is required for the synchronization lock.");
  return value;
}

async function openLockConnection() {
  return createConnection(requireDatabaseUrl());
}

export async function isSoftOneSyncRunning() {
  const connection = await openLockConnection();
  try {
    const [rows] = await connection.query<RowDataPacket[]>(
      "SELECT IS_USED_LOCK(?) AS holder",
      [SOFTONE_SYNC_LOCK_NAME],
    );
    return rows[0]?.holder != null;
  } finally {
    await connection.end();
  }
}

export async function withSoftOneSyncLock<T>(work: () => Promise<T>) {
  const connection = await openLockConnection();
  let acquired = false;
  try {
    const [rows] = await connection.query<RowDataPacket[]>(
      "SELECT GET_LOCK(?, 0) AS acquired",
      [SOFTONE_SYNC_LOCK_NAME],
    );
    acquired = Number(rows[0]?.acquired) === 1;
    if (!acquired) return { acquired: false as const };
    return { acquired: true as const, result: await work() };
  } finally {
    if (acquired) {
      await connection
        .query("SELECT RELEASE_LOCK(?)", [SOFTONE_SYNC_LOCK_NAME])
        .catch(() => undefined);
    }
    await connection.end().catch(() => undefined);
  }
}
