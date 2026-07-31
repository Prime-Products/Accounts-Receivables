/**
 * Imports the cleaned contact records produced by scripts/build_contacts_import.py
 * into the payment_contacts table.
 *
 * Idempotent: a contact is skipped when the same (customerId, email) pair already
 * exists, so the script can be re-run after a partial failure or a data refresh.
 *
 * Usage: npx tsx scripts/import-contacts.ts [--dry-run]
 */
import { readFileSync } from "fs";
import { listAllPaymentContacts, addPaymentContactsBulk, listCustomers } from "../server/db";

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
  const records: Record[] = JSON.parse(readFileSync("/tmp/contacts_import.json", "utf8"));
  const [existing, customers] = await Promise.all([listAllPaymentContacts(), listCustomers()]);

  const validIds = new Set(customers.map(c => c.id));
  const seen = new Set(existing.map(c => `${c.customerId}|${c.email.toLowerCase()}`));

  const toInsert: { customerId: number; name: string; email: string; phone?: string; title?: string }[] = [];
  let skippedExisting = 0;
  let skippedBadCustomer = 0;

  for (const r of records) {
    if (!validIds.has(r.customerId)) {
      skippedBadCustomer++;
      continue;
    }
    const key = `${r.customerId}|${r.email.toLowerCase()}`;
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
