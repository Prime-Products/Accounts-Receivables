/**
 * Person vs Department contacts.
 *
 * A department is a shared mailbox (accounts@, ops@) rather than a named human.
 * These specs lock in the classification helpers, the two-value schema default
 * and the places in the UI where a department must be recognisable.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  looksLikeDepartmentEmail,
  looksLikeDepartmentName,
  normalizeContactType,
  importTargets,
} from "./routers/addressBook";
import { contactTypes } from "../drizzle/schema";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("contact type vocabulary", () => {
  it("offers exactly two types, with Person first as the default", () => {
    expect(contactTypes).toEqual(["Person", "Department"]);
  });

  it("defaults the column to Person so existing contacts are unaffected", () => {
    const schema = read("drizzle/schema.ts");
    expect(schema).toMatch(/contactType:\s*mysqlEnum\("contactType",\s*contactTypes\)[\s\S]*?default\("Person"\)/);
  });
});

describe("normalizeContactType", () => {
  it("treats an empty cell as a person", () => {
    expect(normalizeContactType("")).toBe("Person");
    expect(normalizeContactType(null)).toBe("Person");
    expect(normalizeContactType(undefined)).toBe("Person");
  });

  it("recognises department spellings, including Greek and abbreviations", () => {
    for (const raw of ["Department", "department", " DEPT ", "dpt", "Τμήμα", "τμημα", "shared", "team"]) {
      expect(normalizeContactType(raw)).toBe("Department");
    }
  });

  it("keeps anything person-like as a person", () => {
    for (const raw of ["Person", "individual", "Maria", "contact person"]) {
      expect(normalizeContactType(raw)).toBe("Person");
    }
  });
});

describe("looksLikeDepartmentEmail", () => {
  it("flags generic finance and operations mailboxes", () => {
    for (const email of [
      "accounts@shipping.gr",
      "ar@owner.com",
      "finance@group.com",
      "invoices@charterer.gr",
      "ops@fleet.com",
      "purchasing@yard.com",
      "info@company.gr",
    ]) {
      expect(looksLikeDepartmentEmail(email)).toBe(true);
    }
  });

  it("splits on separators so accounts.dept and ops-piraeus are caught", () => {
    expect(looksLikeDepartmentEmail("accounts.dept@x.gr")).toBe(true);
    expect(looksLikeDepartmentEmail("ops-piraeus@x.gr")).toBe(true);
    expect(looksLikeDepartmentEmail("ar_gr@x.gr")).toBe(true);
  });

  it("leaves personal addresses alone", () => {
    for (const email of ["maria.papadopoulou@x.gr", "kostas@x.gr", "jsmith@x.com", ""]) {
      expect(looksLikeDepartmentEmail(email)).toBe(false);
    }
  });
});

describe("looksLikeDepartmentName", () => {
  it("flags names that read as a department", () => {
    expect(looksLikeDepartmentName("Accounts Department")).toBe(true);
    expect(looksLikeDepartmentName("Finance Dept")).toBe(true);
    expect(looksLikeDepartmentName("Λογιστήριο Τμήμα")).toBe(true);
    expect(looksLikeDepartmentName("Accounts Payable")).toBe(true);
  });

  it("leaves human names alone", () => {
    expect(looksLikeDepartmentName("Maria Papadopoulou")).toBe(false);
    expect(looksLikeDepartmentName("")).toBe(false);
  });
});

describe("suggestions never auto-apply", () => {
  const router = read("server/routers/addressBook.ts");

  it("only suggests contacts that are still filed as people", () => {
    expect(router).toMatch(/departmentSuggestions[\s\S]{0,400}contactType\s*\?\?\s*"Person"\)\s*===\s*"Person"/);
  });

  it("exposes both a single and a batched retype mutation", () => {
    expect(router).toContain("setContactType: protectedProcedure");
    expect(router).toContain("setContactTypeBulk: protectedProcedure");
    // Bulk must be one statement, not a per-id loop.
    expect(router).toContain("db.setPaymentContactTypeBulk(input.ids, input.contactType)");
  });

  it("counts people and departments separately in the quality totals", () => {
    expect(router).toContain("people:");
    expect(router).toContain("departments:");
  });
});

describe("import wizard", () => {
  it("can map a sheet column onto the type", () => {
    expect(importTargets.some(t => t.key === "contactType")).toBe(true);
    expect(importTargets.find(t => t.key === "contactType")?.required).toBe(false);
  });
});

describe("UI surfaces the distinction", () => {
  it("shows a Type column and a Person/Department filter in the Address Book", () => {
    const page = read("client/src/pages/AddressBook.tsx");
    expect(page).toContain('key: "contactType"');
    expect(page).toContain('label: "Type"');
    expect(page).toContain('<SelectItem value="Department">Departments only</SelectItem>');
    expect(page).toContain('<SelectItem value="Person">People only</SelectItem>');
  });

  it("offers bulk retype from the contacts selection bar", () => {
    const page = read("client/src/pages/AddressBook.tsx");
    expect(page).toContain("Mark as department");
    expect(page).toContain("Mark as person");
  });

  it("lets the contact form choose a type and adapts its labels", () => {
    const dialog = read("client/src/components/ContactFormDialog.tsx");
    expect(dialog).toContain('useState<"Person" | "Department">');
    expect(dialog).toContain("Shared mailbox, e.g. accounts@");
    expect(dialog).toContain("Department name *");
    expect(dialog).toContain("contactType,");
  });

  it("marks departments in the email recipient picker and sorts them first", () => {
    const email = read("client/src/components/SendEmailDialog.tsx");
    expect(email).toContain("orderedContacts");
    expect(email).toMatch(/Dept\s*<\/span>/);
    expect(email).toContain('contactType === "Department"');
  });

  it("shows the type on the contact record card", () => {
    const card = read("client/src/components/AddressBookRecordDialog.tsx");
    expect(card).toMatch(/FieldRow label="Type"/);
    // Editable straight from the card, saved immediately (badge-field convention).
    expect(card).toContain("trpc.addressBook.setContactType.useMutation");
    expect(card).toContain("Department (shared mailbox)");
  });

  it("marks departments in the Log Call contact picker", () => {
    const logCall = read("client/src/components/LogCallDialog.tsx");
    expect(logCall).toContain("· department");
  });

  it("carries the type through a duplicate merge", () => {
    const merge = read("client/src/components/MergeContactsDialog.tsx");
    expect(merge).toContain('{ key: "contactType", label: "Type" }');
    expect(merge).toContain('pickedValue("contactType")');
  });
});
