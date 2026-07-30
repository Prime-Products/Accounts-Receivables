import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createConnection: vi.fn(),
  query: vi.fn(),
  end: vi.fn(),
}));

vi.mock("mysql2/promise", () => ({
  createConnection: mocks.createConnection,
}));

import { isSoftOneSyncRunning, SOFTONE_SYNC_LOCK_NAME, withSoftOneSyncLock } from "./lib/softoneSyncLock";

describe("SoftOne synchronization lock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DATABASE_URL = "mysql://test:test@localhost/test";
    mocks.createConnection.mockResolvedValue({
      query: mocks.query,
      end: mocks.end,
    });
    mocks.end.mockResolvedValue(undefined);
  });

  it("runs the work and releases the lock when it is available", async () => {
    mocks.query
      .mockResolvedValueOnce([[{ acquired: 1 }]])
      .mockResolvedValueOnce([[{ released: 1 }]]);
    const work = vi.fn().mockResolvedValue(42);

    await expect(withSoftOneSyncLock(work)).resolves.toEqual({
      acquired: true,
      result: 42,
    });

    expect(work).toHaveBeenCalledOnce();
    expect(mocks.query).toHaveBeenNthCalledWith(
      1,
      "SELECT GET_LOCK(?, 0) AS acquired",
      [SOFTONE_SYNC_LOCK_NAME],
    );
    expect(mocks.query).toHaveBeenNthCalledWith(
      2,
      "SELECT RELEASE_LOCK(?)",
      [SOFTONE_SYNC_LOCK_NAME],
    );
    expect(mocks.end).toHaveBeenCalledOnce();
  });

  it("does not run the work when another process holds the lock", async () => {
    mocks.query.mockResolvedValueOnce([[{ acquired: 0 }]]);
    const work = vi.fn();

    await expect(withSoftOneSyncLock(work)).resolves.toEqual({ acquired: false });

    expect(work).not.toHaveBeenCalled();
    expect(mocks.query).toHaveBeenCalledOnce();
    expect(mocks.end).toHaveBeenCalledOnce();
  });

  it("reports whether a synchronization is already running", async () => {
    mocks.query.mockResolvedValueOnce([[{ holder: 123 }]]);

    await expect(isSoftOneSyncRunning()).resolves.toBe(true);
    expect(mocks.query).toHaveBeenCalledWith(
      "SELECT IS_USED_LOCK(?) AS holder",
      [SOFTONE_SYNC_LOCK_NAME],
    );
  });
});
