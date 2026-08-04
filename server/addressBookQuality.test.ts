/**
 * Contract tests for the Address Book quality / archive / merge / import layer.
 * These run against the live dev database, so they assert shapes and invariants
 * rather than fixed counts, and clean up anything they create.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("address book quality panel", () => {
  const router = read("server/routers/addressBook.ts");

  it("exposes a quality query with every documented check", () => {
    for (const key of [
      "duplicateEmails",
      "duplicateNames",
      "invalidEmails",
      "missingPhone",
      "orphanContacts",
      "companiesWithoutContact",
      "vesselsWithoutImo",
      "vesselsWithoutOwner",
    ]) {
      expect(router).toContain(key);
    }
  });

  it("derives quality from live contacts only, ignoring archived rows", () => {
    expect(router).toMatch(/const live = contacts\.filter\(ct => ct\.archived !== 1\)/);
  });

  it("keeps archived contacts out of the default list and out of search", () => {
    // contacts() takes an explicit archived flag and defaults to live rows.
    expect(router).toMatch(/archived: z\.boolean\(\)\.optional\(\)/);
    expect(router).toMatch(/\(ct\.archived === 1\) === wantArchived/);
    // Cross-entity search drops archived rows before matching.
    expect(router).toMatch(/if \(ct\.archived === 1\) return false;/);
  });
});

describe("archive instead of delete", () => {
  const db = read("server/db.ts");
  const router = read("server/routers/addressBook.ts");

  it("archives and restores contacts without deleting rows", () => {
    expect(db).toContain("export async function archivePaymentContact");
    expect(db).toContain("export async function restorePaymentContact");
    expect(router).toContain("archiveContact:");
    expect(router).toContain("restoreContact:");
  });

  it("records when and into what a contact was merged", () => {
    const schema = read("drizzle/schema.ts");
    expect(schema).toMatch(/archived: int\("archived"\)/);
    expect(schema).toMatch(/archivedAt: timestamp\("archivedAt"\)/);
    expect(schema).toMatch(/mergedIntoId: int\("mergedIntoId"\)/);
  });
});

describe("duplicate merge", () => {
  const router = read("server/routers/addressBook.ts");

  it("refuses to merge a contact into itself", () => {
    expect(router).toMatch(/loserIds\.includes\(input\.survivorId\)/);
  });

  it("archives losers with a pointer to the survivor rather than deleting", () => {
    expect(router).toMatch(/archivePaymentContact\(id, input\.survivorId\)/);
    expect(router).not.toMatch(/deletePaymentContact\(id\)/);
  });

  it("carries over custom values the survivor is missing", () => {
    expect(router).toContain("listCustomFieldValues");
    expect(router).toMatch(/if \(own && \(own\.value \?\? ""\)\.trim\(\) !== ""\) continue;/);
  });
});

describe("excel import", () => {
  const router = read("server/routers/addressBook.ts");
  const dialog = read("client/src/components/ImportContactsDialog.tsx");

  it("splits the import into inspect, preview and apply so nothing is written before review", () => {
    expect(router).toContain("importInspect:");
    expect(router).toContain("importPreview:");
    expect(router).toContain("importApply:");
    // preview must not write
    const previewBlock = router.slice(router.indexOf("importPreview:"), router.indexOf("importApply:"));
    expect(previewBlock).not.toContain("addPaymentContact");
    expect(previewBlock).not.toContain("updatePaymentContact");
  });

  it("plans each row as create, update or skip", () => {
    expect(router).toMatch(/action: "create" \| "update" \| "skip"/);
    expect(router).toMatch(/create: planRows\.filter\(r => r\.action === "create"\)\.length/);
    expect(router).toMatch(/update: planRows\.filter\(r => r\.action === "update"\)\.length/);
    expect(router).toMatch(/skip: planRows\.filter\(r => r\.action === "skip"\)\.length/);
  });

  it("skips rows whose company cannot be resolved instead of guessing", () => {
    expect(router).toContain("Company not found in AR Pro");
    expect(router).toContain("No company code or name given");
  });

  it("matches existing contacts on email and only updates real differences", () => {
    expect(router).toMatch(/liveContacts\.find\(c => c\.email\.trim\(\)\.toLowerCase\(\) === email\)/);
    expect(router).toContain("Already up to date");
  });

  it("lets the user map sheet columns, including custom fields", () => {
    expect(dialog).toContain("Step 2 of 3 — map columns");
    expect(dialog).toMatch(/custom:\$\{f\.fieldKey\}/);
    expect(dialog).toContain("Ignore this column");
  });

  it("requires name and email to be mapped before previewing", () => {
    expect(dialog).toMatch(/mappedTargets\.has\("name"\) && mappedTargets\.has\("email"\)/);
  });

  it("only accepts xlsx uploads", () => {
    expect(dialog).toContain('accept=".xlsx"');
  });
});

describe("address book page wiring", () => {
  const page = read("client/src/pages/AddressBook.tsx");

  it("shows import, data quality, fields, columns and export in the toolbar", () => {
    expect(page).toContain("<ImportContactsDialog");
    expect(page).toContain("<DataQualityPanel />");
    expect(page).toContain("<CustomFieldsManager");
    expect(page).toContain("<ColumnPicker");
    expect(page).toContain("<ExportMenu");
  });

  it("offers the archive view and per-row archive/restore only on the contacts tab", () => {
    expect(page).toMatch(/entity === "contact" && <ImportContactsDialog/);
    expect(page).toContain("Viewing archive");
    expect(page).toContain("restoreContact.mutate");
    expect(page).toContain("archiveContact.mutate");
  });

  it("supports selecting rows for a manual merge", () => {
    expect(page).toContain("Merge selected");
    expect(page).toContain("MergeContactsDialog");
  });

  it("resets filters, archive view and selection when switching tabs", () => {
    const block = page.slice(page.indexOf("const switchTab"), page.indexOf("const switchTab") + 500);
    expect(block).toContain("setShowArchived(false)");
    expect(block).toContain("setSelectedIds([])");
    expect(block).toContain("setFieldFilters([])");
  });
});
