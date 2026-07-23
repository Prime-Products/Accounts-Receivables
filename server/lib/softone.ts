/**
 * Softone S1 Web Services integration layer.
 * Uses the standard S1 JSON Web Services flow: login → authenticate → getBrowserInfo/setData.
 * When credentials are not configured, sync endpoints report "Not configured".
 */
import axios from "axios";
import * as db from "../db";
import { toEur } from "./arLogic";

export interface SoftoneConfig {
  baseUrl: string;
  username: string;
  password: string;
  appId: string;
  company: string;
  branch: string;
  module: string;
  refid: string;
}

export function getSoftoneConfig(): SoftoneConfig | null {
  const baseUrl = process.env.SOFTONE_BASE_URL;
  const username = process.env.SOFTONE_USERNAME;
  const password = process.env.SOFTONE_PASSWORD;
  if (!baseUrl || !username || !password) return null;
  return {
    baseUrl,
    username,
    password,
    appId: process.env.SOFTONE_APP_ID ?? "1000",
    company: process.env.SOFTONE_COMPANY ?? "1000",
    branch: process.env.SOFTONE_BRANCH ?? "1000",
    module: process.env.SOFTONE_MODULE ?? "0",
    refid: process.env.SOFTONE_REFID ?? "1",
  };
}

// ------------------------------------------------------------------
// Demo seed data (used when Softone is not configured, so every
// feature can be evaluated before connecting the real ERP).
// ------------------------------------------------------------------

const DEMO_CUSTOMERS = [
  { code: "C-1001", name: "Aegean Marine Supplies S.A.", vatNumber: "EL094321765", email: "accounts@aegeanmarine.gr", phone: "+30 210 4523100", tier: "Platinum", creditLimit: "150000", paymentTermsDays: 60 },
  { code: "C-1002", name: "Poseidon Shipping Ltd", vatNumber: "EL099887312", email: "finance@poseidonshipping.com", phone: "+30 210 4287655", tier: "Gold", creditLimit: "80000", paymentTermsDays: 45 },
  { code: "C-1003", name: "Hellenic Port Services", vatNumber: "EL123456789", email: "billing@hps.gr", phone: "+30 2310 552418", tier: "Gold", creditLimit: "60000", paymentTermsDays: 45 },
  { code: "C-1004", name: "Ionian Ferries Co.", vatNumber: "EL801234567", email: "payables@ionianferries.gr", phone: "+30 26610 39100", tier: "Silver", creditLimit: "35000", paymentTermsDays: 30 },
  { code: "C-1005", name: "Cyclades Trading & Bunkering", vatNumber: "EL045678901", email: "info@cycladesbunkering.gr", phone: "+30 22810 82345", tier: "Silver", creditLimit: "25000", paymentTermsDays: 30 },
  { code: "C-1006", name: "Thermaikos Logistics IKE", vatNumber: "EL167890123", email: "accounts@thermaikoslog.gr", phone: "+30 2310 754209", tier: "Bronze", creditLimit: "15000", paymentTermsDays: 30 },
  { code: "C-1007", name: "Saronic Yacht Services", vatNumber: "EL134567890", email: "office@saronicyacht.gr", phone: "+30 210 4515522", tier: "Bronze", creditLimit: "10000", paymentTermsDays: 15 },
  { code: "C-1008", name: "Nautilus Offshore Ltd", vatNumber: "EL178901234", email: "ap@nautilusoffshore.com", phone: "+30 210 8993410", tier: "New", creditLimit: "5000", paymentTermsDays: 15 },
] as const;

function daysFromNow(days: number): number {
  return Date.now() + days * 24 * 60 * 60 * 1000;
}

/** Seed demo customers (idempotent by customer code). */
export async function seedDemoCustomers(): Promise<{ synced: number }> {
  const existing = await db.listCustomers();
  const byCode = new Map(existing.map(c => [c.code, c]));
  let synced = 0;
  for (const c of DEMO_CUSTOMERS) {
    if (byCode.has(c.code)) continue;
    await db.createCustomer({ ...c } as any);
    synced++;
  }
  await db.addSyncLog({ direction: "Pull", entityType: "customers", recordCount: synced, status: "Success", message: `Demo mode: loaded ${synced} sample customers` });
  return { synced };
}

/** Seed demo invoices spread across aging buckets (idempotent by invoice number). */
export async function seedDemoInvoices(): Promise<{ synced: number }> {
  const customers = await db.listCustomers();
  if (customers.length === 0) throw new Error("Load demo customers first.");
  const byCode = new Map(customers.map(c => [c.code, c]));
  const spec: Array<{ code: string; num: string; issue: number; due: number; amount: string; paid?: string }> = [
    // Current (not yet due)
    { code: "C-1001", num: "INV-2026-0501", issue: daysFromNow(-10), due: daysFromNow(20), amount: "24500" },
    { code: "C-1002", num: "INV-2026-0502", issue: daysFromNow(-5), due: daysFromNow(25), amount: "13200" },
    { code: "C-1008", num: "INV-2026-0503", issue: daysFromNow(-3), due: daysFromNow(12), amount: "2400" },
    // Overdue 0-30
    { code: "C-1001", num: "INV-2026-0451", issue: daysFromNow(-45), due: daysFromNow(-8), amount: "18700" },
    { code: "C-1003", num: "INV-2026-0452", issue: daysFromNow(-50), due: daysFromNow(-15), amount: "9800", paid: "4000" },
    { code: "C-1004", num: "INV-2026-0453", issue: daysFromNow(-55), due: daysFromNow(-22), amount: "7600" },
    // Overdue 31-60
    { code: "C-1005", num: "INV-2026-0401", issue: daysFromNow(-80), due: daysFromNow(-38), amount: "11250" },
    { code: "C-1002", num: "INV-2026-0402", issue: daysFromNow(-90), due: daysFromNow(-45), amount: "6900", paid: "2000" },
    // Overdue 61-90
    { code: "C-1006", num: "INV-2026-0301", issue: daysFromNow(-110), due: daysFromNow(-70), amount: "5400" },
    // Overdue 90+
    { code: "C-1007", num: "INV-2026-0201", issue: daysFromNow(-150), due: daysFromNow(-105), amount: "8300" },
    { code: "C-1006", num: "INV-2026-0202", issue: daysFromNow(-160), due: daysFromNow(-118), amount: "3150" },
    // Fully paid (history)
    { code: "C-1001", num: "INV-2026-0101", issue: daysFromNow(-120), due: daysFromNow(-60), amount: "15000", paid: "15000" },
    { code: "C-1003", num: "INV-2026-0102", issue: daysFromNow(-100), due: daysFromNow(-55), amount: "4200", paid: "4200" },
  ];
  const existing = await db.listInvoices();
  const byNumber = new Map(existing.map(i => [i.invoiceNumber, i]));
  let synced = 0;
  for (const s of spec) {
    if (byNumber.has(s.num)) continue;
    const customer = byCode.get(s.code);
    if (!customer) continue;
    await db.createInvoice({
      customerId: customer.id,
      invoiceNumber: s.num,
      issueDate: s.issue,
      dueDate: s.due,
      amount: s.amount,
      paidAmount: s.paid ?? "0",
    } as any);
    synced++;
  }
  await db.addSyncLog({ direction: "Pull", entityType: "invoices", recordCount: synced, status: "Success", message: `Demo mode: loaded ${synced} sample invoices` });
  return { synced };
}

async function s1Call(baseUrl: string, body: Record<string, unknown>) {
  const res = await axios.post(baseUrl.replace(/\/$/, "") + "/s1services", body, {
    headers: { "Content-Type": "application/json" },
    timeout: 30000,
  });
  return res.data;
}

/** Login + authenticate, returns clientID for subsequent calls. */
export async function s1Authenticate(cfg: SoftoneConfig): Promise<string> {
  const login = await s1Call(cfg.baseUrl, {
    service: "login",
    username: cfg.username,
    password: cfg.password,
    appId: cfg.appId,
  });
  if (!login?.success) throw new Error(`Softone login failed: ${login?.error ?? "unknown error"}`);
  const auth = await s1Call(cfg.baseUrl, {
    service: "authenticate",
    clientID: login.clientID,
    company: cfg.company,
    branch: cfg.branch,
    module: cfg.module,
    refid: cfg.refid,
  });
  if (!auth?.success) throw new Error(`Softone authenticate failed: ${auth?.error ?? "unknown error"}`);
  return auth.clientID as string;
}

/** Pull customers (TRDR) from Softone via SqlData/getBrowserInfo. */
export async function pullCustomers(): Promise<{ synced: number }> {
  const cfg = getSoftoneConfig();
  if (!cfg) throw new Error("Softone is not configured. Please set connection credentials in Settings.");
  const clientID = await s1Authenticate(cfg);
  const data = await s1Call(cfg.baseUrl, {
    service: "SqlData",
    clientID,
    appId: cfg.appId,
    SqlName: "getCustomers",
  });
  if (!data?.success) throw new Error(`Softone customer pull failed: ${data?.error ?? "unknown error"}`);
  const rows: any[] = data.rows ?? [];
  let synced = 0;
  const existing = await db.listCustomers();
  const byCode = new Map(existing.map(c => [c.code, c]));
  for (const row of rows) {
    const code = String(row.CODE ?? row.code ?? "");
    if (!code) continue;
    const payload = {
      code,
      name: String(row.NAME ?? row.name ?? code),
      vatNumber: row.AFM ? String(row.AFM) : undefined,
      email: row.EMAIL ? String(row.EMAIL) : undefined,
      phone: row.PHONE01 ? String(row.PHONE01) : undefined,
      softoneId: String(row.TRDR ?? row.trdr ?? ""),
    };
    const found = byCode.get(code);
    if (found) await db.updateCustomer(found.id, payload);
    else await db.createCustomer(payload as any);
    synced++;
  }
  await db.addSyncLog({ direction: "Pull", entityType: "customers", recordCount: synced, status: "Success", message: `Pulled ${synced} customers from Softone` });
  return { synced };
}

/** Pull open invoices (FINDOC) from Softone. */
export async function pullInvoices(): Promise<{ synced: number }> {
  const cfg = getSoftoneConfig();
  if (!cfg) throw new Error("Softone is not configured. Please set connection credentials in Settings.");
  const clientID = await s1Authenticate(cfg);
  const data = await s1Call(cfg.baseUrl, {
    service: "SqlData",
    clientID,
    appId: cfg.appId,
    SqlName: "getOpenInvoices",
  });
  if (!data?.success) throw new Error(`Softone invoice pull failed: ${data?.error ?? "unknown error"}`);
  const rows: any[] = data.rows ?? [];
  const customers = await db.listCustomers();
  const bySoftoneId = new Map(customers.filter(c => c.softoneId).map(c => [c.softoneId!, c]));
  const existing = await db.listInvoices();
  const byNumber = new Map(existing.map(i => [i.invoiceNumber, i]));
  let synced = 0;
  for (const row of rows) {
    const num = String(row.FINCODE ?? row.fincode ?? "");
    const trdr = String(row.TRDR ?? row.trdr ?? "");
    const customer = bySoftoneId.get(trdr);
    if (!num || !customer) continue;
    const payload = {
      customerId: customer.id,
      invoiceNumber: num,
      issueDate: new Date(row.TRNDATE ?? row.trndate).getTime(),
      dueDate: new Date(row.FINALDATE ?? row.finaldate ?? row.TRNDATE ?? row.trndate).getTime(),
      amount: String(row.SUMAMNT ?? row.sumamnt ?? 0),
      paidAmount: String(row.PAYAMNT ?? row.payamnt ?? 0),
      currency: String(row.CURRENCY ?? row.currency ?? "EUR"),
      amountEur: toEur(Number(row.SUMAMNT ?? row.sumamnt ?? 0), String(row.CURRENCY ?? row.currency ?? "EUR")).toFixed(2),
      softoneId: String(row.FINDOC ?? row.findoc ?? ""),
    };
    const found = byNumber.get(num);
    if (found) await db.updateInvoice(found.id, payload);
    else await db.createInvoice(payload as any);
    synced++;
  }
  await db.addSyncLog({ direction: "Pull", entityType: "invoices", recordCount: synced, status: "Success", message: `Pulled ${synced} invoices from Softone` });
  return { synced };
}

/** Push a receipt to Softone as a collection document (setData on SALDOC/collection series). */
export async function pushReceipt(receiptId: number): Promise<{ softoneId: string }> {
  const cfg = getSoftoneConfig();
  if (!cfg) throw new Error("Softone is not configured. Please set connection credentials in Settings.");
  const receiptsAll = await db.listReceipts();
  const receipt = receiptsAll.find(r => r.id === receiptId);
  if (!receipt) throw new Error("Receipt not found");
  const customer = await db.getCustomer(receipt.customerId);
  if (!customer?.softoneId) throw new Error("Customer is not linked to Softone (missing TRDR)");
  const clientID = await s1Authenticate(cfg);
  const data = await s1Call(cfg.baseUrl, {
    service: "setData",
    clientID,
    appId: cfg.appId,
    OBJECT: "SALDOC",
    data: {
      SALDOC: [{ SERIES: process.env.SOFTONE_RECEIPT_SERIES ?? "7001", TRNDATE: new Date(receipt.receiptDate).toISOString().slice(0, 10), TRDR: customer.softoneId, SUMAMNT: Number(receipt.amount) }],
    },
  });
  if (!data?.success) throw new Error(`Softone receipt push failed: ${data?.error ?? "unknown error"}`);
  const softoneId = String(data.id ?? "");
  await db.addSyncLog({ direction: "Push", entityType: "receipts", recordCount: 1, status: "Success", message: `Pushed receipt ${receipt.receiptNumber} to Softone (id ${softoneId})` });
  return { softoneId };
}
