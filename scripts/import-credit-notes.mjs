/**
 * Import the open (unmatched) credit notes parsed from PRIMELTD_OPENCNs.xlsx.
 *
 * Input: /home/ubuntu/open_credit_notes.json (one object per credit note)
 * Matching: ERP code (customers.code) first, then exact company name, then
 *           normalized company name. Unmatched rows are reported, never guessed.
 * Never runs automatic allocation against invoices.
 *
 * Usage: node import_credit_notes.mjs [--apply]
 */
import fs from "node:fs";
import "dotenv/config";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const ROWS = JSON.parse(fs.readFileSync("/home/ubuntu/open_credit_notes.json", "utf8"));

/** Excel branch label → the `company` value used on invoices. */
const BRANCH_TO_COMPANY = {
  GREECE: "Prime Products LTD",
  SINGAPORE: "Prime Products Distribution(s) PTE LTD",
  UAE: "Prime Products Distribution FZC LTD",
  BV: "Prime Products Distribution B.V",
  CY: "P.P.D. Prime Products Distribution Ltd",
  USA: "Prime Products Distribution USA LLC",
};

const CURRENCY = { EURO: "EUR", SGD: "SGD", "UAE Dirham": "AED", USD: "USD" };

const norm = s =>
  (s ?? "")
    .toUpperCase()
    .replace(/[.,]/g, " ")
    .replace(/\b(INC|LTD|LIMITED|CORP|CORPORATION|S\s*A|SA|CO|COMPANY|LLC|PTE|BV|FZC|GMBH)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// FX rates from app settings (same source the app uses).
const [fxRows] = await conn.execute(
  "SELECT `key`, `value` FROM app_settings WHERE `key` LIKE 'fx.%'"
);
const fx = { EUR: 1 };
for (const r of fxRows) {
  const cur = r.key.slice(3).toUpperCase();
  const v = Number(r.value);
  if (Number.isFinite(v) && v > 0) fx[cur] = v;
}
for (const [c, d] of Object.entries({ USD: 0.92, AED: 0.25, SGD: 0.68 })) {
  if (!fx[c]) fx[c] = d;
}
console.log("FX rates used:", fx);

const [customers] = await conn.execute("SELECT id, code, name, customerGroup FROM customers");
const byCode = new Map(customers.map(c => [String(c.code).trim(), c]));
const byName = new Map();
const byNorm = new Map();
for (const c of customers) {
  const n = String(c.name).trim().toUpperCase();
  if (!byName.has(n)) byName.set(n, c);
  const k = norm(c.name);
  if (k && !byNorm.has(k)) byNorm.set(k, c);
}

const [vessels] = await conn.execute("SELECT id, name FROM vessels");
const vesselByName = new Map(vessels.map(v => [String(v.name).trim().toUpperCase(), v.id]));

const stats = { byCode: 0, byName: 0, byNorm: 0, created: 0 };

function resolve(r) {
  let cust = byCode.get(String(r.erpCode).trim());
  if (cust) return [cust, "byCode"];
  cust = byName.get(String(r.companyName ?? "").trim().toUpperCase());
  if (cust) return [cust, "byName"];
  cust = byNorm.get(norm(r.companyName));
  if (cust) return [cust, "byNorm"];
  return [null, null];
}

// Pass 1 — resolve against the existing customer list.
const unresolved = [];
for (const r of ROWS) {
  const [cust, how] = resolve(r);
  if (cust) {
    r._customer = cust;
    stats[how]++;
  } else {
    unresolved.push(r);
  }
}

// Pass 2 (opt-in, --create-missing) — companies that only exist in the credit-note
// export can be created so no open credit note is dropped. Off by default: the
// export also contains our own intercompany accounts (PRIME PRODUCTS group), which
// must not appear as customers.
if (APPLY && process.argv.includes("--create-missing")) {
  const toCreate = new Map();
  for (const r of unresolved) {
    const key = String(r.companyName).trim().toUpperCase();
    if (!toCreate.has(key)) toCreate.set(key, r);
  }
  for (const [key, r] of toCreate) {
    const slug =
      String(r.companyName)
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "CN";
    const code = `${slug}-CN${r.erpCode}`;
    const [res] = await conn.execute(
      "INSERT INTO customers (code, name, customerGroup) VALUES (?, ?, ?)",
      [code, String(r.companyName).trim(), r.groupName ? String(r.groupName).trim() : null]
    );
    const created = { id: res.insertId, code, name: r.companyName };
    byName.set(key, created);
    const nk = norm(r.companyName);
    if (nk && !byNorm.has(nk)) byNorm.set(nk, created);
    stats.created++;
  }
  for (const r of unresolved) {
    r._customer = byName.get(String(r.companyName).trim().toUpperCase()) ?? null;
  }
}

const matched = [];
const unmatched = [];
for (const r of ROWS) {
  const cust = r._customer;
  if (!cust) {
    unmatched.push(r);
    continue;
  }
  const currency = CURRENCY[r.currency] ?? r.currency;
  const openAbs = Math.abs(Number(r.openAmount ?? 0));
  const amountAbs = Math.abs(Number(r.transaction ?? r.openAmount ?? 0));
  const rate = fx[currency] ?? 1;
  matched.push({
    customerId: cust.id,
    docNumber: r.docNumber,
    docDate: Date.parse(`${r.docDate}T00:00:00Z`),
    branch: BRANCH_TO_COMPANY[r.branch] ?? r.branch,
    currency,
    amount: amountAbs.toFixed(2),
    openAmount: openAbs.toFixed(2),
    openAmountEur: (openAbs * rate).toFixed(2),
    vesselId: r.vessel ? vesselByName.get(String(r.vessel).trim().toUpperCase()) ?? null : null,
    contractNo: r.contractNo ? String(r.contractNo) : null,
    vesselName: r.vessel ?? null,
  });
}

console.log(`rows=${ROWS.length} matched=${matched.length} unmatched=${unmatched.length}`, stats);
if (unmatched.length) {
  const byCompany = new Map();
  for (const u of unmatched) {
    const k = `${u.companyName}  [ERP ${u.erpCode}, group: ${u.groupName}]`;
    byCompany.set(k, (byCompany.get(k) ?? 0) + Math.abs(Number(u.openAmount ?? 0)));
  }
  console.log(
    `\nNOT IN THE CUSTOMER LIST — ${byCompany.size} companies / ${unmatched.length} credit notes:`
  );
  for (const [k, v] of [...byCompany].sort((a, b) => b[1] - a[1]))
    console.log(`  ${v.toFixed(2).padStart(12)}  ${k}`);
}

const totals = {};
for (const m of matched) {
  totals[m.currency] = +( (totals[m.currency] ?? 0) + Number(m.openAmount) ).toFixed(2);
}
const eurTotal = matched.reduce((s, m) => s + Number(m.openAmountEur), 0);
console.log("\nopen credit totals per currency:", totals, "EUR equivalent:", eurTotal.toFixed(2));

const missingVessel = matched.filter(m => m.vesselName && !m.vesselId);
console.log(`credit notes with a vessel name not in the registry: ${missingVessel.length}`);

if (!APPLY) {
  console.log("\nDry run — pass --apply to write to the database.");
  await conn.end();
  process.exit(0);
}

// Create the missing vessels so credit notes show up in the by-vessel view.
for (const m of missingVessel) {
  const key = String(m.vesselName).trim().toUpperCase();
  if (vesselByName.has(key)) {
    m.vesselId = vesselByName.get(key);
    continue;
  }
  const [res] = await conn.execute(
    "INSERT INTO vessels (name, customerId) VALUES (?, ?)",
    [String(m.vesselName).trim(), m.customerId]
  );
  vesselByName.set(key, res.insertId);
  m.vesselId = res.insertId;
}
console.log(`vessels created: ${new Set(missingVessel.map(m => m.vesselName)).size}`);

await conn.execute("DELETE FROM credit_notes");
let inserted = 0;
for (const m of matched) {
  await conn.execute(
    `INSERT INTO credit_notes
       (customerId, docNumber, docDate, branch, currency, amount, openAmount, openAmountEur, vesselId, contractNo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      m.customerId,
      m.docNumber,
      m.docDate,
      m.branch,
      m.currency,
      m.amount,
      m.openAmount,
      m.openAmountEur,
      m.vesselId,
      m.contractNo,
    ]
  );
  inserted++;
}
console.log(`inserted ${inserted} credit notes`);

const [check] = await conn.execute(
  "SELECT currency, COUNT(*) n, ROUND(SUM(openAmount),2) tot, ROUND(SUM(openAmountEur),2) eur FROM credit_notes GROUP BY currency"
);
console.log(check);
await conn.end();
