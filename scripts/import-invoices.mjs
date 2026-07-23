/**
 * One-off import of the user's real open invoices Excel into the AR database.
 * Usage: node scripts/import-invoices.mjs /path/to/file.xlsx
 */
import "dotenv/config";
import ExcelJS from "exceljs";
import mysql from "mysql2/promise";

const FILE = process.argv[2] || "/home/ubuntu/upload/OPENINVOICESCUSTOMERS21.07.26FORAI.xlsx";

const CUR_MAP = { EURO: "EUR", DIRHAM: "AED", SGD: "SGD", USD: "USD" };

function slugCode(name, idx) {
  const base = name
    .normalize("NFD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase()
    .slice(0, 48);
  return `${base || "CUST"}-${String(idx).padStart(4, "0")}`;
}

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);
  const ws = wb.getWorksheet("Print") ?? wb.worksheets[0];

  const rows = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const v = i => row.getCell(i).value;
    const company = v(1), group = v(2), customer = v(3), doc = v(4);
    const issue = v(5), due = v(6), amount = v(7), cur = v(8);
    if (!customer || !doc || amount == null) return;
    rows.push({
      company: String(company ?? "").trim(),
      group: String(group ?? "").trim(),
      customer: String(customer).trim(),
      doc: String(doc).trim(),
      issue: issue instanceof Date ? issue.getTime() : new Date(issue).getTime(),
      due: due instanceof Date ? due.getTime() : new Date(due).getTime(),
      amount: Number(amount),
      currency: CUR_MAP[String(cur ?? "").trim()] ?? String(cur ?? "EUR").trim(),
    });
  });
  console.log(`Parsed ${rows.length} invoice rows`);

  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  // 1) Upsert customers (unique by name)
  const byName = new Map();
  for (const r of rows) {
    if (!byName.has(r.customer)) byName.set(r.customer, r.group);
  }
  const names = [...byName.keys()];
  console.log(`Unique customers: ${names.length}`);

  const [existing] = await conn.query("SELECT id, name FROM customers");
  const idByName = new Map(existing.map(r => [r.name, r.id]));

  let ci = idByName.size + 1;
  const toInsert = names.filter(n => !idByName.has(n));
  const BATCH = 200;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const chunk = toInsert.slice(i, i + BATCH);
    const values = chunk.map(n => [slugCode(n, ci++), n, byName.get(n) || null, "New", "0", 30]);
    await conn.query(
      "INSERT INTO customers (code, name, customerGroup, tier, creditLimit, paymentTermsDays) VALUES ?",
      [values],
    );
  }
  const [allCust] = await conn.query("SELECT id, name FROM customers");
  const cid = new Map(allCust.map(r => [r.name, r.id]));
  console.log(`Customers in DB: ${allCust.length}`);

  // 2) Insert invoices. invoiceNumber must be unique → prefix with a short company tag when duplicated.
  const companyTag = c => {
    if (/PTE/i.test(c)) return "SG";
    if (/FZC/i.test(c)) return "AE";
    if (/B\.V/i.test(c)) return "NL";
    if (/USA/i.test(c)) return "US";
    if (/P\.P\.D/i.test(c)) return "PPD";
    return "GR"; // Prime Products LTD
  };
  const seen = new Set();
  const [existingInv] = await conn.query("SELECT invoiceNumber FROM invoices");
  for (const r of existingInv) seen.add(r.invoiceNumber);

  const now = Date.now();
  let inserted = 0, skipped = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const values = [];
    for (const r of chunk) {
      let num = r.doc;
      if (seen.has(num)) num = `${companyTag(r.company)}-${r.doc}`;
      if (seen.has(num)) num = `${companyTag(r.company)}-${r.doc}-${inserted}`;
      seen.add(num);
      const customerId = cid.get(r.customer);
      if (!customerId || !Number.isFinite(r.issue) || !Number.isFinite(r.due)) {
        skipped++;
        continue;
      }
      const status = r.due < now ? "Overdue" : "Open";
      values.push([customerId, num, r.company, r.currency, r.issue, r.due, r.amount.toFixed(2), "0.00", status]);
    }
    if (values.length) {
      await conn.query(
        "INSERT INTO invoices (customerId, invoiceNumber, company, currency, issueDate, dueDate, amount, paidAmount, status) VALUES ?",
        [values],
      );
      inserted += values.length;
    }
  }
  console.log(`Invoices inserted: ${inserted}, skipped: ${skipped}`);

  const [[{ c: invCount }]] = await conn.query("SELECT COUNT(*) c FROM invoices");
  console.log(`Total invoices in DB: ${invCount}`);
  await conn.end();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
