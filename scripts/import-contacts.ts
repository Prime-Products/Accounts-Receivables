/**
 * Imports the cleaned contact records produced by scripts/build_contacts_import.py
 * into the payment_contacts table.
 *
 * The Excel is Prime's full CRM, while the AR `customers` table only holds parties
 * with an open balance. Companies missing from AR are therefore created here as
 * *directory-only* customers: real companies with no invoices, excluded from the
 * Collections views (`hasLedger === false`) but available for contacts and search.
 *
 * Idempotent: a contact is skipped when the same (customerId, name) pair already
 * exists, so the script can be re-run after a partial failure or a data refresh.
 * Pass --replace to delete the previously imported rows first (used when the
 * cleaning rules change and the whole set has to be rebuilt).
 *
 * Usage: npx tsx scripts/import-contacts.ts [--dry-run] [--replace]
 */
import { readFileSync } from "fs";
import {
  listAllPaymentContacts,
  addPaymentContactsBulk,
  listCustomers,
  deletePaymentContact,
  createCustomersBulk,
} from "../server/db";

type Contact = {
  customerId: number;
  name: string;
  email: string;
  phone: string | null;
  title: string | null;
  company: string;
  group: string;
};

type NewCompany = { placeholderId: number; name: string; erpCode: string | null };

type Payload = { newCompanies: NewCompany[]; contacts: Contact[] };

/** Mirrors the slug style of the existing ERP-synced customer codes. */
function toCode(name: string, seq: number) {
  const slug = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${slug || "COMPANY"}-C${String(seq).padStart(4, "0")}`.slice(0, 64);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const replace = process.argv.includes("--replace");
  const payload: Payload = JSON.parse(readFileSync("/tmp/contacts_import.json", "utf8"));
  const { newCompanies, contacts } = payload;
  let [existing, customers] = await Promise.all([listAllPaymentContacts(), listCustomers()]);

  if (replace && !dryRun) {
    // Keep contacts created by hand in the app; only clear the ERP-imported ones.
    const manualIds = new Set([90001]);
    const toDelete = existing.filter(c => !manualIds.has(c.id));
    for (const c of toDelete) await deletePaymentContact(c.id);
    console.log(JSON.stringify({ deletedContacts: toDelete.length }));
    existing = await listAllPaymentContacts();
  }

  // ---- 1. Register directory-only companies -------------------------------
  const byName = new Map(customers.map(c => [c.name.trim().toUpperCase(), c.id]));
  const existingCodes = new Set(customers.map(c => c.code));
  const placeholderToReal = new Map<number, number>();
  const rowsToCreate: { code: string; name: string; customerGroup: string }[] = [];
  let reusedCompanies = 0;
  let seq = 1;

  for (const nc of newCompanies) {
    const hit = byName.get(nc.name.trim().toUpperCase());
    if (hit !== undefined) {
      placeholderToReal.set(nc.placeholderId, hit);
      reusedCompanies++;
      continue;
    }
    let code = toCode(nc.name, seq++);
    while (existingCodes.has(code)) code = toCode(nc.name, seq++);
    existingCodes.add(code);
    rowsToCreate.push({ code, name: nc.name, customerGroup: nc.name });
  }

  if (!dryRun && rowsToCreate.length > 0) {
    await createCustomersBulk(rowsToCreate);
    customers = await listCustomers();
    const refreshed = new Map(customers.map(c => [c.code, c.id]));
    let i = 0;
    for (const nc of newCompanies) {
      if (placeholderToReal.has(nc.placeholderId)) continue;
      const created = rowsToCreate[i++];
      const id = refreshed.get(created.code);
      if (id !== undefined) placeholderToReal.set(nc.placeholderId, id);
    }
    console.log(JSON.stringify({ companiesCreated: rowsToCreate.length, reusedCompanies }));
  }

  // ---- 2. Insert contacts --------------------------------------------------
  const validIds = new Set(customers.map(c => c.id));
  const seen = new Set(existing.map(c => `${c.customerId}|${c.name.trim().toUpperCase()}`));

  const toInsert: { customerId: number; name: string; email: string; phone?: string; title?: string }[] = [];
  let skippedExisting = 0;
  let skippedBadCustomer = 0;

  for (const r of contacts) {
    const customerId = r.customerId < 0 ? placeholderToReal.get(r.customerId) : r.customerId;
    if (customerId === undefined || !validIds.has(customerId)) {
      skippedBadCustomer++;
      continue;
    }
    const key = `${customerId}|${r.name.trim().toUpperCase()}`;
    if (seen.has(key)) {
      skippedExisting++;
      continue;
    }
    seen.add(key);
    toInsert.push({
      customerId,
      name: r.name,
      email: r.email,
      ...(r.phone ? { phone: r.phone } : {}),
      ...(r.title ? { title: r.title } : {}),
    });
  }

  console.log(
    JSON.stringify({
      inputContacts: contacts.length,
      newCompanies: newCompanies.length,
      companiesToCreate: rowsToCreate.length,
      alreadyInDb: existing.length,
      skippedExisting,
      skippedBadCustomer,
      toInsert: toInsert.length,
      groups: new Set(contacts.map(r => r.group)).size,
      customers: new Set(toInsert.map(r => r.customerId)).size,
    })
  );

  if (dryRun) {
    console.log("DRY RUN — nothing written. First 5 rows:");
    console.log(JSON.stringify(toInsert.slice(0, 5), null, 2));
    process.exit(0);
  }

  const inserted = await addPaymentContactsBulk(toInsert);
  const after = await listAllPaymentContacts();
  console.log(JSON.stringify({ inserted, totalContactsNow: after.length }));
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
