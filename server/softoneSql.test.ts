import { describe, expect, it } from "vitest";
import {
  buildSoftOneEntityTypesQuery,
  buildSoftOneCustomerFinancialsQuery,
  buildSoftOneCustomersQuery,
  buildSoftOneCustomerGroupNamesQuery,
  buildSoftOneCustomerNamesQuery,
  normalizeSoftOneCustomerRows,
  softOneCustomerGroupNamesQuery,
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
      customerGroup: "Customer A",
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
      new Map([
        ["10", "External Customer Group"],
        ["100", "External Master Group"],
      ]),
      new Map([["10", "SoftOne TRDGROUP Name"]]),
    );
    expect(record.customerGroup).toBe("SoftOne TRDGROUP Name");
  });

  it("keeps names separate from financials for the production unixODBC driver", () => {
    expect(softOneCustomersQuery).not.toContain("[NAME]");
    expect(softOneCustomersQuery).toContain(
      "CAST(customer.[TRDGROUP] AS bigint) AS [TRDGROUP]",
    );
    expect(softOneCustomersQuery).toContain("customer.[ISACTIVE] = 1");
    expect(softOneCustomersQuery).toContain(
      "FROM [dbo].[TRDR] AS customer",
    );
    expect(softOneCustomersQuery).not.toContain("CustomerGroupFinData");
    expect(softOneCustomersQuery).toContain("TOP (500)");
    expect(softOneCustomersQuery).toContain("customer.[TRDR] > 0");
    expect(softOneCustomersQuery).toContain(
      "customer.[TRDGROUP] IS NOT NULL",
    );
    expect(softOneCustomersQuery).toContain("customer.[TRDGROUP] <> 473");
    expect(softOneGroupNamesQuery).toContain(
      "CAST(master.[NAME] AS nchar(128))",
    );
    expect(softOneGroupNamesQuery).toContain(
      "CAST(master.[TRDR] AS bigint)",
    );
    expect(softOneGroupNamesQuery).not.toContain("nvarchar");
    expect(softOneCustomerGroupNamesQuery).toContain(
      "FROM [dbo].[TRDGROUP] AS customer_group",
    );
    expect(buildSoftOneCustomerGroupNamesQuery(["10"])).not.toContain(
      "customer_group.[CODE]",
    );
  });

  it("builds bounded numeric name lookups for the unixODBC driver", () => {
    expect(buildSoftOneCustomerNamesQuery(["101", "100"])).toContain(
      "customer.[TRDR] IN (101, 100)",
    );
    expect(buildSoftOneCustomerGroupNamesQuery(["10"])).toContain(
      "customer_group.[TRDGROUP] IN (10)",
    );
    expect(buildSoftOneCustomerFinancialsQuery(["101", "102"])).toContain(
      "source.[TRDR] IN (101, 102)",
    );
    expect(buildSoftOneCustomerFinancialsQuery(["101", "102"])).toContain(
      "CAST(source.[LBAL] AS float)",
    );
    expect(buildSoftOneEntityTypesQuery(["101", "202"])).toContain(
      "entity.[TRDR] IN (101, 202)",
    );
    expect(buildSoftOneEntityTypesQuery(["101"])).toContain(
      "entity.[SODTYPE]",
    );
    expect(() =>
      buildSoftOneCustomerNamesQuery(["1); DROP TABLE TRDR"]),
    ).toThrow(/invalid.*identifiers/i);
  });

  it("builds safe keyset pages for active grouped customers", () => {
    expect(buildSoftOneCustomersQuery(12000)).toContain(
      "customer.[TRDR] > 12000",
    );
    expect(() => buildSoftOneCustomersQuery(-1)).toThrow(
      /invalid.*cursor/i,
    );
  });
});
