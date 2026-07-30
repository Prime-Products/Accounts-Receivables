/**
 * Rebuild `promises_to_pay` and `tasks` from the audit trail after the 30/7 data wipe.
 *
 * Sources:
 *  - audit_logs (intact): Create Task / Record Promise-to-Pay / status-change actions
 *  - customers (intact): resolve customer ids by name found in details text
 *
 * Strategy:
 *  1. Promises: "Record Promise-to-Pay" details = `Customer #<id> promised €<amt> by <yyyy-mm-dd>`
 *     → insert with original id (entityId), status Pending; then replay
 *     Promise Kept / Promise Broken / Cancel Promise-to-Pay (→Broken) /
 *     Reschedule Promise-to-Pay (date/amount move) in audit order.
 *  2. Tasks: "Create Task" details patterns:
 *     a) `Manual task "<title>" for <customerName>`
 *     b) `Auto follow-up call task for <GROUP> on <dd/mm/yyyy>`   (Follow-up marker)
 *     c) `Auto follow-up for promise #<id> (<customerName>)`      (Promise marker)
 *     d) fallback: keep raw details as description
 *     → insert with original id, then replay Task Completed / Task Cancelled /
 *       Cancel Task / Create Next Task (cancels old) / Convert (cancels old) /
 *       Reschedule Task / Update Task / Assign Task / Escalate Task.
 *  3. Skip obvious vitest artifacts by name patterns.
 *  4. Dry-run by default; pass --apply to write.
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import fs from "fs";

const APPLY = process.argv.includes("--apply");
const conn = await mysql.createConnection(process.env.DATABASE_URL);

const TEST_PAT = /vitest|Test Co|Test Group|Test Cust|TEST GROUP|FollowUpContact|PromiseConfSync|TaskLink|NextAction (Co|Test)|Team test task|this is a test|ms[0-9a-z]{6}|WATCHSTATUS|AISUMMARY|COLLECTION SYNC|CONFIRM SYNC|Vitest/i;
// Customer 808 ("1η Ε.ΜΟ.Δ.Ε." / group "ΥΠΟΥΡΓΕΙΟ ΚΛΙΜΑΤΙΚΗΣ...") is customers[0] and
// is used as the live fixture by most vitest suites (calls.logCall, confirmationStatus,
// etc.). Its 800+ audit-trail promises/tasks are test bursts whose deletions were done
// by cleanup hooks (hard DELETE — no audit entries), so replay would resurrect them.
// The group's real state is "Not Contacted / €0" (group_confirmation_status intact),
// so we exclude this customer entirely from reconstruction.
const TEST_CUSTOMER_IDS = new Set([808]);

const [audit] = await conn.query(
  `SELECT id, userId, action, entityType, entityId, details, createdAt
   FROM audit_logs WHERE entityType IN ('task','promiseToPay') ORDER BY id ASC`
);
const [customers] = await conn.query(`SELECT id, name, customerGroup FROM customers`);
const custByName = new Map(customers.map(c => [c.name, c]));
const custById = new Map(customers.map(c => [c.id, c]));
// group → member customer with highest id fallback resolution
const groupMembers = new Map();
for (const c of customers) {
  const g = (c.customerGroup ?? "").trim() || c.name;
  if (!groupMembers.has(g)) groupMembers.set(g, []);
  groupMembers.get(g).push(c);
}

function parseDMY(s) {
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return Date.UTC(+m[3], +m[2] - 1, +m[1]);
}

// ---------- 1. PROMISES ----------
const promises = new Map(); // id → row
for (const a of audit) {
  if (a.entityType !== "promiseToPay") continue;
  const id = Number(a.entityId);
  if (!id) continue;
  const d = a.details ?? "";
  if (a.action === "Record Promise-to-Pay") {
    const m = d.match(/Customer #(\d+) promised €([\d.]+) by (\d{4})-(\d{2})-(\d{2})/);
    if (!m) continue;
    const cust = custById.get(Number(m[1]));
    if (!cust || TEST_PAT.test(cust.name) || TEST_CUSTOMER_IDS.has(cust.id)) continue;
    promises.set(id, {
      id,
      customerId: Number(m[1]),
      amount: m[2],
      promisedDate: Date.UTC(+m[3], +m[4] - 1, +m[5]),
      status: "Pending",
      notes: null,
      createdBy: a.userId ?? 1,
      createdAt: new Date(a.createdAt),
    });
  } else if (promises.has(id)) {
    const p = promises.get(id);
    if (a.action === "Promise Kept") p.status = "Kept";
    else if (a.action === "Promise Broken") p.status = "Broken";
    else if (a.action === "Cancel Promise-to-Pay") p.status = "Broken";
    else if (a.action === "Reschedule Promise-to-Pay") {
      const mm = d.match(/€([\d.]+) moved .* → (\d{2}\/\d{2}\/\d{4})/);
      if (mm) { p.amount = mm[1]; const nd = parseDMY(mm[2]); if (nd) p.promisedDate = nd; }
    }
  }
}

// ---------- 2. TASKS ----------
const tasks = new Map(); // id → row
for (const a of audit) {
  if (a.entityType !== "task") continue;
  const id = Number(a.entityId);
  if (!id) continue;
  const d = a.details ?? "";
  if (a.action === "Create Task") {
    if (TEST_PAT.test(d)) continue;
    let row = null;
    let m;
    if ((m = d.match(/^Manual task "(.+)" for (.+)$/s))) {
      const cust = custByName.get(m[2]);
      if (!cust || TEST_PAT.test(m[1]) || TEST_CUSTOMER_IDS.has(cust.id)) continue;
      row = {
        type: "Manual", title: m[1],
        description: m[1],
        customerId: cust.id, dueDate: null,
      };
    } else if ((m = d.match(/^Auto follow-up call task for (.+) on (\d{2}\/\d{2}\/\d{4})$/s))) {
      const group = m[1];
      const members = groupMembers.get(group) ?? [];
      const cust = members[0] ?? custByName.get(group);
      if (!cust || TEST_CUSTOMER_IDS.has(cust.id)) continue;
      const due = parseDMY(m[2]);
      row = {
        type: "Manual",
        title: `Follow-up call — ${group}`,
        description: `Call ${group} on ${m[2]} to confirm the expected payment. (Follow-up: ${group})`,
        customerId: cust.id, dueDate: due,
      };
    } else if ((m = d.match(/^Auto follow-up for promise #(\d+) \((.+)\)$/s))) {
      const pid = Number(m[1]);
      const p = promises.get(pid);
      const cust = custByName.get(m[2]) ?? (p ? custById.get(p.customerId) : null);
      if (!cust || !p || TEST_CUSTOMER_IDS.has(cust.id)) continue;
      const amtNum = Number(p.amount);
      const dateStr = new Date(p.promisedDate).toLocaleDateString("en-GB", { timeZone: "UTC" });
      row = {
        type: "Manual",
        title: `Promise to Pay — €${amtNum.toLocaleString("en-US")}`,
        description: `Verify that ${cust.name} paid the promised amount of €${amtNum.toLocaleString("en-US")} due ${dateStr}. (Promise #${pid})`,
        customerId: cust.id, dueDate: p.promisedDate,
      };
    } else {
      continue; // unknown pattern — skip rather than fabricate
    }
    tasks.set(id, {
      id, ...row, status: "Pending",
      assignedTo: a.userId ?? 1, assigneeId: null,
      completedAt: null, completionNotes: null, rescheduleCount: 0,
      invoiceId: null, contractId: null,
      createdAt: new Date(a.createdAt), updatedAt: new Date(a.createdAt),
    });
  } else if (tasks.has(id)) {
    const t = tasks.get(id);
    if (a.action === "Task Completed") {
      t.status = "Completed"; t.completedAt = new Date(a.createdAt).getTime(); t.completionNotes = d || t.completionNotes;
    } else if (a.action === "Task Cancelled" || a.action === "Cancel Task") {
      t.status = "Cancelled"; t.completionNotes = d || t.completionNotes;
    } else if (a.action === "Create Next Task" || a.action === "Convert Follow-up to Promise") {
      t.status = "Cancelled"; t.completionNotes = d || t.completionNotes;
    } else if (a.action === "Reschedule Task") {
      const nd = parseDMY(d); if (nd) t.dueDate = nd; t.rescheduleCount = (t.rescheduleCount ?? 0) + 1;
      const rc = d.match(/reschedule #(\d+)/); if (rc) t.rescheduleCount = Number(rc[1]);
    } else if (a.action === "Update Task") {
      const nd = parseDMY(d); if (nd) t.dueDate = nd;
    }
    t.updatedAt = new Date(a.createdAt);
  }
}

// Promise resolution should also close linked check tasks (replay may have missed
// auto-complete audit entries only if promise closed post-wipe — keep as-is otherwise).

const promiseRows = [...promises.values()];
const taskRows = [...tasks.values()];
console.log(`promises to restore: ${promiseRows.length} (Pending: ${promiseRows.filter(p => p.status === "Pending").length})`);
console.log(`tasks to restore: ${taskRows.length} (Open: ${taskRows.filter(t => t.status === "Pending").length})`);
console.log("open tasks:");
for (const t of taskRows.filter(t => t.status === "Pending")) {
  console.log(`  #${t.id} [due ${t.dueDate ? new Date(t.dueDate).toISOString().slice(0, 10) : "-"}] ${t.title}`);
}
console.log("pending promises:");
for (const p of promiseRows.filter(p => p.status === "Pending")) {
  const c = custById.get(p.customerId);
  console.log(`  #${p.id} ${c?.name ?? p.customerId} €${p.amount} by ${new Date(p.promisedDate).toISOString().slice(0, 10)}`);
}

fs.writeFileSync("/home/ubuntu/rebuild_preview.json", JSON.stringify({ promises: promiseRows, tasks: taskRows }, null, 1));

if (APPLY) {
  let pi = 0, ti = 0;
  for (const p of promiseRows) {
    await conn.execute(
      `INSERT INTO promises_to_pay (id, customerId, amount, promisedDate, status, notes, createdBy, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE status=VALUES(status)`,
      [p.id, p.customerId, p.amount, p.promisedDate, p.status, p.notes, p.createdBy, p.createdAt, p.createdAt]
    );
    pi++;
  }
  for (const t of taskRows) {
    // tasks.dueDate is NOT NULL — for Manual tasks whose audit entry had no date,
    // fall back to the creation timestamp.
    const due = t.dueDate ?? new Date(t.createdAt).getTime();
    await conn.execute(
      `INSERT INTO tasks (id, customerId, invoiceId, contractId, type, title, description, dueDate, status, assignedTo, assigneeId, completedAt, completionNotes, rescheduleCount, createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE status=VALUES(status)`,
      [t.id, t.customerId, t.invoiceId, t.contractId, t.type, t.title, t.description, due, t.status, t.assignedTo, t.assigneeId, t.completedAt, t.completionNotes, t.rescheduleCount, t.createdAt, t.updatedAt]
    );
    ti++;
  }
  console.log(`APPLIED: ${pi} promises, ${ti} tasks inserted.`);
} else {
  console.log("DRY RUN — pass --apply to write. Preview: /home/ubuntu/rebuild_preview.json");
}
await conn.end();
