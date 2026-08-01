/**
 * Address Book contract tests.
 *
 * These cover the pieces that are easy to break silently: the custom-field
 * lifecycle (create → set value → archive keeps values), saved views, per-user
 * column layouts, the export payload builder, and the UI wiring that makes the
 * directory a single surface (four tabs, one card template, ERP-owned columns
 * marked read-only).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as db from "./db";
import { appRouter } from "./routers";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const ctx = { user: { id: 1, role: "admin" as const }, req: {} as any, res: {} as any };
const caller = appRouter.createCaller(ctx as any);

describe("address book router", () => {
  it("counts every entity in the directory", async () => {
    const counts = await caller.addressBook.counts();
    expect(counts.group).toBeGreaterThan(0);
    expect(counts.customer).toBeGreaterThan(0);
    expect(counts.vessel).toBeGreaterThan(0);
    expect(counts.contact).toBeGreaterThan(0);
  });

  it("returns a recordKey and a custom-value map on every list row", async () => {
    const [groups, customers, vessels, contacts] = await Promise.all([
      caller.addressBook.groups(),
      caller.addressBook.customers(),
      caller.addressBook.vessels(),
      caller.addressBook.contacts(),
    ]);
    for (const rows of [groups, customers, vessels, contacts]) {
      expect(rows.length).toBeGreaterThan(0);
      expect(typeof rows[0].recordKey).toBe("string");
      expect(rows[0].recordKey.length).toBeGreaterThan(0);
      expect(rows[0].custom).toBeTypeOf("object");
    }
    // Companies and vessels carry their group, so every tab can filter by group.
    expect(customers[0]).toHaveProperty("group");
    expect(vessels[0]).toHaveProperty("ownerGroup");
    expect(contacts[0]).toHaveProperty("group");
  });

  it("searches across all four entities at once", async () => {
    const res = await caller.addressBook.search({ query: "MSC" });
    expect(res).toHaveProperty("groups");
    expect(res).toHaveProperty("customers");
    expect(res).toHaveProperty("vessels");
    expect(res).toHaveProperty("contacts");
    const total = res.groups.length + res.customers.length + res.vessels.length + res.contacts.length;
    expect(total).toBeGreaterThan(0);
  });

  it("creates a custom field, stores a value, and keeps the value after archiving", async () => {
    const label = `Test field ${Date.now()}`;
    const { id, fieldKey } = await caller.addressBook.createField({
      entity: "vessel",
      label,
      fieldType: "text",
    });
    expect(fieldKey).toMatch(/^test_field_/);

    const vessels = await caller.addressBook.vessels();
    const recordKey = vessels[0].recordKey;
    await caller.addressBook.setFieldValue({ fieldId: id, recordKey, value: "Piraeus" });

    const onCard = await caller.addressBook.recordFields({ entity: "vessel", recordKey });
    expect(onCard.find(f => f.id === id)?.value).toBe("Piraeus");

    const listed = await caller.addressBook.vessels();
    expect(listed.find(v => v.recordKey === recordKey)?.custom[fieldKey]).toBe("Piraeus");

    // Archiving hides the field from the UI but preserves stored values.
    await caller.addressBook.archiveField({ id });
    const afterArchive = await caller.addressBook.fields({ entity: "vessel" });
    expect(afterArchive.some(f => f.id === id)).toBe(false);
    const values = await db.listCustomFieldValues("vessel", [recordKey]);
    expect(values.some(v => v.fieldId === id && v.value === "Piraeus")).toBe(true);
  });

  it("saves, lists and deletes a saved view", async () => {
    const name = `Test view ${Date.now()}`;
    const { id } = await caller.addressBook.saveView({
      entity: "contact",
      name,
      config: JSON.stringify({ search: "accounts", hidden: ["phone"] }),
    });
    const views = await caller.addressBook.views({ entity: "contact" });
    const mine = views.find(v => v.id === id);
    expect(mine?.name).toBe(name);
    expect(JSON.parse(mine!.config).search).toBe("accounts");
    await caller.addressBook.deleteView({ id });
    const after = await caller.addressBook.views({ entity: "contact" });
    expect(after.some(v => v.id === id)).toBe(false);
  });

  it("persists hidden columns and column order per user", async () => {
    const listKey = `test-layout-${Date.now()}`.slice(0, 60);
    await caller.addressBook.saveLayout({ listKey, hidden: ["phone"], order: ["name", "email", "phone"] });
    const layout = await caller.addressBook.layout({ listKey });
    expect(layout.hidden).toEqual(["phone"]);
    expect(layout.order).toEqual(["name", "email", "phone"]);
  });

  it("exports the requested columns in every offered format", async () => {
    const columns = [
      { header: "Name", key: "name" },
      { header: "Email", key: "email" },
    ];
    const rows = [{ name: "Δοκιμή ΑΕ", email: "test@example.com" }];
    const csv = await caller.addressBook.export({ title: "Test list", format: "csv", columns, rows });
    expect(csv.filename).toMatch(/\.csv$/);
    const decoded = Buffer.from(csv.base64, "base64").toString("utf8");
    // BOM keeps Greek characters readable when the file is opened in Excel.
    expect(decoded.startsWith("\uFEFF")).toBe(true);
    expect(decoded).toContain("Δοκιμή ΑΕ");

    const xlsx = await caller.addressBook.export({ title: "Test list", format: "xlsx", columns, rows });
    expect(xlsx.filename).toMatch(/\.xlsx$/);
    expect(xlsx.base64.length).toBeGreaterThan(100);

    const pdf = await caller.addressBook.export({ title: "Test list", format: "pdf", columns, rows });
    expect(pdf.filename).toMatch(/\.pdf$/);
    expect(Buffer.from(pdf.base64, "base64").subarray(0, 4).toString()).toBe("%PDF");
  });
});

describe("address book UI contract", () => {
  const page = read("client/src/pages/AddressBook.tsx");

  it("offers the four directory tabs", () => {
    for (const t of ['value: "group"', 'value: "customer"', 'value: "vessel"', 'value: "contact"']) {
      expect(page).toContain(t);
    }
  });

  it("keeps Fields, Columns, Export and saved views in the toolbar", () => {
    expect(page).toContain("<CustomFieldsManager");
    expect(page).toContain("<ColumnPicker");
    expect(page).toContain("<ExportMenu");
    expect(page).toContain("<SavedViewsBar");
  });

  it("exports only the visible columns and the filtered rows", () => {
    expect(page).toMatch(/<ExportMenu[\s\S]*?columns=\{columns\}[\s\S]*?rows=\{filtered\}/);
  });

  it("opens the shared record card from a row click", () => {
    expect(page).toContain("onRowClick");
    expect(page).toContain("<AddressBookRecordDialog");
  });

  it("marks ERP-owned columns read-only so the field picker can flag them", () => {
    expect(page).toContain("readOnly: true");
  });

  it("is reachable from the sidebar and keeps the legacy contacts path working", () => {
    expect(read("client/src/components/DashboardLayout.tsx")).toContain('label: "Address Book", path: "/address-book"');
    const app = read("client/src/App.tsx");
    expect(app).toContain('path={"/address-book"}');
    expect(app).toContain('path={"/contacts"}');
  });

  it("uses one card template for every entity, including relationships and custom fields", () => {
    const dialog = read("client/src/components/AddressBookRecordDialog.tsx");
    expect(dialog).toContain("<CustomFieldsBlock");
    expect(dialog).toContain("relatedCompanies");
    expect(dialog).toContain("relatedVessels");
    expect(dialog).toContain("relatedContacts");
    expect(dialog).toContain("Open in Collections Desk");
  });

  it("keeps the list header sticky and loads the first 100 rows only", () => {
    const table = read("client/src/components/AddressBookTable.tsx");
    expect(table).toContain('containerClassName="overflow-auto"');
    expect(table).toContain("sticky top-0");
    expect(table).toContain("pageSize = 100");
    expect(table).toContain("Show all");
  });
});
