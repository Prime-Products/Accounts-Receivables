import { SignJWT } from "jose";

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

async function inspect(name, input) {
  const res = await fetch(`http://localhost:3000/api/trpc/${name}?batch=1&input=${enc(input)}`, { headers: { cookie } });
  const text = await res.text();
  let j;
  try { j = JSON.parse(text); } catch { console.log(name, "not json:", text.slice(0, 200)); return; }
  const data = j[0]?.result?.data?.json;
  if (data === undefined) { console.log(name, "no data:", text.slice(0, 300)); return; }
  const rows = Array.isArray(data) ? data : null;
  if (rows) {
    console.log(`\n=== ${name}: ${rows.length} rows, total ${(text.length / 1024).toFixed(0)}KB, avg ${(text.length / rows.length).toFixed(0)} B/row`);
    if (rows[0]) {
      const sizes = Object.entries(rows[0]).map(([k, v]) => [k, JSON.stringify(v)?.length ?? 0]);
      sizes.sort((a, b) => b[1] - a[1]);
      console.log("field sizes (sample row):", sizes.map(([k, s]) => `${k}=${s}`).join(" "));
    }
  } else {
    console.log(`\n=== ${name}: object, ${(text.length / 1024).toFixed(0)}KB, keys: ${Object.keys(data).join(",")}`);
  }
}

await inspect("invoices.list", undefined);
await inspect("customers.list", undefined);
await inspect("customers.groups", undefined);
await inspect("tasks.list", undefined);
