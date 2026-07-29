// Profile main tRPC endpoints: response time + payload size
import { SignJWT } from "jose";

const BASE = "http://localhost:3000";
const secret = new TextEncoder().encode(process.env.JWT_SECRET);
const token = await new SignJWT({
  openId: process.env.OWNER_OPEN_ID,
  appId: process.env.VITE_APP_ID,
  name: process.env.OWNER_NAME || "Owner",
})
  .setProtectedHeader({ alg: "HS256", typ: "JWT" })
  .setExpirationTime("1h")
  .sign(secret);
const cookie = `app_session_id=${token}`;

const enc = (o) => encodeURIComponent(JSON.stringify({ 0: { json: o ?? null, ...(o === undefined ? { meta: { values: ["undefined"] } } : {}) } }));

const endpoints = [
  ["invoices.list", undefined],
  ["invoices.aging", undefined],
  ["customers.groups", undefined],
  ["customers.list", undefined],
  ["forecast.dashboard", undefined],
  ["forecast.smartEntries", { month: "2026-07" }],
  ["tasks.list", undefined],
  ["team.list", undefined],
  ["team.workload", undefined],
  ["customers.getAllWireTransfers", undefined],
  ["contracts.list", undefined],
];

for (const [name, input] of endpoints) {
  const url = `${BASE}/api/trpc/${name}?batch=1&input=${enc(input)}`;
  // warm + measure (2 runs, report second)
  let ms = 0, bytes = 0, status = 0, encoding = "";
  for (let run = 0; run < 2; run++) {
    const t0 = Date.now();
    const res = await fetch(url, { headers: { cookie, "accept-encoding": "gzip" } });
    const body = await res.text();
    ms = Date.now() - t0;
    bytes = body.length;
    status = res.status;
    encoding = res.headers.get("content-encoding") || "none";
  }
  console.log(`${name.padEnd(35)} ${String(status).padEnd(4)} ${String(ms).padStart(6)}ms ${(bytes / 1024).toFixed(0).padStart(7)}KB enc=${encoding}`);
}
