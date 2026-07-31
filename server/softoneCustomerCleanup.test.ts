import { describe, expect, it } from "vitest";
import {
  cleanupPreviewLimit,
  findStaleSoftOneCustomers,
  selectCleanupPreviewRows,
  type SoftOneCleanupCustomer,
  validateSoftOneCustomerSyncEvidence,
} from "./lib/softoneCustomerCleanup";

const latestSync = new Date("2026-07-31T08:00:00Z");

const customers: SoftOneCleanupCustomer[] = [
  {
    id: 1,
    code: "C-1",
    name: "Valid customer",
    customerGroup: "External",
    softoneId: "101",
    softoneSyncedAt: latestSync,
  },
  {
    id: 2,
    code: "S-1",
    name: "LOUKIS ATHANASIOS",
    customerGroup: "Suppliers",
    softoneId: "202",
    softoneSyncedAt: new Date("2026-07-30T08:00:00Z"),
  },
  {
    id: 3,
    code: "P-1",
    name: "Prime Products branch",
    customerGroup: "PRIME PRODUCTS",
    softoneId: "303",
    softoneSyncedAt: null,
  },
  {
    id: 4,
    code: "MANUAL",
    name: "Manual customer",
    customerGroup: null,
    softoneId: null,
    softoneSyncedAt: null,
  },
];

describe("SoftOne ineligible customer cleanup planning", () => {
  it("selects only imported rows outside the latest successful sync batch", () => {
    const result = findStaleSoftOneCustomers(customers, latestSync);

    expect(result.map(customer => customer.softoneId)).toEqual(["202", "303"]);
  });

  it("supports a bounded, case-insensitive preview search", () => {
    const ineligible = findStaleSoftOneCustomers(customers, latestSync);

    expect(selectCleanupPreviewRows(ineligible, "loukis", 200)).toEqual([
      expect.objectContaining({ softoneId: "202" }),
    ]);
    expect(selectCleanupPreviewRows(ineligible, "prime products", 1)).toEqual([
      expect.objectContaining({ softoneId: "303" }),
    ]);
  });

  it("uses a safe preview limit", () => {
    expect(cleanupPreviewLimit(undefined)).toBe(200);
    expect(cleanupPreviewLimit("500")).toBe(500);
    expect(cleanupPreviewLimit("0")).toBe(200);
    expect(cleanupPreviewLimit("501")).toBe(200);
  });

  it("requires the latest timestamp batch to match a recent successful log", () => {
    expect(
      validateSoftOneCustomerSyncEvidence({
        syncedAt: latestSync,
        synchronizedCustomers: 10_685,
        logCreatedAt: new Date("2026-07-31T08:01:00Z"),
        loggedCustomers: 10_685,
      }),
    ).toMatchObject({ synchronizedCustomers: 10_685 });
    expect(() =>
      validateSoftOneCustomerSyncEvidence({
        syncedAt: latestSync,
        synchronizedCustomers: 10_684,
        logCreatedAt: new Date("2026-07-31T08:01:00Z"),
        loggedCustomers: 10_685,
      }),
    ).toThrow(/count does not match/i);
    expect(() =>
      validateSoftOneCustomerSyncEvidence({
        syncedAt: latestSync,
        synchronizedCustomers: 10_685,
        logCreatedAt: new Date("2026-07-31T10:00:00Z"),
        loggedCustomers: 10_685,
      }),
    ).toThrow(/does not align/i);
  });
});
