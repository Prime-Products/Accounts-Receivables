/**
 * Imports the cleaned contact records produced by scripts/build_contacts_import.py
 * into the payment_contacts table.
 *
 * Idempotent: a contact is skipped when the same (customerId, name) pair already
 * exists, so the script can be re-run after a partial failure or a data refresh.
 * Pass --replace to delete the previously imported rows first (used when the
 * cleaning rules change and the whole set has to be rebuilt).
 *
 * Usage: npx tsx scripts/import-contacts.ts [--dry-run] [--replace]
 */
import { readFileSync } from "fs";
import { listAllPaymentContacts, addPaymentContactsBulk, listCustomers, deletePaymentContact } from "../server/db";

type Record = {
  customerId: number;
  name: string;
  email: string;
  phone: string | null;
  title: string | null;
  company: string;
  group: string;
};

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const replace = process.argv.includes("--replace");
  const records: Record[] = JSON.parse(readFileSync("/tmp/contacts_import.json", "utf8"));
  let [existing, customers] = await Promise.all([listAllPaymentContacts(), listCustomers()]);

  if (replace && !dryRun) {
    // Keep contacts created by hand in the app; only clear the ERP-imported ones.
    const manualIds = new Set([90001]);
    const toDelete = existing.filter(c => !manualIds.has(c.id));
    for (const c of toDelete) await deletePaymentContact(c.id);
    console.log(JSON.stringify({ deleted: toDelete.length }));
    existing = await listAllPaymentContacts();
  }

  const validIds = new Set(customers.map(c => c.id));
  const seen = new Set(existing.map(c => `${c.customerId}|${c.name.trim().toUpperCase()}`));

  const toInsert: { customerId: number; name: string; email: string; phone?: string; title?: string }[] = [];
  let skippedExisting = 0;
  let skippedBadCustomer = 0;

  for (const r of records) {
    if (!validIds.has(r.customerId)) {
      skippedBadCustomer++;
      continue;
    }
    const key = `${r.customerId}|${r.name.trim().toUpperCase()}`;
    if (seen.has(key)) {
      skippedExisting++;
      continue;
    }
    seen.add(key);
    toInsert.push({
      customerId: r.customerId,
      name: r.name,
      email: r.email,
      ...(r.phone ? { phone: r.phone } : {}),
      ...(r.title ? { title: r.title } : {}),
    });
  }

  console.log(
    JSON.stringify({
      inputRecords: records.length,
      alreadyInDb: existing.length,
      skippedExisting,
      skippedBadCustomer,
      toInsert: toInsert.length,
      groups: new Set(records.map(r => r.group)).size,
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
