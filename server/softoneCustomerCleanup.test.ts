import { describe, expect, it } from "vitest";
import {
  cleanupPreviewLimit,
  findIneligibleSoftOneCustomers,
  selectCleanupPreviewRows,
  type SoftOneCleanupCustomer,
} from "./lib/softoneCustomerCleanup";

const customers: SoftOneCleanupCustomer[] = [
  {
    id: 1,
    code: "C-1",
    name: "Valid customer",
    customerGroup: "External",
    softoneId: "101",
  },
  {
    id: 2,
    code: "S-1",
    name: "LOUKIS ATHANASIOS",
    customerGroup: "Suppliers",
    softoneId: "202",
  },
  {
    id: 3,
    code: "P-1",
    name: "Prime Products branch",
    customerGroup: "PRIME PRODUCTS",
    softoneId: "303",
  },
  {
    id: 4,
    code: "MANUAL",
    name: "Manual customer",
    customerGroup: null,
    softoneId: null,
  },
];

describe("SoftOne ineligible customer cleanup planning", () => {
  it("selects only imported rows absent from current eligible membership", () => {
    const result = findIneligibleSoftOneCustomers(
      customers,
      new Set(["101"]),
    );

    expect(result.map(customer => customer.softoneId)).toEqual(["202", "303"]);
  });

  it("supports a bounded, case-insensitive preview search", () => {
    const ineligible = findIneligibleSoftOneCustomers(
      customers,
      new Set(["101"]),
    );

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
});
