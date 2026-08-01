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
import { addressBookEntities, customFieldTypes } from "../../drizzle/schema";

const entitySchema = z.enum(addressBookEntities);

/** Group name used as the record identity for group-level custom values. */
const groupKeyOf = (c: { customerGroup: string | null; name: string }) => (c.customerGroup ?? "").trim() || c.name;

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
    return {
      group: groups.size,
      customer: customers.length,
      vessel: vessels.length,
      contact: contacts.length,
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
      const cust = custById.get(ct.customerId);
      if (!cust) continue;
      const row = agg.get(groupKeyOf(cust));
      if (row) row.contacts += 1;
    }
    for (const v of vessels) {
      if (!v.customerId) continue;
      const cust = custById.get(v.customerId);
      if (!cust) continue;
      const row = agg.get(groupKeyOf(cust));
      if (row) row.vessels += 1;
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
      }))
      .sort((a, b) => a.group.localeCompare(b.group));
    return withCustomValues("group", rows);
  }),

  /** Directory list of companies — every customer row, including contacts-only ones. */
  customers: protectedProcedure.query(async () => {
    const [customers, contacts] = await Promise.all([db.listCustomers(), db.listAllPaymentContacts()]);
    const contactCount = new Map<number, number>();
    for (const ct of contacts) contactCount.set(ct.customerId, (contactCount.get(ct.customerId) ?? 0) + 1);
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
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    return withCustomValues("vessel", rows);
  }),

  /** Directory list of contacts, with company and group attached. */
  contacts: protectedProcedure.query(async () => {
    const [contacts, customers] = await Promise.all([db.listAllPaymentContacts(), db.listCustomers()]);
    const custById = new Map(customers.map(c => [c.id, c]));
    const rows = contacts
      .map(ct => {
        const cust = custById.get(ct.customerId);
        return {
          recordKey: String(ct.id),
          id: ct.id,
          customerId: ct.customerId,
          name: ct.name,
          title: ct.title ?? null,
          email: ct.email,
          phone: ct.phone ?? null,
          companyName: cust?.name ?? "—",
          group: cust ? groupKeyOf(cust) : "—",
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    return withCustomValues("contact", rows);
  }),

  /** Cross-entity search: one query, results grouped by entity type. */
  search: protectedProcedure
    .input(z.object({ query: z.string().min(2).max(100) }))
    .query(async ({ input }) => {
      const q = input.query.trim().toLowerCase();
      const [customers, vessels, contacts] = await Promise.all([
        db.listCustomers(),
        db.listVessels(),
        db.listAllPaymentContacts(),
      ]);
      const custById = new Map(customers.map(c => [c.id, c]));
      const groupNames = Array.from(new Set(customers.map(c => groupKeyOf(c))));
      return {
        groups: groupNames
          .filter(g => g.toLowerCase().includes(q))
          .slice(0, 8)
          .map(g => ({ name: g })),
        customers: customers
          .filter(c => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q) || (c.vatNumber ?? "").includes(q))
          .slice(0, 8)
          .map(c => ({ id: c.id, name: c.name, code: c.code, group: groupKeyOf(c) })),
        vessels: vessels
          .filter(v => v.name.toLowerCase().includes(q) || (v.imo ?? "").toLowerCase().includes(q))
          .slice(0, 8)
          .map(v => ({ id: v.id, name: v.name, imo: v.imo ?? null })),
        contacts: contacts
          .filter(
            ct =>
              ct.name.toLowerCase().includes(q) ||
              ct.email.toLowerCase().includes(q) ||
              (ct.phone ?? "").toLowerCase().includes(q),
          )
          .slice(0, 8)
          .map(ct => {
            const cust = custById.get(ct.customerId);
            return {
              id: ct.id,
              name: ct.name,
              email: ct.email,
              companyName: cust?.name ?? "—",
              group: cust ? groupKeyOf(cust) : "—",
            };
          }),
      };
    }),

  // ------------------------- custom fields -------------------------

  fields: protectedProcedure
    .input(z.object({ entity: entitySchema.optional() }).optional())
    .query(async ({ input }) => db.listCustomFieldDefs(input?.entity)),

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
    .query(async ({ input }) => {
      const [defs, values] = await Promise.all([
        db.listCustomFieldDefs(input.entity),
        db.listCustomFieldValues(input.entity, [input.recordKey]),
      ]);
      const byField = new Map(values.map(v => [v.fieldId, v.value ?? ""]));
      return defs.map(d => ({
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
