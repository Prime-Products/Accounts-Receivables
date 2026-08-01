/**
 * Address Book router — one place to manage the four directory entities
 * (groups, customers, vessels, contacts) plus the user-configurable layer on
 * top of them: custom fields, saved views and per-user column layouts.
 *
 * ERP-owned columns (company name, VAT, code, vessel IMO) stay read-only here;
 * everything a user adds lives in `custom_field_defs` / `custom_field_values`,
 * so a SoftOne sync can never wipe manual work.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { buildExcel, buildPdf, type TableSpec } from "../lib/exports";
import { addressBookEntities, contactTypes, customFieldTypes, giftTiers } from "../../drizzle/schema";
import { matchesAllTokens } from "../../shared/textMatch";

const entitySchema = z.enum(addressBookEntities);

/** Import target fields the user can map a sheet column onto. */
export const importTargets = [
  { key: "name", label: "Name", required: true },
  { key: "email", label: "Email", required: true },
  { key: "phone", label: "Phone", required: false },
  { key: "title", label: "Position", required: false },
  { key: "contactType", label: "Type (Person / Department)", required: false },
  { key: "companyCode", label: "Company code (ERP)", required: false },
  { key: "companyName", label: "Company name", required: false },
] as const;

/**
 * Normalise a free-text type cell from a spreadsheet into one of our two values.
 * Anything that is not clearly a department (dept/department/team/group mailbox)
 * is treated as a person, which is also the column default.
 */
export function normalizeContactType(raw: string | null | undefined): (typeof contactTypes)[number] {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v) return "Person";
  if (/^(department|dept|dpt|departement|τμημα|τμήμα|shared|mailbox|group mailbox|team)$/.test(v)) return "Department";
  if (v.startsWith("dep") || v.includes("department") || v.includes("τμημ") || v.includes("τμήμ")) return "Department";
  return "Person";
}

/**
 * Local parts that virtually always denote a shared/departmental mailbox rather
 * than a person. Used only to *suggest* a reclassification — never applied
 * automatically, because a real person can sit behind info@ at a tiny company.
 */
const DEPARTMENT_LOCAL_PARTS = [
  "accounts",
  "account",
  "accounting",
  "accountancy",
  "ar",
  "ap",
  "finance",
  "financial",
  "fin",
  "billing",
  "invoice",
  "invoices",
  "credit",
  "collections",
  "treasury",
  "ops",
  "operation",
  "operations",
  "purchase",
  "purchasing",
  "procurement",
  "supply",
  "supplies",
  "technical",
  "tech",
  "crewing",
  "crew",
  "chartering",
  "charter",
  "admin",
  "administration",
  "office",
  "info",
  "information",
  "mail",
  "email",
  "contact",
  "general",
  "sales",
  "support",
  "hr",
  "payroll",
  "legal",
  "logistics",
  "spares",
  "stores",
  "store",
  "provisions",
  "bunkers",
  "management",
  "secretariat",
  "reception",
];

/** True when an email's local part looks like a shared department mailbox. */
export function looksLikeDepartmentEmail(email: string): boolean {
  const local = (email.split("@")[0] ?? "").trim().toLowerCase();
  if (!local) return false;
  // Split on separators so accounts.dept / ops-piraeus / ar_gr are all covered.
  const parts = local.split(/[.\-_+]/).filter(Boolean);
  if (parts.some(p => DEPARTMENT_LOCAL_PARTS.includes(p))) return true;
  return DEPARTMENT_LOCAL_PARTS.includes(local);
}

/** True when a contact's own name reads like a department rather than a person. */
export function looksLikeDepartmentName(name: string): boolean {
  const v = (name ?? "").trim().toLowerCase();
  if (!v) return false;
  return /(department|dept\b|division|τμημα|τμήμα|accounts payable|accounts receivable|accounting dep)/.test(v);
}

/**
 * Read the first worksheet of an uploaded xlsx/csv. The first non-empty row is
 * treated as the header; values come back as trimmed strings so downstream
 * matching never has to care about Excel's number/date types.
 */
async function parseSheet(fileBase64: string): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const buf = Buffer.from(fileBase64.replace(/^data:[^,]+,/, ""), "base64");
  // exceljs types expect a resizable Buffer; the runtime only needs the bytes.
  await wb.xlsx.load(buf as unknown as Parameters<typeof wb.xlsx.load>[0]);
  const ws = wb.worksheets[0];
  if (!ws) return { headers: [], rows: [] };

  const cellText = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === "object") {
      const o = v as { text?: string; result?: unknown; richText?: { text: string }[] };
      if (typeof o.text === "string") return o.text.trim();
      if (Array.isArray(o.richText)) return o.richText.map(r => r.text).join("").trim();
      if (o.result !== undefined) return String(o.result).trim();
      return "";
    }
    return String(v).trim();
  };

  let headers: string[] = [];
  const rows: Record<string, string>[] = [];
  ws.eachRow((row, rowNumber) => {
    const values = (row.values as unknown[]).slice(1).map(cellText);
    if (headers.length === 0) {
      if (values.some(v => v !== "")) {
        headers = values.map((v, i) => v || `Column ${i + 1}`);
      }
      return;
    }
    if (values.every(v => v === "")) return;
    const record: Record<string, string> = { __row: String(rowNumber) };
    headers.forEach((h, i) => {
      record[h] = values[i] ?? "";
    });
    rows.push(record);
  });
  return { headers, rows };
}

export type ImportPlanRow = {
  rowIndex: number;
  action: "create" | "update" | "skip";
  reason: string;
  contactId: number | null;
  customerId: number | null;
  companyLabel: string;
  values: { name: string; email: string; phone?: string; title?: string; contactType?: string };
  custom: Record<string, string>;
  changes: { field: string; from: string; to: string }[];
};

/**
 * Build the create/update/skip plan for a mapped contacts sheet.
 * Matching rule: an existing contact with the same email inside the same
 * company is an update; same email in a different company is still an update of
 * that contact's company; no email match means create. Rows whose company
 * cannot be resolved are skipped rather than silently attached to the wrong one.
 */
async function planContactImport(fileBase64: string, mapping: Record<string, string>) {
  const { rows } = await parseSheet(fileBase64);
  const [contacts, customers, defs] = await Promise.all([
    db.listAllPaymentContacts(),
    db.listCustomers(),
    db.listCustomFieldDefs("contact"),
  ]);
  const custByCode = new Map(customers.map(c => [c.code.trim().toLowerCase(), c]));
  const custByName = new Map(customers.map(c => [c.name.trim().toLowerCase(), c]));
  const liveContacts = contacts.filter(c => c.archived !== 1);
  const customKeys = new Set(defs.map(d => d.fieldKey));

  // mapping is sheetHeader -> targetKey ("" / "ignore" means unmapped).
  const columnFor = (target: string) =>
    Object.entries(mapping).find(([, t]) => t === target)?.[0] ?? null;

  const planRows: ImportPlanRow[] = [];
  let rowIndex = 0;
  for (const raw of rows) {
    rowIndex += 1;
    const get = (target: string) => {
      const col = columnFor(target);
      return col ? (raw[col] ?? "").trim() : "";
    };
    const name = get("name");
    const email = get("email").toLowerCase();
    const phone = get("phone");
    const title = get("title");
    const typeCell = get("contactType");
    // Only override the stored/default type when the sheet actually said something.
    const contactType = typeCell ? normalizeContactType(typeCell) : "";
    const code = get("companyCode").toLowerCase();
    const companyName = get("companyName").toLowerCase();

    const custom: Record<string, string> = {};
    for (const [header, target] of Object.entries(mapping)) {
      if (!target.startsWith("custom:")) continue;
      const fieldKey = target.slice("custom:".length);
      if (!customKeys.has(fieldKey)) continue;
      const v = (raw[header] ?? "").trim();
      if (v) custom[fieldKey] = v;
    }

    const cust = (code && custByCode.get(code)) || (companyName && custByName.get(companyName)) || null;
    const existing = email ? liveContacts.find(c => c.email.trim().toLowerCase() === email) : undefined;

    if (!name && !email) {
      planRows.push({
        rowIndex,
        action: "skip",
        reason: "No name or email",
        contactId: null,
        customerId: null,
        companyLabel: "—",
        values: { name, email },
        custom,
        changes: [],
      });
      continue;
    }

    if (existing) {
      const target = cust ?? customers.find(c => c.id === existing.customerId) ?? null;
      const changes: { field: string; from: string; to: string }[] = [];
      const cmp = (field: string, from: string | null, to: string) => {
        if (to && (from ?? "").trim() !== to) changes.push({ field, from: from ?? "", to });
      };
      cmp("name", existing.name, name);
      cmp("phone", existing.phone, phone);
      cmp("title", existing.title, title);
      cmp("type", existing.contactType, contactType);
      if (cust && cust.id !== existing.customerId) {
        changes.push({
          field: "company",
          from: customers.find(c => c.id === existing.customerId)?.name ?? "—",
          to: cust.name,
        });
      }
      for (const [k, v] of Object.entries(custom)) changes.push({ field: k, from: "", to: v });
      planRows.push({
        rowIndex,
        action: changes.length > 0 ? "update" : "skip",
        reason: changes.length > 0 ? "Existing contact — will be updated" : "Already up to date",
        contactId: existing.id,
        customerId: cust?.id ?? existing.customerId,
        companyLabel: target?.name ?? "—",
        values: { name: name || existing.name, email: email || existing.email, phone, title, contactType },
        custom,
        changes,
      });
      continue;
    }

    if (!cust) {
      planRows.push({
        rowIndex,
        action: "skip",
        reason: code || companyName ? "Company not found in AR Pro" : "No company code or name given",
        contactId: null,
        customerId: null,
        companyLabel: get("companyName") || get("companyCode") || "—",
        values: { name, email, phone, title, contactType },
        custom,
        changes: [],
      });
      continue;
    }

    planRows.push({
      rowIndex,
      action: "create",
      reason: "New contact",
      contactId: null,
      customerId: cust.id,
      companyLabel: cust.name,
      values: { name, email, phone, title, contactType },
      custom,
      changes: [],
    });
  }

  return {
    rows: planRows,
    summary: {
      total: planRows.length,
      create: planRows.filter(r => r.action === "create").length,
      update: planRows.filter(r => r.action === "update").length,
      skip: planRows.filter(r => r.action === "skip").length,
    },
    targets: [
      ...importTargets.map(t => ({ key: t.key, label: t.label, required: t.required })),
      ...defs.map(d => ({ key: `custom:${d.fieldKey}`, label: `${d.label} (custom)`, required: false })),
    ],
  };
}

/** Group name used as the record identity for group-level custom values. */
const groupKeyOf = (c: { customerGroup: string | null; name: string }) => (c.customerGroup ?? "").trim() || c.name;

/**
 * Identity of a person inside a group. The same people are registered on every
 * company of a group (Minerva's staff sit on each Minerva company), so counting
 * raw contact rows per group inflates the number. Email is the reliable key —
 * fall back to the name when a contact has none.
 */
const personKeyOf = (ct: { name: string | null; email: string | null }) => {
  const email = (ct.email ?? "").trim().toLowerCase();
  if (email) return `e:${email}`;
  return `n:${(ct.name ?? "").trim().toLowerCase()}`;
};

/** Attach custom-field values to rows keyed by `recordKey`. */
async function withCustomValues<T extends { recordKey: string }>(
  entity: (typeof addressBookEntities)[number],
  rows: T[],
): Promise<(T & { custom: Record<string, string> })[]> {
  const [defs, values] = await Promise.all([db.listCustomFieldDefs(entity), db.listCustomFieldValues(entity)]);
  const keyById = new Map(defs.map(d => [d.id, d.fieldKey]));
  const byRecord = new Map<string, Record<string, string>>();
  for (const v of values) {
    const fieldKey = keyById.get(v.fieldId);
    if (!fieldKey) continue;
    let bucket = byRecord.get(v.recordKey);
    if (!bucket) {
      bucket = {};
      byRecord.set(v.recordKey, bucket);
    }
    bucket[fieldKey] = v.value ?? "";
  }
  return rows.map(r => ({ ...r, custom: byRecord.get(r.recordKey) ?? {} }));
}

export const addressBookRouter = router({
  /** Row counts per tab, for the tab badges. */
  counts: protectedProcedure.query(async () => {
    const [customers, vessels, contacts] = await Promise.all([
      db.listCustomers(),
      db.listVessels(),
      db.listAllPaymentContacts(),
    ]);
    const groups = new Set(customers.map(c => groupKeyOf(c)));
    // The contacts list collapses a person repeated across a group's companies
    // into one row, so the badge must count people, not raw rows.
    const people = new Set(
      contacts
        .filter(ct => ct.archived !== 1)
        .map(ct => `${(ct.name ?? "").trim().toLowerCase()}|${(ct.email ?? "").trim().toLowerCase()}`),
    );
    return {
      group: groups.size,
      customer: customers.length,
      vessel: vessels.length,
      contact: people.size,
    };
  }),

  /** Directory list of groups: member companies, contact counts, vessels. */
  groups: protectedProcedure.query(async () => {
    const [customers, contacts, vessels] = await Promise.all([
      db.listCustomers(),
      db.listAllPaymentContacts(),
      db.listVessels(),
    ]);
    const custById = new Map(customers.map(c => [c.id, c]));
    const agg = new Map<
      string,
      { group: string; companies: number; contacts: number; vessels: number; emails: Set<string>; codes: string[] }
    >();
    // Unique people per group: the same person registered on several companies
    // of the group must count once (see personKeyOf).
    const peopleByGroup = new Map<string, Set<string>>();
    for (const c of customers) {
      const key = groupKeyOf(c);
      let row = agg.get(key);
      if (!row) {
        row = { group: key, companies: 0, contacts: 0, vessels: 0, emails: new Set(), codes: [] };
        agg.set(key, row);
      }
      row.companies += 1;
      row.codes.push(c.code);
      if (c.email) row.emails.add(c.email);
    }
    for (const ct of contacts) {
      if (ct.archived === 1) continue;
      const cust = custById.get(ct.customerId);
      if (!cust) continue;
      const key = groupKeyOf(cust);
      if (!agg.has(key)) continue;
      let people = peopleByGroup.get(key);
      if (!people) {
        people = new Set<string>();
        peopleByGroup.set(key, people);
      }
      people.add(personKeyOf(ct));
    }
    peopleByGroup.forEach((people, key) => {
      const row = agg.get(key);
      if (row) row.contacts = people.size;
    });
    for (const v of vessels) {
      if (!v.customerId) continue;
      const cust = custById.get(v.customerId);
      if (!cust) continue;
      const row = agg.get(groupKeyOf(cust));
      if (row) row.vessels += 1;
    }
    // Name indexes per group, used to build each row's hidden search haystack.
    const companyNamesByGroup = new Map<string, string[]>();
    const contactNamesByGroup = new Map<string, string[]>();
    const vesselNamesByGroup = new Map<string, string[]>();
    const push = (m: Map<string, string[]>, key: string, value: string | null) => {
      if (!value) return;
      const list = m.get(key);
      if (list) {
        if (list.length < 400) list.push(value);
      } else m.set(key, [value]);
    };
    for (const c of customers) push(companyNamesByGroup, groupKeyOf(c), c.name);
    for (const ct of contacts) {
      if (ct.archived === 1) continue;
      const cust = custById.get(ct.customerId);
      if (cust) push(contactNamesByGroup, groupKeyOf(cust), ct.name);
    }
    for (const v of vessels) {
      const cust = v.customerId ? custById.get(v.customerId) : undefined;
      if (cust) push(vesselNamesByGroup, groupKeyOf(cust), v.name);
    }
    const rows = Array.from(agg.values())
      .map(r => ({
        recordKey: r.group,
        group: r.group,
        companies: r.companies,
        contacts: r.contacts,
        vessels: r.vessels,
        primaryEmail: Array.from(r.emails)[0] ?? null,
        codes: r.codes.slice(0, 6).join(", "),
        // Hidden haystack: company names, people and vessels of this group, so
        // the list search box finds a group by anything inside it.
        searchText: [
          r.group,
          ...(companyNamesByGroup.get(r.group) ?? []),
          ...(contactNamesByGroup.get(r.group) ?? []),
          ...(vesselNamesByGroup.get(r.group) ?? []),
        ].join(" "),
      }))
      .sort((a, b) => a.group.localeCompare(b.group));
    return withCustomValues("group", rows);
  }),

  /** Directory list of companies — every customer row, including contacts-only ones. */
  customers: protectedProcedure.query(async () => {
    const [customers, contacts] = await Promise.all([db.listCustomers(), db.listAllPaymentContacts()]);
    const contactCount = new Map<number, number>();
    const contactNames = new Map<number, string[]>();
    for (const ct of contacts) {
      contactCount.set(ct.customerId, (contactCount.get(ct.customerId) ?? 0) + 1);
      if (ct.archived === 1) continue;
      const list = contactNames.get(ct.customerId);
      if (list) {
        if (list.length < 200) list.push(ct.name);
      } else contactNames.set(ct.customerId, [ct.name]);
    }
    const rows = customers
      .map(c => ({
        recordKey: String(c.id),
        id: c.id,
        code: c.code,
        name: c.name,
        group: groupKeyOf(c),
        vatNumber: c.vatNumber ?? null,
        email: c.email ?? null,
        phone: c.phone ?? null,
        contactPerson: c.contactPerson ?? null,
        tier: c.tier,
        paymentTermsDays: c.paymentTermsDays,
        contacts: contactCount.get(c.id) ?? 0,
        // Hidden haystack so searching a person's name finds their company.
        searchText: [c.name, c.code, groupKeyOf(c), c.contactPerson, ...(contactNames.get(c.id) ?? [])]
          .filter(Boolean)
          .join(" "),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return withCustomValues("customer", rows);
  }),

  /** Directory list of vessels — core data is ERP/invoice derived and read-only. */
  vessels: protectedProcedure.query(async () => {
    const [vessels, customers] = await Promise.all([db.listVessels(), db.listCustomers()]);
    const custById = new Map(customers.map(c => [c.id, c]));
    const rows = vessels
      .map(v => {
        const owner = v.customerId ? custById.get(v.customerId) : undefined;
        return {
          recordKey: String(v.id),
          id: v.id,
          name: v.name,
          imo: v.imo ?? null,
          vesselType: v.vesselType ?? null,
          flag: v.flag ?? null,
          ownerName: owner?.name ?? null,
          ownerGroup: owner ? groupKeyOf(owner) : null,
          // Hidden haystack so a vessel is findable by its owner or group too.
          searchText: [v.name, v.imo, v.vesselType, v.flag, owner?.name, owner ? groupKeyOf(owner) : null]
            .filter(Boolean)
            .join(" "),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    return withCustomValues("vessel", rows);
  }),

  /** Directory list of contacts, with company and group attached. */
  contacts: protectedProcedure
    .input(z.object({ archived: z.boolean().optional() }).optional())
    .query(async ({ input }) => {
      const [contacts, customers, gifts, vessels] = await Promise.all([
        db.listAllPaymentContacts(),
        db.listCustomers(),
        db.listContactGifts(),
        db.listVessels(),
      ]);
      const custById = new Map(customers.map(c => [c.id, c]));
      // Vessel names per company, so a contact is findable by the ship they serve.
      const vesselNamesByCustomer = new Map<number, string[]>();
      for (const v of vessels) {
        if (!v.customerId) continue;
        const list = vesselNamesByCustomer.get(v.customerId);
        if (list) {
          if (list.length < 60) list.push(v.name);
        } else vesselNamesByCustomer.set(v.customerId, [v.name]);
      }
      // Gift history per contact: latest year wins for the badge, but the full
      // year list travels with the row so the record card can show history.
      type GiftEntry = { year: number; tier: string };
      const giftsByContact = new Map<number, GiftEntry[]>();
      for (const g of gifts) {
        const bucket = giftsByContact.get(g.contactId);
        const entry: GiftEntry = { year: g.year, tier: g.tier };
        if (bucket) bucket.push(entry);
        else giftsByContact.set(g.contactId, [entry]);
      }
      giftsByContact.forEach(list => list.sort((a: GiftEntry, b: GiftEntry) => b.year - a.year));
      const wantArchived = input?.archived === true;
      const flat = contacts
        // Archived contacts are hidden by default; the archive view asks for them explicitly.
        .filter(ct => (ct.archived === 1) === wantArchived)
        .map(ct => {
          const cust = custById.get(ct.customerId);
          const giftHistory = giftsByContact.get(ct.id) ?? [];
          return {
            recordKey: String(ct.id),
            id: ct.id,
            customerId: ct.customerId,
            name: ct.name,
            title: ct.title ?? null,
            email: ct.email,
            phone: ct.phone ?? null,
            contactType: ct.contactType ?? "Person",
            companyName: cust?.name ?? "—",
            group: cust ? groupKeyOf(cust) : "—",
            archived: ct.archived === 1,
            giftTier: giftHistory[0]?.tier ?? null,
            giftYear: giftHistory[0]?.year ?? null,
            giftHistory,
            // Hidden haystack: the person plus their company, group and vessels.
            searchText: [
              ct.name,
              ct.email,
              ct.phone,
              ct.title,
              cust?.name,
              cust ? groupKeyOf(cust) : null,
              ...(vesselNamesByCustomer.get(ct.customerId) ?? []),
            ]
              .filter(Boolean)
              .join(" "),
          };
        });
      // The same person is registered on every company of a group, so the raw
      // rows repeat them. Collapse to one row per person *within a group*: the
      // companies they sit on travel with the row, and anything recorded on any
      // of the duplicate rows (gift, department type) surfaces on the single row.
      type Row = (typeof flat)[number];
      const merged = new Map<string, Row & { companyNames: string[]; groupNames: string[]; duplicateIds: number[] }>();
      for (const r of flat) {
        // Name AND email together identify the person. The email alone is not
        // enough — whole staff lists share one company mailbox (42 people on
        // info@msccy.com.cy) — and the group alone is not enough either, since
        // sister companies are often filed under their own group name (Irene
        // Kofina sits on three Enesel companies under three different groups).
        const key = `${r.name.trim().toLowerCase()}|${(r.email ?? "").trim().toLowerCase()}`;
        const seen = merged.get(key);
        if (!seen) {
          merged.set(key, { ...r, companyNames: [r.companyName], groupNames: [r.group], duplicateIds: [r.id] });
          continue;
        }
        if (!seen.companyNames.includes(r.companyName)) seen.companyNames.push(r.companyName);
        if (!seen.groupNames.includes(r.group)) seen.groupNames.push(r.group);
        seen.duplicateIds.push(r.id);
        // Keep whichever duplicate actually carries data, so nothing is hidden
        // by the collapse.
        if (r.giftHistory.length > seen.giftHistory.length) {
          seen.giftHistory = r.giftHistory;
          seen.giftTier = r.giftTier;
          seen.giftYear = r.giftYear;
        }
        if (seen.contactType !== "Department" && r.contactType === "Department") seen.contactType = "Department";
        if (!seen.title && r.title) seen.title = r.title;
        if (!seen.phone && r.phone) seen.phone = r.phone;
        seen.searchText = `${seen.searchText} ${r.searchText}`;
      }
      const rows = Array.from(merged.values())
        .map(r => ({
          ...r,
          // Exports and sorting read the joined list; the table renders the first
          // name plus a "+n" badge from companyNames.
          companyName: r.companyNames.join(", "),
          companyCount: r.companyNames.length,
          group: r.groupNames.join(", "),
          groupCount: r.groupNames.length,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return withCustomValues("contact", rows);
    }),

  /** Cross-entity search: one query, results grouped by entity type. */
  search: protectedProcedure
    .input(z.object({ query: z.string().min(2).max(100) }))
    .query(async ({ input }) => {
      const q = input.query.trim();
      const [customers, vessels, contacts] = await Promise.all([
        db.listCustomers(),
        db.listVessels(),
        db.listAllPaymentContacts(),
      ]);
      const custById = new Map(customers.map(c => [c.id, c]));
      const groupNames = Array.from(new Set(customers.map(c => groupKeyOf(c))));
      // Every entity is matched across its own fields *and* the names of the
      // things it belongs to, so "minerva aegean" finds the vessel and
      // "boukolos" finds the group he belongs to. Accents and word order are
      // handled by matchesAllTokens.
      return {
        groups: groupNames
          .filter(g => matchesAllTokens(q, [g]))
          .slice(0, 8)
          .map(g => ({ name: g })),
        customers: customers
          .filter(c => matchesAllTokens(q, [c.name, c.code, c.vatNumber, groupKeyOf(c)]))
          .slice(0, 8)
          .map(c => ({ id: c.id, name: c.name, code: c.code, group: groupKeyOf(c) })),
        vessels: vessels
          .filter(v => {
            const owner = v.customerId ? custById.get(v.customerId) : undefined;
            return matchesAllTokens(q, [
              v.name,
              v.imo,
              v.vesselType,
              v.flag,
              owner?.name,
              owner ? groupKeyOf(owner) : null,
            ]);
          })
          .slice(0, 8)
          .map(v => ({ id: v.id, name: v.name, imo: v.imo ?? null })),
        contacts: contacts
          .filter(ct => {
            if (ct.archived === 1) return false;
            const cust = custById.get(ct.customerId);
            return matchesAllTokens(q, [
              ct.name,
              ct.email,
              ct.phone,
              ct.title,
              cust?.name,
              cust ? groupKeyOf(cust) : null,
            ]);
          })
          .slice(0, 8)
          .map(ct => {
            const cust = custById.get(ct.customerId);
            return {
              id: ct.id,
              name: ct.name,
              email: ct.email,
              contactType: ct.contactType ?? "Person",
              companyName: cust?.name ?? "—",
              group: cust ? groupKeyOf(cust) : "—",
            };
          }),
      };
    }),

  // ------------------------- custom fields -------------------------

  /**
   * Data quality report over the directory. Everything here is derived on the
   * fly, so it always reflects the latest ERP sync rather than a stored score.
   */
  quality: protectedProcedure.query(async () => {
    const [contacts, customers, vessels] = await Promise.all([
      db.listAllPaymentContacts(),
      db.listCustomers(),
      db.listVessels(),
    ]);
    const live = contacts.filter(ct => ct.archived !== 1);
    const custById = new Map(customers.map(c => [c.id, c]));
    const label = (ct: (typeof live)[number]) => {
      const cust = custById.get(ct.customerId);
      return {
        id: ct.id,
        name: ct.name,
        email: ct.email,
        phone: ct.phone ?? null,
        title: ct.title ?? null,
        contactType: ct.contactType ?? "Person",
        customerId: ct.customerId,
        companyName: cust?.name ?? "—",
        group: cust ? groupKeyOf(cust) : "—",
      };
    };

    // Duplicate emails: same address used by more than one live contact.
    const byEmail = new Map<string, typeof live>();
    for (const ct of live) {
      const key = ct.email.trim().toLowerCase();
      if (!key) continue;
      const bucket = byEmail.get(key);
      if (bucket) bucket.push(ct);
      else byEmail.set(key, [ct]);
    }
    const duplicateEmails = Array.from(byEmail.entries())
      .filter(([, list]) => list.length > 1)
      .map(([email, list]) => ({ key: email, label: email, contacts: list.map(label) }))
      .sort((a, b) => b.contacts.length - a.contacts.length);

    // Duplicate people: same name inside the same company.
    const byPerson = new Map<string, typeof live>();
    for (const ct of live) {
      const key = `${ct.customerId}|${ct.name.trim().toLowerCase()}`;
      const bucket = byPerson.get(key);
      if (bucket) bucket.push(ct);
      else byPerson.set(key, [ct]);
    }
    const duplicateNames = Array.from(byPerson.entries())
      .filter(([, list]) => list.length > 1)
      .map(([key, list]) => ({
        key,
        label: `${list[0].name} · ${custById.get(list[0].customerId)?.name ?? "—"}`,
        contacts: list.map(label),
      }))
      .sort((a, b) => b.contacts.length - a.contacts.length);

    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    const invalidEmails = live.filter(ct => !emailRe.test(ct.email.trim())).map(label);
    const missingPhone = live.filter(ct => !(ct.phone ?? "").trim()).map(label);
    const orphanContacts = live.filter(ct => !custById.has(ct.customerId)).map(label);

    /**
     * Contacts currently filed as people whose email (or name) reads like a
     * shared department mailbox. Suggestion only — the user applies it.
     */
    const departmentSuggestions = live
      .filter(
        ct =>
          (ct.contactType ?? "Person") === "Person" &&
          (looksLikeDepartmentEmail(ct.email) || looksLikeDepartmentName(ct.name)),
      )
      .map(label)
      .sort((a, b) => a.email.localeCompare(b.email));

    const companiesWithoutContact = customers
      .filter(c => !live.some(ct => ct.customerId === c.id))
      .map(c => ({ id: c.id, name: c.name, code: c.code, group: groupKeyOf(c) }));

    const vesselsWithoutImo = vessels
      .filter(v => !(v.imo ?? "").trim())
      .map(v => ({ id: v.id, name: v.name, customerId: v.customerId ?? null }));
    const vesselsWithoutOwner = vessels
      .filter(v => !v.customerId)
      .map(v => ({ id: v.id, name: v.name, imo: v.imo ?? null }));

    return {
      duplicateEmails,
      duplicateNames,
      invalidEmails,
      missingPhone,
      orphanContacts,
      departmentSuggestions,
      companiesWithoutContact,
      vesselsWithoutImo,
      vesselsWithoutOwner,
      totals: {
        contacts: live.length,
        archivedContacts: contacts.length - live.length,
        people: live.filter(ct => (ct.contactType ?? "Person") === "Person").length,
        departments: live.filter(ct => ct.contactType === "Department").length,
        customers: customers.length,
        vessels: vessels.length,
      },
    };
  }),

  /** Flip a single contact between Person and Department. */
  setContactType: protectedProcedure
    .input(z.object({ id: z.number(), contactType: z.enum(contactTypes) }))
    .mutation(async ({ input }) => {
      const [existing] = await db.getPaymentContact(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
      await db.updatePaymentContact(input.id, { contactType: input.contactType });
      return { ok: true, id: input.id, contactType: input.contactType } as const;
    }),

  /** Apply one type to many contacts at once (used by the suggestion review). */
  setContactTypeBulk: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1).max(5000), contactType: z.enum(contactTypes) }))
    .mutation(async ({ input }) => {
      // One statement for the whole selection — a per-row loop over hundreds of
      // ids would mean hundreds of round trips.
      const updated = await db.setPaymentContactTypeBulk(input.ids, input.contactType);
      return { ok: true, updated } as const;
    }),

  /** Years that have a gift list, newest first, so the UI can offer a year picker. */
  giftYears: protectedProcedure.query(async () => {
    const gifts = await db.listContactGifts();
    const years = Array.from(new Set(gifts.map(g => g.year))).sort((a, b) => b - a);
    return { years, tiers: giftTiers } as const;
  }),

  /** Put a contact on a year's gift list, or change the tier of an existing entry. */
  setContactGift: protectedProcedure
    .input(
      z.object({
        contactId: z.number(),
        year: z.number().int().min(2000).max(2100),
        tier: z.enum(giftTiers),
        region: z.string().max(120).optional(),
        notes: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const [existing] = await db.getPaymentContact(input.contactId);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
      await db.upsertContactGift({
        contactId: input.contactId,
        year: input.year,
        tier: input.tier,
        region: input.region ?? null,
        // A gift added from inside the app records the contact's own name as its
        // source, so it is distinguishable from workbook-imported rows later.
        sourceName: existing.name,
        notes: input.notes ?? null,
      });
      return { ok: true, contactId: input.contactId, year: input.year, tier: input.tier } as const;
    }),

  /** Take a contact off a year's gift list. */
  removeContactGift: protectedProcedure
    .input(z.object({ contactId: z.number(), year: z.number().int().min(2000).max(2100) }))
    .mutation(async ({ input }) => {
      await db.deleteContactGift(input.contactId, input.year);
      return { ok: true } as const;
    }),

  /**
   * Queue of gift-list rows the importer would not guess: probable matches, likely
   * namesakes, names absent from the directory, and cells that held a quantity.
   */
  giftReview: protectedProcedure
    .input(z.object({ status: z.enum(["pending", "resolved", "dismissed"]).optional() }).optional())
    .query(async ({ input }) => {
      const [rows, contacts] = await Promise.all([
        db.listGiftReview(input?.status ?? "pending"),
        db.listAllPaymentContacts(),
      ]);
      const byId = new Map(contacts.map(c => [c.id, c]));
      const items = rows.map(r => {
        type Candidate = { id: number; name: string; email?: string | null; company?: string | null; group?: string | null; score?: number | null };
        let candidates: Candidate[] = [];
        if (r.candidates) {
          try {
            candidates = JSON.parse(r.candidates) as Candidate[];
          } catch {
            // A malformed blob must not take the whole queue down.
            candidates = [];
          }
        }
        return {
          id: r.id,
          year: r.year,
          sourceName: r.sourceName,
          sourceGroup: r.sourceGroup,
          region: r.region,
          tier: r.tier,
          comment: r.comment,
          matchKind: r.matchKind,
          status: r.status,
          resolvedContactId: r.resolvedContactId,
          resolvedContactName: r.resolvedContactId ? (byId.get(r.resolvedContactId)?.name ?? null) : null,
          // Candidates that were since archived or deleted are dropped, so the
          // reviewer is never offered a contact that no longer exists.
          candidates: candidates.filter(c => byId.has(c.id)),
        };
      });
      const counts = {
        probable: items.filter(i => i.matchKind === "probable").length,
        weak: items.filter(i => i.matchKind === "weak").length,
        unmatched: items.filter(i => i.matchKind === "unmatched").length,
        countRequest: items.filter(i => i.matchKind === "count_request").length,
        total: items.length,
      };
      return { items, counts };
    }),

  /** Accept a review row: the chosen contact joins that year's gift list. */
  resolveGiftReview: protectedProcedure
    .input(z.object({ id: z.number(), contactId: z.number() }))
    .mutation(async ({ input }) => {
      const [row] = await db.getGiftReviewRow(input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Review row not found" });
      const [contact] = await db.getPaymentContact(input.contactId);
      if (!contact) throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
      await db.upsertContactGift({
        contactId: input.contactId,
        year: row.year,
        tier: row.tier,
        region: row.region,
        sourceName: row.sourceName,
        sourceGroup: row.sourceGroup,
        notes: row.comment,
      });
      await db.setGiftReviewStatus(input.id, "resolved", input.contactId);
      return { ok: true, contactId: input.contactId, year: row.year } as const;
    }),

  /** Set a review row aside without touching the gift list. */
  dismissGiftReview: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1).max(2000) }))
    .mutation(async ({ input }) => {
      const dismissed = await db.dismissGiftReviewBulk(input.ids);
      return { ok: true, dismissed } as const;
    }),

  /** Archive a contact: it leaves the directory but keeps its history. */
  archiveContact: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {

    const [existing] = await db.getPaymentContact(input.id);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
    await db.archivePaymentContact(input.id);
    return { ok: true } as const;
  }),

  restoreContact: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const [existing] = await db.getPaymentContact(input.id);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
    await db.restorePaymentContact(input.id);
    return { ok: true } as const;
  }),

  /**
   * Merge duplicate contacts into one survivor. The chosen field values are
   * written onto the survivor, custom-field values are carried over when the
   * survivor has none, and the losers are archived (never deleted) with a
   * pointer back to the survivor.
   */
  mergeContacts: protectedProcedure
    .input(
      z.object({
        survivorId: z.number(),
        loserIds: z.array(z.number()).min(1),
        fields: z.object({
          name: z.string().min(1).max(255),
          email: z.string().min(3).max(320),
          phone: z.string().max(20).nullable(),
          title: z.string().max(255).nullable(),
          contactType: z.enum(contactTypes).optional(),
          customerId: z.number(),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.loserIds.includes(input.survivorId)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A contact cannot be merged into itself" });
      }
      const [survivor] = await db.getPaymentContact(input.survivorId);
      if (!survivor) throw new TRPCError({ code: "NOT_FOUND", message: "Survivor contact not found" });

      await db.updatePaymentContact(input.survivorId, {
        name: input.fields.name,
        email: input.fields.email,
        phone: input.fields.phone,
        title: input.fields.title,
        ...(input.fields.contactType ? { contactType: input.fields.contactType } : {}),
        customerId: input.fields.customerId,
      });

      // Carry over custom values the survivor is missing, then archive the losers.
      const defs = await db.listCustomFieldDefs("contact");
      if (defs.length > 0) {
        const keys = [String(input.survivorId), ...input.loserIds.map(String)];
        const values = await db.listCustomFieldValues("contact", keys);
        for (const def of defs) {
          const own = values.find(v => v.fieldId === def.id && v.recordKey === String(input.survivorId));
          if (own && (own.value ?? "").trim() !== "") continue;
          const donor = input.loserIds
            .map(id => values.find(v => v.fieldId === def.id && v.recordKey === String(id)))
            .find(v => v && (v.value ?? "").trim() !== "");
          if (!donor) continue;
          await db.setCustomFieldValue({
            fieldId: def.id,
            entity: "contact",
            recordKey: String(input.survivorId),
            value: donor.value ?? null,
            updatedBy: ctx.user.id,
          });
        }
      }

      for (const id of input.loserIds) await db.archivePaymentContact(id, input.survivorId);
      return { ok: true, archived: input.loserIds.length } as const;
    }),

  fields: protectedProcedure
    .input(z.object({ entity: entitySchema.optional() }).optional())
    .query(async ({ input }) => db.listCustomFieldDefs(input?.entity)),

  // ------------------------- Excel import -------------------------

  /**
   * Step 1 of import: read the sheet and return its headers plus a sample, so
   * the user maps columns instead of us guessing a fixed template.
   */
  importInspect: protectedProcedure
    .input(z.object({ fileBase64: z.string().min(10) }))
    .mutation(async ({ input }) => {
      const { headers, rows } = await parseSheet(input.fileBase64);
      if (headers.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "No columns found in the sheet" });
      return { headers, sample: rows.slice(0, 5), rowCount: rows.length };
    }),

  /**
   * Step 2: turn the mapped sheet into a plan of creates / updates / skips.
   * Nothing is written yet — the user reviews the plan first.
   */
  importPreview: protectedProcedure
    .input(z.object({ fileBase64: z.string().min(10), mapping: z.record(z.string(), z.string()) }))
    .mutation(async ({ input }) => planContactImport(input.fileBase64, input.mapping)),

  /** Step 3: apply the reviewed plan. Only rows the user kept are written. */
  importApply: protectedProcedure
    .input(
      z.object({
        fileBase64: z.string().min(10),
        mapping: z.record(z.string(), z.string()),
        skipRowIndexes: z.array(z.number()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const plan = await planContactImport(input.fileBase64, input.mapping);
      const skip = new Set(input.skipRowIndexes ?? []);
      const defs = await db.listCustomFieldDefs("contact");
      const defByKey = new Map(defs.map(d => [d.fieldKey, d]));
      let created = 0;
      let updated = 0;

      for (const row of plan.rows) {
        if (row.action === "skip" || skip.has(row.rowIndex)) continue;
        let contactId = row.contactId ?? null;
        if (row.action === "create") {
          if (!row.customerId) continue;
          contactId = await db.addPaymentContact({
            customerId: row.customerId,
            name: row.values.name || "Unnamed",
            email: row.values.email ?? "",
            phone: row.values.phone ?? null,
            title: row.values.title ?? null,
            // Sheets without a Type column fall back to the column default.
            contactType: (row.values.contactType as "Person" | "Department") || "Person",
          });
          created += 1;
        } else if (row.action === "update" && contactId) {
          const patch: Record<string, string | number | null> = {};
          if (row.values.name) patch.name = row.values.name;
          if (row.values.email) patch.email = row.values.email;
          if (row.values.phone !== undefined) patch.phone = row.values.phone || null;
          if (row.values.title !== undefined) patch.title = row.values.title || null;
          if (row.values.contactType) patch.contactType = row.values.contactType;
          if (row.customerId) patch.customerId = row.customerId;
          if (Object.keys(patch).length > 0) await db.updatePaymentContact(contactId, patch as any);
          updated += 1;
        }

        // Custom-field columns are written after the core row exists.
        if (contactId) {
          for (const [fieldKey, value] of Object.entries(row.custom)) {
            const def = defByKey.get(fieldKey);
            if (!def) continue;
            await db.setCustomFieldValue({
              fieldId: def.id,
              entity: "contact",
              recordKey: String(contactId),
              value: value || null,
              updatedBy: ctx.user.id,
            });
          }
        }
      }
      return { created, updated } as const;
    }),

  createField: protectedProcedure
    .input(
      z.object({
        entity: entitySchema,
        label: z.string().min(1).max(128),
        fieldType: z.enum(customFieldTypes).default("text"),
        options: z.array(z.string().min(1).max(128)).optional(),
        helpText: z.string().max(255).optional(),
        required: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Derive a stable machine key from the label, keeping it unique per entity.
      const base =
        input.label
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_|_$/g, "")
          .slice(0, 48) || "field";
      const existing = await db.listCustomFieldDefs(input.entity);
      let fieldKey = base;
      let n = 2;
      while (existing.some(d => d.fieldKey === fieldKey)) fieldKey = `${base}_${n++}`;
      const sortOrder = existing.length > 0 ? Math.max(...existing.map(d => d.sortOrder)) + 1 : 0;
      const id = await db.createCustomFieldDef({
        entity: input.entity,
        fieldKey,
        label: input.label,
        fieldType: input.fieldType,
        options: input.options && input.options.length > 0 ? JSON.stringify(input.options) : null,
        helpText: input.helpText ?? null,
        required: input.required ? 1 : 0,
        sortOrder,
        createdBy: ctx.user.id,
      });
      return { id, fieldKey };
    }),

  updateField: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        label: z.string().min(1).max(128).optional(),
        options: z.array(z.string().min(1).max(128)).optional(),
        helpText: z.string().max(255).nullable().optional(),
        required: z.boolean().optional(),
        sortOrder: z.number().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const def = await db.getCustomFieldDef(input.id);
      if (!def) throw new TRPCError({ code: "NOT_FOUND", message: "Field not found" });
      await db.updateCustomFieldDef(input.id, {
        ...(input.label !== undefined && { label: input.label }),
        ...(input.options !== undefined && { options: input.options.length > 0 ? JSON.stringify(input.options) : null }),
        ...(input.helpText !== undefined && { helpText: input.helpText }),
        ...(input.required !== undefined && { required: input.required ? 1 : 0 }),
        ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
      });
      return { ok: true } as const;
    }),

  /** Archive keeps stored values, so the field can come back without data loss. */
  archiveField: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const def = await db.getCustomFieldDef(input.id);
    if (!def) throw new TRPCError({ code: "NOT_FOUND", message: "Field not found" });
    await db.archiveCustomFieldDef(input.id);
    return { ok: true } as const;
  }),

  setFieldValue: protectedProcedure
    .input(
      z.object({
        fieldId: z.number(),
        recordKey: z.string().min(1).max(255),
        value: z.string().max(4000).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const def = await db.getCustomFieldDef(input.fieldId);
      if (!def || def.archived === 1) throw new TRPCError({ code: "NOT_FOUND", message: "Field not found" });
      await db.setCustomFieldValue({
        fieldId: input.fieldId,
        entity: def.entity,
        recordKey: input.recordKey,
        value: input.value,
        updatedBy: ctx.user.id,
      });
      return { ok: true } as const;
    }),

  /** All custom values of one record, resolved to `{ fieldKey: value }`. */
  recordFields: protectedProcedure
    .input(z.object({ entity: entitySchema, recordKey: z.string().min(1).max(255) }))
    .query(async ({ ctx, input }) => {
      const [defs, values, cardLayout] = await Promise.all([
        db.listCustomFieldDefs(input.entity),
        db.listCustomFieldValues(input.entity, [input.recordKey]),
        db.getListLayout(ctx.user.id, `address-book-card-${input.entity}`),
      ]);
      // Fields the user chose to hide on cards stay in the data but leave the card.
      let hiddenOnCard: string[] = [];
      if (cardLayout) {
        try {
          hiddenOnCard = (JSON.parse(cardLayout.config) as { hidden?: string[] }).hidden ?? [];
        } catch {
          hiddenOnCard = [];
        }
      }
      const byField = new Map(values.map(v => [v.fieldId, v.value ?? ""]));
      return defs
        .filter(d => !hiddenOnCard.includes(d.fieldKey))
        .map(d => ({
          id: d.id,
          fieldKey: d.fieldKey,
          label: d.label,
          fieldType: d.fieldType,
          options: d.options ? (JSON.parse(d.options) as string[]) : [],
          helpText: d.helpText,
          required: d.required === 1,
          value: byField.get(d.id) ?? "",
        }));
    }),

  // ------------------------- saved views -------------------------

  views: protectedProcedure.input(z.object({ entity: entitySchema })).query(async ({ ctx, input }) => {
    const rows = await db.listSavedViews(input.entity, ctx.user.id);
    return rows.map(v => ({ ...v, shared: v.shared === 1, isOwner: v.ownerId === ctx.user.id }));
  }),

  saveView: protectedProcedure
    .input(
      z.object({
        id: z.number().optional(),
        entity: entitySchema,
        name: z.string().min(1).max(128),
        config: z.string().min(2).max(8000),
        shared: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.id) {
        const existing = await db.getSavedView(input.id);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "View not found" });
        if (existing.ownerId !== ctx.user.id && existing.shared !== 1) {
          throw new TRPCError({ code: "FORBIDDEN", message: "This view belongs to another user" });
        }
        await db.updateSavedView(input.id, {
          name: input.name,
          config: input.config,
          ...(input.shared !== undefined && { shared: input.shared ? 1 : 0 }),
        });
        return { id: input.id };
      }
      const id = await db.createSavedView({
        entity: input.entity,
        name: input.name,
        config: input.config,
        shared: input.shared ? 1 : 0,
        ownerId: ctx.user.id,
      });
      return { id };
    }),

  deleteView: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const existing = await db.getSavedView(input.id);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "View not found" });
    if (existing.ownerId !== ctx.user.id) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Only the owner can delete this view" });
    }
    await db.deleteSavedView(input.id);
    return { ok: true } as const;
  }),

  // ------------------------- column layout -------------------------

  layout: protectedProcedure.input(z.object({ listKey: z.string().min(1).max(64) })).query(async ({ ctx, input }) => {
    const row = await db.getListLayout(ctx.user.id, input.listKey);
    if (!row) return { hidden: [] as string[], order: [] as string[] };
    try {
      const parsed = JSON.parse(row.config) as { hidden?: string[]; order?: string[] };
      return { hidden: parsed.hidden ?? [], order: parsed.order ?? [] };
    } catch {
      return { hidden: [] as string[], order: [] as string[] };
    }
  }),

  saveLayout: protectedProcedure
    .input(
      z.object({
        listKey: z.string().min(1).max(64),
        hidden: z.array(z.string().max(64)),
        order: z.array(z.string().max(64)),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await db.setListLayout(ctx.user.id, input.listKey, JSON.stringify({ hidden: input.hidden, order: input.order }));
      return { ok: true } as const;
    }),

  // ------------------------- export -------------------------

  /**
   * Export exactly what the user sees: the client sends the visible columns and
   * the already-filtered rows, so list and file can never disagree.
   */
  export: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(120),
        format: z.enum(["xlsx", "pdf", "csv"]),
        columns: z.array(z.object({ header: z.string().max(120), key: z.string().max(64) })).min(1).max(40),
        rows: z.array(z.record(z.string(), z.union([z.string(), z.number()]))).max(20000),
      }),
    )
    .mutation(async ({ input }) => {
      const spec: TableSpec = { title: input.title, columns: input.columns, rows: input.rows };
      const stamp = new Date().toISOString().slice(0, 10);
      const slug = input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "address-book";
      if (input.format === "csv") {
        const esc = (v: string | number) => {
          const s = String(v ?? "");
          return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const lines = [
          input.columns.map(c => esc(c.header)).join(";"),
          ...input.rows.map(r => input.columns.map(c => esc(r[c.key] ?? "")).join(";")),
        ];
        // BOM so Excel opens Greek characters correctly.
        const buf = Buffer.from("\uFEFF" + lines.join("\r\n"), "utf8");
        return {
          filename: `${slug}-${stamp}.csv`,
          mimeType: "text/csv;charset=utf-8",
          base64: buf.toString("base64"),
        };
      }
      if (input.format === "pdf") {
        const buf = await buildPdf(spec);
        return { filename: `${slug}-${stamp}.pdf`, mimeType: "application/pdf", base64: buf.toString("base64") };
      }
      const buf = await buildExcel(spec);
      return {
        filename: `${slug}-${stamp}.xlsx`,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        base64: buf.toString("base64"),
      };
    }),
});
