// Dump all task/promise-related audit_logs rows to JSON for reconstruction analysis.
import "dotenv/config";
import mysql from "mysql2/promise";
import fs from "fs";

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.query(
  `SELECT id, userId, userName, action, entityType, entityId, details, createdAt
   FROM audit_logs
   WHERE entityType IN ('task','promiseToPay','promise')
   ORDER BY id ASC`
);
fs.writeFileSync("/home/ubuntu/audit_dump.json", JSON.stringify(rows, null, 1));
console.log("dumped", rows.length, "rows");
// Also dump distinct action/entityType combos
const combos = {};
for (const r of rows) combos[`${r.entityType}::${r.action}`] = (combos[`${r.entityType}::${r.action}`] ?? 0) + 1;
console.log(combos);
await conn.end();
