/**
 * Builds the live-data half of the AI assistant's context.
 *
 * Two layers:
 *  1. `buildPortfolioSnapshot()` — always included: headline AR figures so the
 *     assistant can answer "how much is overdue", "what is our DSO" etc.
 *  2. `resolveMentions()` — entity lookup: any group / company / vessel / contact
 *     named in the question gets its own detailed fact block.
 *
 * Everything is read-only and pre-aggregated: the LLM never receives raw tables,
 * only compact JSON, so answers stay grounded and the prompt stays small.
 */
import * as db from "../db";
import {
  computeAging,
  computeDso,
  daysOverdue,
  isOpenInvoice,
  monthRange,
  outstanding,
  toEur,
  DAY_MS,
} from "./arLogic";

const eur = (n: number) => Math.round(n);
const iso = (ts: number | null | undefined) => (ts ? new Date(ts).toISOString().slice(0, 10) : null);

export const groupKeyOf = (c: { customerGroup: string | null; name: string }) => (c.customerGroup ?? "").trim() || c.name;

export type PortfolioSnapshot = Awaited<ReturnType<typeof buildPortfolioSnapshot>>;

/** Headline AR figures for the whole portfolio, in EUR. */
export async function buildPortfolioSnapshot(now = Date.now()) {
  const d = new Date(now);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const { start, end } = monthRange(year, month);
  const [customers, invoices, forecastTarget, receipts, wires, tasks, promises, watchRows, confirmRows, last90Sales] =
    await Promise.all([
      db.listCustomers(),
      db.listInvoices(),
      db.sumForecastExpected(year, month).catch(() => 0),
      db.sumReceiptsInRange(start, end).catch(() => 0),
      db.listReceivedWireTransfersInRange(start, end).catch(() => [] as any[]),
      db.listTasks({ statuses: ["Pending", "In Progress"] }).catch(() => [] as any[]),
      db.listPromises().catch(() => [] as any[]),
      db.listGroupWatchStatuses().catch(() => [] as any[]),
      db.listGroupConfirmationStatuses().catch(() => [] as any[]),
      db.sumInvoicedInRange(now - 90 * DAY_MS, now).catch(() => 0),
    ]);

  const aging = computeAging(invoices, now);
  const arBalance = aging.totalOverdue + aging.current;
  const collected = receipts + wires.reduce((s, w) => s + toEur(Number(w.amount), w.currency), 0);
  const target = Number(forecastTarget ?? 0);

  const groupOfCustomer = new Map<number, string>();
  for (const c of customers) groupOfCustomer.set(c.id, groupKeyOf(c));

  // Overdue per group → top debtors
  const overdueByGroup = new Map<string, { overdue: number; open: number; invoices: number }>();
  for (const inv of invoices) {
    if (!isOpenInvoice(inv)) continue;
    const g = groupOfCustomer.get(inv.customerId);
    if (!g) continue;
    const e = overdueByGroup.get(g) ?? { overdue: 0, open: 0, invoices: 0 };
    const out = toEur(outstanding(inv), inv.currency);
    e.open += out;
    e.invoices += 1;
    if (daysOverdue(inv.dueDate, now) > 0) e.overdue += out;
    overdueByGroup.set(g, e);
  }
  const topDebtors = Array.from(overdueByGroup.entries())
    .filter(([, v]) => v.overdue > 0)
    .sort((a, b) => b[1].overdue - a[1].overdue)
    .slice(0, 10)
    .map(([group, v]) => ({ group, overdueEur: eur(v.overdue), openEur: eur(v.open), openInvoices: v.invoices }));

  const statusCounts: Record<string, number> = {};
  for (const w of watchRows) statusCounts[w.status] = (statusCounts[w.status] ?? 0) + 1;
  const confirmCounts: Record<string, number> = {};
  for (const c of confirmRows) confirmCounts[c.status] = (confirmCounts[c.status] ?? 0) + 1;

  const openInvoices = invoices.filter(isOpenInvoice);
  const overdueContract = openInvoices.filter(i => i.isContractInstallment && daysOverdue(i.dueDate, now) > 0);

  return {
    asOf: iso(now),
    currentMonth: `${year}-${String(month).padStart(2, "0")}`,
    dayOfMonth: d.getUTCDate(),
    portfolio: {
      customers: customers.length,
      groups: new Set(customers.map(groupKeyOf)).size,
      openInvoices: openInvoices.length,
      arBalanceEur: eur(arBalance),
      notYetDueEur: eur(aging.current),
      totalOverdueEur: eur(aging.totalOverdue),
      overdueInvoices: openInvoices.filter(i => daysOverdue(i.dueDate, now) > 0).length,
      dso: Math.round(computeDso(arBalance, last90Sales, 90)),
      agingBucketsEur: {
        "0-30": eur(aging.buckets["0-30"].amount),
        "31-60": eur(aging.buckets["31-60"].amount),
        "61-90": eur(aging.buckets["61-90"].amount),
        "91-120": eur(aging.buckets["91-120"].amount),
        "120+": eur(aging.buckets["120+"].amount),
      },
    },
    month: {
      forecastTargetEur: eur(target),
      collectedEur: eur(collected),
      remainingEur: eur(Math.max(0, target - collected)),
      progressPct: target > 0 ? Math.round((collected / target) * 100) : null,
    },
    workload: {
      openTasks: tasks.length,
      openTasksByType: tasks.reduce<Record<string, number>>((acc, t) => {
        acc[t.type] = (acc[t.type] ?? 0) + 1;
        return acc;
      }, {}),
      pendingPromises: promises.filter(p => p.status === "Pending").length,
      brokenPromises: promises.filter(p => p.status === "Broken").length,
      overdueContractInstallments: overdueContract.length,
      overdueContractInstallmentsEur: eur(overdueContract.reduce((s, i) => s + toEur(outstanding(i), i.currency), 0)),
    },
    groupStatusCounts: statusCounts,
    groupConfirmationCounts: confirmCounts,
    topOverdueGroups: topDebtors,
  };
}

/** Normalises a string for fuzzy name matching (accent-insensitive, case-insensitive). */
export function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0370-\u03ff ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Legal-form suffixes that users routinely omit when naming a company. */
const LEGAL_SUFFIXES = new Set([
  "ltd", "limited", "llc", "inc", "plc", "gmbh", "bv", "b v", "nv", "sa", "spa", "srl", "as", "ag",
  "co", "company", "corp", "corporation", "pte", "sdn", "bhd", "oy", "ab", "aps", "kg", "sarl",
  // Greek legal forms — note that "Α.Ε." normalises to the two tokens "α" "ε",
  // so the single letters must be strippable as well.
  "ae", "epe", "oe", "ee", "ike", "mike",
  "α", "ε", "π", "ο", "ι", "κ", "μ", "αε", "επε", "οε", "ικε", "μικε", "εε",
]);

/** Drops trailing legal-form tokens: "MSC SHIPMANAGEMENT LTD" → "msc shipmanagement". */
function coreName(nameNorm: string): string {
  const parts = nameNorm.split(" ");
  while (parts.length > 1 && LEGAL_SUFFIXES.has(parts[parts.length - 1])) parts.pop();
  return parts.join(" ");
}

/**
 * True when the question text plausibly mentions this entity name.
 *
 * Three progressively looser attempts, all requiring at least 4 characters so
 * short tokens (e.g. "DSO", "SOA") can never trigger a false match:
 *  1. the full normalised name appears in the question;
 *  2. the name without its legal-form suffix appears (users say "MSC
 *     SHIPMANAGEMENT", not "MSC SHIPMANAGEMENT LTD");
 *  3. the distinctive first token appears as a whole word.
 */
export function mentions(questionNorm: string, name: string): boolean {
  const n = norm(name);
  if (n.length < 4) return false;
  if (questionNorm.includes(n)) return true;
  const core = coreName(n);
  if (core.length >= 4 && core !== n && questionNorm.includes(core)) return true;
  const first = n.split(" ")[0];
  if (first.length >= 4 && new RegExp(`\\b${first}\\b`).test(questionNorm)) return true;
  return false;
}

/** Detailed facts for one group: balances, aging, members, promises, tasks, notes. */
export async function buildGroupFacts(groupName: string, now = Date.now()) {
  const customers = await db.listCustomers();
  const members = customers.filter(c => groupKeyOf(c) === groupName);
  if (members.length === 0) return null;
  const memberIds = new Set(members.map(m => m.id));
  const nameById = new Map(members.map(m => [m.id, m.name]));
  const [allInvoices, promises, tasks, notes] = await Promise.all([
    db.listInvoices(),
    db.listPromises().catch(() => [] as any[]),
    db.listTasks({ statuses: ["Pending", "In Progress"] }).catch(() => [] as any[]),
    db.listGroupNotes(groupName).catch(() => [] as any[]),
  ]);
  const invoices = allInvoices.filter(i => memberIds.has(i.customerId));
  const open = invoices.filter(isOpenInvoice);
  const overdue = open.filter(i => daysOverdue(i.dueDate, now) > 0);
  const aging = computeAging(invoices, now);
  const d = new Date(now);
  const { start, end } = monthRange(d.getUTCFullYear(), d.getUTCMonth() + 1);
  const [forecastRows, receipts, wires] = await Promise.all([
    db.listForecastEntries(d.getUTCFullYear(), d.getUTCMonth() + 1).catch(() => [] as any[]),
    db.listReceiptsInRange(start, end).catch(() => [] as any[]),
    db.listReceivedWireTransfersInRange(start, end).catch(() => [] as any[]),
  ]);
  const forecastEur = forecastRows
    .filter(f => (f.customerGroup ?? "").trim() === groupName)
    .reduce((s, f) => s + Number(f.expectedAmount), 0);
  const collectedEur =
    // Receipts are stored in EUR already (no currency column on receipts).
    receipts.filter(r => memberIds.has(r.customerId)).reduce((s, r) => s + Number(r.amount), 0) +
    wires.filter(w => memberIds.has(w.customerId)).reduce((s, w) => s + toEur(Number(w.amount), w.currency), 0);

  return {
    kind: "group" as const,
    name: groupName,
    companies: members.map(m => ({ id: m.id, name: m.name, code: m.code })),
    openBalanceEur: eur(open.reduce((s, i) => s + toEur(outstanding(i), i.currency), 0)),
    overdueEur: eur(overdue.reduce((s, i) => s + toEur(outstanding(i), i.currency), 0)),
    openInvoices: open.length,
    overdueInvoices: overdue.length,
    agingBucketsEur: Object.fromEntries(Object.entries(aging.buckets).map(([k, v]) => [k, eur(v.amount)])),
    monthForecastEur: eur(forecastEur),
    monthCollectedEur: eur(collectedEur),
    largestOverdueInvoices: overdue
      .sort((a, b) => toEur(outstanding(b), b.currency) - toEur(outstanding(a), a.currency))
      .slice(0, 8)
      .map(i => ({
        invoice: i.invoiceNumber,
        company: nameById.get(i.customerId),
        dueDate: iso(i.dueDate),
        daysOverdue: daysOverdue(i.dueDate, now),
        outstandingEur: eur(toEur(outstanding(i), i.currency)),
      })),
    promises: promises
      .filter(p => memberIds.has(p.customerId))
      .slice(0, 10)
      .map(p => ({ company: nameById.get(p.customerId), amountEur: eur(Number(p.amount)), promisedDate: iso(p.promisedDate), status: p.status })),
    openTasks: tasks
      .filter(t => t.customerId && memberIds.has(t.customerId))
      .slice(0, 10)
      .map(t => ({ type: t.type, title: t.title, dueDate: iso(t.dueDate), status: t.status })),
    recentNotes: notes.slice(0, 5).map((n: any) => ({ date: iso(n.createdAt ? new Date(n.createdAt).getTime() : null), content: String(n.content ?? "").slice(0, 300) })),
  };
}

/** Detailed facts for one vessel: identity plus its receivables. */
export async function buildVesselFacts(vesselId: number, now = Date.now()) {
  const [vessels, invoices, customers] = await Promise.all([db.listVessels(), db.listInvoices(), db.listCustomers()]);
  const v = vessels.find(x => x.id === vesselId);
  if (!v) return null;
  const nameById = new Map(customers.map(c => [c.id, c.name]));
  const mine = invoices.filter(i => i.vesselId === vesselId);
  const open = mine.filter(isOpenInvoice);
  const overdue = open.filter(i => daysOverdue(i.dueDate, now) > 0);
  return {
    kind: "vessel" as const,
    name: v.name,
    imo: v.imo,
    vesselType: v.vesselType,
    flag: v.flag,
    owner: v.customerId ? nameById.get(v.customerId) ?? null : null,
    invoices: mine.length,
    openInvoices: open.length,
    openBalanceEur: eur(open.reduce((s, i) => s + toEur(outstanding(i), i.currency), 0)),
    overdueEur: eur(overdue.reduce((s, i) => s + toEur(outstanding(i), i.currency), 0)),
    maxDaysOverdue: overdue.reduce((m, i) => Math.max(m, daysOverdue(i.dueDate, now)), 0),
  };
}

/**
 * Finds groups / vessels / contacts named in the question and returns their fact
 * blocks (at most `limit` groups, to keep the prompt small).
 */
export async function resolveMentions(question: string, now = Date.now(), limit = 3) {
  const q = norm(question);
  const [customers, vessels, contacts] = await Promise.all([
    db.listCustomers(),
    db.listVessels().catch(() => [] as any[]),
    db.listAllPaymentContacts().catch(() => [] as any[]),
  ]);

  const groupNames = Array.from(new Set(customers.map(groupKeyOf)));
  const matchedGroups = groupNames
    .filter(g => mentions(q, g))
    // longest match first: "MSC SHIPMANAGEMENT" beats "MSC"
    .sort((a, b) => b.length - a.length)
    .slice(0, limit);

  const matchedVessels = vessels.filter(v => mentions(q, v.name)).slice(0, limit);
  const matchedContacts = contacts
    .filter(c => (c.name && mentions(q, c.name)) || (c.email && q.includes(norm(c.email))))
    .slice(0, limit)
    .map(c => ({
      kind: "contact" as const,
      name: c.name,
      email: c.email,
      phone: c.phone,
      role: c.role,
      company: customers.find(x => x.id === c.customerId)?.name ?? null,
    }));

  const groups = (await Promise.all(matchedGroups.map(g => buildGroupFacts(g, now)))).filter(Boolean);
  const vesselFacts = (await Promise.all(matchedVessels.map(v => buildVesselFacts(v.id, now)))).filter(Boolean);
  return { groups, vessels: vesselFacts, contacts: matchedContacts };
}
