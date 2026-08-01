// Temporary local query helper — readable JSON output for ad-hoc inspection.
import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.query(process.argv[2]);
console.log(JSON.stringify(rows, null, 1));
await conn.end();
