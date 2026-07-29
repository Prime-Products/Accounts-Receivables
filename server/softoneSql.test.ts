import { describe, expect, it } from "vitest";
import {
  normalizeSoftOneCustomerRows,
  softOneGroupNamesQuery,
  softOneCustomersQuery,
} from "./lib/softoneSql";

const sourceRow = {
  TRDR: 101,
  MASTERTRDR: 100,
  TRDGROUP: 10,
  NAME: " Customer A ",
  LBAL: "120.50",
  LTURNOVR: 500,
  LTURNOVRLY: 450,
  LTURNOVRLYLY: 400,
  Uncovered: null,
  Unpaid: 12,
  Overdue: 30,
  OVERDUEMONTHVAL: 42,
  DAYSAVG: 8.5,
  OpenOrders: 2,
  OrdersAmount: 80,
  Collections: 75,
};

describe("SoftOne read-only SQL sync", () => {
  it("normalizes the approved CustomerGroupFinData fields", () => {
    const [record] = normalizeSoftOneCustomerRows([sourceRow], new Date("2026-07-28T00:00:00Z"));
    expect(record).toMatchObject({
      code: "101",
      name: "Customer A",
      softoneId: "101",
      masterSoftoneId: "100",
      customerGroup: "10",
      balance: "120.5000",
      collections: "75.0000",
    });
  });

  it("rejects duplicate identifiers and malformed values", () => {
    expect(() => normalizeSoftOneCustomerRows([sourceRow, sourceRow])).toThrow(/duplicate TRDR/);
    expect(() => normalizeSoftOneCustomerRows([{ ...sourceRow, LBAL: "bad" }])).toThrow(/LBAL/);
  });

  it("resolves a numeric group reference to the master customer name", () => {
    const masterRow = {
      ...sourceRow,
      TRDR: 100,
      MASTERTRDR: 100,
      TRDGROUP: 10,
      NAME: "Group Alpha",
    };
    const records = normalizeSoftOneCustomerRows([sourceRow, masterRow]);
    expect(records[0].customerGroup).toBe("Group Alpha");
  });

  it("uses the group name returned by the separate read-only dbo.TRDR query", () => {
    const [record] = normalizeSoftOneCustomerRows(
      [sourceRow],
      new Date(),
      new Map([["100", "External Master Group"]]),
    );
    expect(record.customerGroup).toBe("External Master Group");
  });

  it("keeps NAME last for the production unixODBC driver", () => {
    expect(softOneCustomersQuery.indexOf("CAST([NAME]")).toBeGreaterThan(
      softOneCustomersQuery.indexOf("[Collections]"),
    );
    expect(softOneGroupNamesQuery.indexOf("CAST(master.[NAME]")).toBeGreaterThan(
      softOneGroupNamesQuery.indexOf("master.[TRDR]"),
    );
  });
});
