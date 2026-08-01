/**
 * Column-filter logic for the Address Book. The matcher lives in a plain
 * function so it can be tested without a DOM: it reads values through the
 * column definitions, which is what lets custom fields be filtered exactly like
 * ERP columns.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyFieldFilters,
  opNeedsValue,
  type FieldFilter,
} from "../client/src/components/AddressBookFilters";
import { appRouter } from "./routers";

type Row = { recordKey: string; name: string; group: string; overdue: number; custom: Record<string, string> };

const rows: Row[] = [
  { recordKey: "1", name: "MSC Shipmanagement", group: "MSC", overdue: 1200, custom: { region: "Piraeus" } },
  { recordKey: "2", name: "Maersk A/S", group: "MAERSK", overdue: 0, custom: { region: "" } },
  { recordKey: "3", name: "Costamare Inc", group: "COSTAMARE", overdue: 540, custom: { region: "Athens" } },
];

const columns = [
  { key: "name", label: "Name", value: (r: Row) => r.name },
  { key: "group", label: "Group", value: (r: Row) => r.group },
  { key: "overdue", label: "Overdue", value: (r: Row) => r.overdue },
  { key: "custom:region", label: "Region", value: (r: Row) => r.custom.region ?? "" },
] as any;

const f = (key: string, op: FieldFilter["op"], value = ""): FieldFilter => ({ key, op, value });

describe("address book column filters", () => {
  it("returns every row when no filter carries a value", () => {
    expect(applyFieldFilters(rows, [], columns)).toHaveLength(3);
    expect(applyFieldFilters(rows, [f("name", "contains", "  ")], columns)).toHaveLength(3);
  });

  it("matches substrings case-insensitively", () => {
    const res = applyFieldFilters(rows, [f("name", "contains", "maersk")], columns);
    expect(res.map(r => r.recordKey)).toEqual(["2"]);
  });

  it("matches exact values with `is`", () => {
    expect(applyFieldFilters(rows, [f("group", "equals", "msc")], columns).map(r => r.recordKey)).toEqual(["1"]);
    expect(applyFieldFilters(rows, [f("group", "equals", "MS")], columns)).toHaveLength(0);
  });

  it("compares numbers for greater/less than", () => {
    expect(applyFieldFilters(rows, [f("overdue", "gt", "500")], columns).map(r => r.recordKey)).toEqual(["1", "3"]);
    expect(applyFieldFilters(rows, [f("overdue", "lt", "600")], columns).map(r => r.recordKey)).toEqual(["2", "3"]);
  });

  it("finds empty and non-empty custom field values", () => {
    expect(applyFieldFilters(rows, [f("custom:region", "empty")], columns).map(r => r.recordKey)).toEqual(["2"]);
    expect(applyFieldFilters(rows, [f("custom:region", "notEmpty")], columns).map(r => r.recordKey)).toEqual(["1", "3"]);
  });

  it("treats an em dash placeholder as empty", () => {
    const dashRows = [{ recordKey: "x", name: "—", group: "", overdue: 0, custom: {} }] as Row[];
    expect(applyFieldFilters(dashRows, [f("name", "empty")], columns)).toHaveLength(1);
  });

  it("ANDs multiple conditions", () => {
    const res = applyFieldFilters(
      rows,
      [f("overdue", "gt", "100"), f("custom:region", "contains", "athens")],
      columns,
    );
    expect(res.map(r => r.recordKey)).toEqual(["3"]);
  });

  it("ignores filters pointing at a column that no longer exists", () => {
    expect(applyFieldFilters(rows, [f("custom:gone", "contains", "x")], columns)).toHaveLength(3);
  });

  it("knows which operators need a value", () => {
    expect(opNeedsValue("contains")).toBe(true);
    expect(opNeedsValue("empty")).toBe(false);
    expect(opNeedsValue("notEmpty")).toBe(false);
  });
});

describe("address book card field visibility", () => {
  const ctx = { user: { id: 1, role: "admin" as const }, req: {} as any, res: {} as any };
  const caller = appRouter.createCaller(ctx as any);

  it("hides a field on cards without deleting it or its values", async () => {
    const { id, fieldKey } = await caller.addressBook.createField({
      entity: "group",
      label: `Card visibility ${Date.now()}`,
      fieldType: "text",
    });
    const groups = await caller.addressBook.groups();
    const recordKey = groups[0].recordKey;
    await caller.addressBook.setFieldValue({ fieldId: id, recordKey, value: "kept" });

    const before = await caller.addressBook.recordFields({ entity: "group", recordKey });
    expect(before.some(x => x.id === id)).toBe(true);

    // Hiding is stored as a per-user card layout.
    await caller.addressBook.saveLayout({ listKey: "address-book-card-group", hidden: [fieldKey], order: [] });
    const after = await caller.addressBook.recordFields({ entity: "group", recordKey });
    expect(after.some(x => x.id === id)).toBe(false);

    // The definition and the stored value survive; the list column still shows it.
    const listed = await caller.addressBook.groups();
    expect(listed.find(g => g.recordKey === recordKey)?.custom[fieldKey]).toBe("kept");

    // Clean up so the next run starts from a visible card.
    await caller.addressBook.saveLayout({ listKey: "address-book-card-group", hidden: [], order: [] });
    await caller.addressBook.archiveField({ id });
  });
});

describe("address book filter wiring", () => {
  const page = readFileSync(join(__dirname, "..", "client/src/pages/AddressBook.tsx"), "utf8");

  it("renders the filter bar and applies it to the list", () => {
    expect(page).toContain("<FieldFilterBar");
    expect(page).toContain("applyFieldFilters(base, fieldFilters, allColumns)");
  });

  it("stores filters inside saved views", () => {
    expect(page).toContain("filters: fieldFilters");
    expect(page).toContain("setFieldFilters(c.filters ?? [])");
  });
});
