import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as opsDb from "../opsDb";
import * as db from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { certUrgency, daysUntilExpiry } from "@shared/certificateExpiry";
import { runCertificateReminders } from "../lib/certificateReminders";
import {
  opsQuotationStatuses,
  opsContractStatuses,
  opsPaymentMethods,
  opsAssetStatuses,
  opsOrderStatuses,
  opsQuotationItemTypes,
  opsLibraryItemTypes,
  opsSerialTrackedTypes,
  opsQuotaTypes,
  opsVesselEventTypes,
} from "../../drizzle/schema";

// ═══════════════════════════════════════════════════════════════════════════════
// CONTRACT HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build one vessel's installments. Each vessel is billed on its own schedule, so the
 * amount split is the agreed price for a single vessel and the first due date is that
 * vessel's shipment date — the moment it actually goes live. Yearly steps from there.
 */
async function generateVesselSchedule(
  contractId: number,
  vesselId: number,
  pricePerVessel: number,
  installmentCount: number,
  shipmentDate: number,
) {
  const per = pricePerVessel / installmentCount;
  const start = new Date(shipmentDate);
  for (let i = 0; i < installmentCount; i++) {
    const due = Date.UTC(start.getUTCFullYear() + i, start.getUTCMonth(), start.getUTCDate());
    // Rounding remainder lands on the last installment so the vessel total is exact.
    const amount = i === installmentCount - 1 ? pricePerVessel - per * (installmentCount - 1) : per;
    await opsDb.createPaymentScheduleItem({
      contractId,
      vesselId,
      installmentNumber: i + 1,
      dueDate: due,
      amount: amount.toFixed(2),
    });
  }
}

/**
 * Regenerate the installments of a single vessel. Refuses to touch a vessel whose
 * installments are already invoiced or paid, and clears the schedule of a vessel that
 * has not shipped yet, since an unshipped vessel is not billable.
 */
async function syncVesselSchedule(contractId: number, vesselId: number) {
  const contract = await opsDb.getOpsContract(contractId);
  if (!contract) return;
  const existing = await opsDb.listPaymentScheduleForVessel(contractId, vesselId);
  if (existing.some(p => p.status !== "Pending")) return;
  const assignments = await opsDb.listVesselAssignments(contractId);
  const assignment = assignments.find(a => a.vesselId === vesselId);
  await opsDb.deletePaymentScheduleItemsForVessel(contractId, vesselId);
  if (!assignment?.shipmentDate) return;
  await generateVesselSchedule(
    contractId,
    vesselId,
    Number(contract.pricePerVessel),
    contract.installmentCount,
    assignment.shipmentDate,
  );
}

/**
 * Rebuild every shipped vessel's schedule, e.g. after the per-vessel price or the
 * installment count changes. Vessels with billed installments keep what they have.
 */
async function syncAllVesselSchedules(contractId: number) {
  const assignments = await opsDb.listVesselAssignments(contractId);
  // Fleet-wide rows from the pre-per-vessel model would double-count the contract.
  await opsDb.deleteFleetWidePaymentScheduleItems(contractId);
  for (const a of assignments) await syncVesselSchedule(contractId, a.vesselId);
}

/** Keep the contract total in step with the fleet: price per vessel x vessels on the contract. */
async function recalcContractTotal(contractId: number) {
  const contract = await opsDb.getOpsContract(contractId);
  if (!contract) return;
  const assignments = await opsDb.listVesselAssignments(contractId);
  const totalValue = Number(contract.pricePerVessel) * Math.max(assignments.length, 1);
  if (totalValue.toFixed(2) === Number(contract.totalValue).toFixed(2)) return;
  await opsDb.updateOpsContract(contractId, { totalValue: totalValue.toFixed(2) } as any);
}

/**
 * Create one serial-tracked equipment row per unit of every Instrument in the contract's
 * product list, for a single vessel. Idempotent: rows already present for that vessel are
 * counted, never duplicated, so the action can be re-run after products are added.
 */
async function generateEquipmentForVessel(contractId: number, vesselId: number) {
  const contract = await opsDb.getOpsContract(contractId);
  if (!contract) return { created: 0, skipped: 0 };
  const [library, existing] = await Promise.all([
    opsDb.listContractLibrary(contractId),
    opsDb.listAssets({ contractId, vesselId }),
  ]);
  const taken = new Set(existing.map(a => a.serialNumber));
  let created = 0;
  let skipped = 0;
  for (const item of library) {
    if (!opsSerialTrackedTypes.includes(item.itemType as (typeof opsSerialTrackedTypes)[number])) continue;
    for (let i = 0; i < item.quantity; i++) {
      const serial = `${contract.contractNumber}-${item.id}-${vesselId}-${i + 1}`;
      if (taken.has(serial)) {
        skipped++;
        continue;
      }
      await opsDb.createAsset({
        serialNumber: serial,
        catalogItemId: item.catalogId,
        name: item.name,
        vesselId,
        contractId,
        status: "Not Supplied",
      });
      taken.add(serial);
      created++;
    }
  }
  return { created, skipped };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CATALOG ROUTERS
// ═══════════════════════════════════════════════════════════════════════════════

export const opsCatalogRouter = router({
  /** Flat lookup across services, products and consumables, for contract auto-fill. */
  pricelist: protectedProcedure.query(() => opsDb.listPricelist()),
  services: router({
    list: protectedProcedure.query(() => opsDb.listServices()),
    get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const item = await opsDb.getService(input.id);
      if (!item) throw new TRPCError({ code: "NOT_FOUND" });
      return item;
    }),
    create: protectedProcedure
      .input(z.object({ name: z.string().min(1), description: z.string().optional(), defaultCost: z.string().optional(), sellingPrice: z.string().optional(), category: z.string().optional() }))
      .mutation(async ({ input }) => {
        const id = await opsDb.createService({ name: input.name, description: input.description, defaultCost: input.defaultCost ?? "0", sellingPrice: input.sellingPrice ?? "0", category: input.category });
        return { id };
      }),
    update: protectedProcedure
      .input(z.object({ id: z.number(), name: z.string().optional(), description: z.string().nullable().optional(), defaultCost: z.string().optional(), sellingPrice: z.string().optional(), category: z.string().nullable().optional(), active: z.boolean().optional() }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await opsDb.updateService(id, data as any);
        return { success: true };
      }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      await opsDb.deleteService(input.id);
      return { success: true };
    }),
  }),
  assets: router({
    list: protectedProcedure.query(() => opsDb.listAssetCatalog()),
    create: protectedProcedure
      .input(z.object({ name: z.string().min(1), description: z.string().optional(), defaultCost: z.string().optional(), sellingPrice: z.string().optional(), category: z.string().optional() }))
      .mutation(async ({ input }) => {
        const id = await opsDb.createAssetCatalogItem({ name: input.name, description: input.description, defaultCost: input.defaultCost ?? "0", sellingPrice: input.sellingPrice ?? "0", category: input.category });
        return { id };
      }),
    update: protectedProcedure
      .input(z.object({ id: z.number(), name: z.string().optional(), description: z.string().nullable().optional(), defaultCost: z.string().optional(), sellingPrice: z.string().optional(), category: z.string().nullable().optional(), active: z.boolean().optional() }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await opsDb.updateAssetCatalogItem(id, data as any);
        return { success: true };
      }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      await opsDb.deleteAssetCatalogItem(input.id);
      return { success: true };
    }),
  }),
  consumables: router({
    list: protectedProcedure.query(() => opsDb.listConsumableCatalog()),
    create: protectedProcedure
      .input(z.object({ name: z.string().min(1), description: z.string().optional(), unit: z.string().optional(), defaultCostPerUnit: z.string().optional(), sellingPricePerUnit: z.string().optional(), category: z.string().optional() }))
      .mutation(async ({ input }) => {
        const id = await opsDb.createConsumableCatalogItem({ name: input.name, description: input.description, unit: input.unit ?? "pcs", defaultCostPerUnit: input.defaultCostPerUnit ?? "0", sellingPricePerUnit: input.sellingPricePerUnit ?? "0", category: input.category });
        return { id };
      }),
    update: protectedProcedure
      .input(z.object({ id: z.number(), name: z.string().optional(), description: z.string().nullable().optional(), unit: z.string().optional(), defaultCostPerUnit: z.string().optional(), sellingPricePerUnit: z.string().optional(), category: z.string().nullable().optional(), active: z.boolean().optional() }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await opsDb.updateConsumableCatalogItem(id, data as any);
        return { success: true };
      }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      await opsDb.deleteConsumableCatalogItem(input.id);
      return { success: true };
    }),
  }),
});

// ═══════════════════════════════════════════════════════════════════════════════
// QUOTATIONS ROUTER
// ═══════════════════════════════════════════════════════════════════════════════

export const opsQuotationsRouter = router({
  list: protectedProcedure.query(async () => {
    const [quotations, customers] = await Promise.all([opsDb.listQuotations(), db.listCustomers()]);
    const byId = new Map(customers.map(c => [c.id, c]));
    return quotations.map(q => ({
      ...q,
      customerName: byId.get(q.customerId)?.name ?? "—",
      customerGroup: (byId.get(q.customerId)?.customerGroup ?? "").trim() || (byId.get(q.customerId)?.name ?? "—"),
    }));
  }),
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const quotation = await opsDb.getQuotation(input.id);
    if (!quotation) throw new TRPCError({ code: "NOT_FOUND" });
    const items = await opsDb.listQuotationItems(input.id);
    const customer = await db.getCustomer(quotation.customerId);
    return { quotation, items, customer };
  }),
  create: protectedProcedure
    .input(z.object({
      quotationNumber: z.string().min(1),
      customerId: z.number(),
      validUntil: z.number().optional(),
      notes: z.string().optional(),
      items: z.array(z.object({
        itemType: z.enum(opsQuotationItemTypes),
        catalogId: z.number(),
        name: z.string().min(1),
        quantity: z.number().int().min(1),
        unitCost: z.string(),
        sellingPrice: z.string(),
        notes: z.string().optional(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const totalCost = input.items.reduce((s, i) => s + Number(i.unitCost) * i.quantity, 0);
      const sellingPrice = input.items.reduce((s, i) => s + Number(i.sellingPrice) * i.quantity, 0);
      const margin = sellingPrice > 0 ? ((sellingPrice - totalCost) / sellingPrice) * 100 : 0;
      const id = await opsDb.createQuotation({
        quotationNumber: input.quotationNumber,
        customerId: input.customerId,
        totalCost: totalCost.toFixed(2),
        sellingPrice: sellingPrice.toFixed(2),
        margin: margin.toFixed(2),
        validUntil: input.validUntil,
        notes: input.notes,
        createdBy: ctx.user.id,
      });
      for (const item of input.items) {
        await opsDb.createQuotationItem({ quotationId: id, ...item });
      }
      return { id };
    }),
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(opsQuotationStatuses).optional(),
      validUntil: z.number().nullable().optional(),
      notes: z.string().nullable().optional(),
      items: z.array(z.object({
        itemType: z.enum(opsQuotationItemTypes),
        catalogId: z.number(),
        name: z.string().min(1),
        quantity: z.number().int().min(1),
        unitCost: z.string(),
        sellingPrice: z.string(),
        notes: z.string().optional(),
      })).optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, items, ...data } = input;
      if (items) {
        await opsDb.deleteQuotationItems(id);
        const totalCost = items.reduce((s, i) => s + Number(i.unitCost) * i.quantity, 0);
        const sellingPrice = items.reduce((s, i) => s + Number(i.sellingPrice) * i.quantity, 0);
        const margin = sellingPrice > 0 ? ((sellingPrice - totalCost) / sellingPrice) * 100 : 0;
        await opsDb.updateQuotation(id, { ...data, totalCost: totalCost.toFixed(2), sellingPrice: sellingPrice.toFixed(2), margin: margin.toFixed(2) } as any);
        for (const item of items) {
          await opsDb.createQuotationItem({ quotationId: id, ...item });
        }
      } else {
        await opsDb.updateQuotation(id, data as any);
      }
      return { success: true };
    }),
  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    await opsDb.deleteQuotationItems(input.id);
    await opsDb.deleteQuotation(input.id);
    return { success: true };
  }),
  /** Convert an approved quotation into a contract. */
  convertToContract: protectedProcedure
    .input(z.object({
      quotationId: z.number(),
      contractNumber: z.string().min(1),
      title: z.string().min(1),
      startDate: z.number(),
      endDate: z.number(),
      installmentCount: z.number().int().min(1).max(30),
    }))
    .mutation(async ({ ctx, input }) => {
      const quotation = await opsDb.getQuotation(input.quotationId);
      if (!quotation) throw new TRPCError({ code: "NOT_FOUND" });
      if (quotation.status !== "Approved") throw new TRPCError({ code: "BAD_REQUEST", message: "Only approved quotations can be converted" });
      const items = await opsDb.listQuotationItems(input.quotationId);
      const totalValue = Number(quotation.sellingPrice);
      // Create the contract
      const contractId = await opsDb.createOpsContract({
        contractNumber: input.contractNumber,
        quotationId: input.quotationId,
        customerId: quotation.customerId,
        title: input.title,
        status: "Offer",
        totalValue: totalValue.toFixed(2),
        pricePerVessel: totalValue.toFixed(2),
        installmentCount: input.installmentCount,
        startDate: input.startDate,
        endDate: input.endDate,
        createdBy: ctx.user.id,
      });
      // Carry the quotation lines over as the contract's product list.
      for (const item of items) {
        const nature = item.itemType === "Consumable" ? "Consumable" : item.itemType === "Asset" ? "Equipment" : "Other";
        await opsDb.createContractLibraryItem({
          contractId,
          itemType: nature as any,
          catalogId: item.catalogId,
          name: item.name,
          quantity: item.quantity,
          unitCost: Number(item.unitCost ?? 0).toFixed(2),
          sellingPrice: Number(item.sellingPrice ?? 0).toFixed(2),
          quotaType: nature === "Consumable" ? "Annual" : null,
          quotaLimit: nature === "Consumable" ? item.quantity : null,
        } as any);
      }
      // Mark quotation as converted. Installments are created per vessel once each ships.
      await opsDb.updateQuotation(input.quotationId, { status: "Approved" });
      return { contractId };
    }),
});

// ═══════════════════════════════════════════════════════════════════════════════
// OPERATIONS CONTRACTS ROUTER
// ═══════════════════════════════════════════════════════════════════════════════

export const opsContractsRouter = router({
  list: protectedProcedure.query(async () => {
    const [contracts, customers, schedules, assignments] = await Promise.all([
      opsDb.listOpsContracts(),
      db.listCustomers(),
      opsDb.listPaymentSchedule(),
      opsDb.listVesselAssignments(),
    ]);
    const byId = new Map(customers.map(c => [c.id, c]));
    return contracts.map(c => {
      const payments = schedules.filter(p => p.contractId === c.id);
      const vesselCount = assignments.filter(a => a.contractId === c.id).length;
      return {
        ...c,
        customerName: byId.get(c.customerId)?.name ?? "—",
        customerGroup: (byId.get(c.customerId)?.customerGroup ?? "").trim() || (byId.get(c.customerId)?.name ?? "—"),
        totalInstallments: payments.length,
        paidInstallments: payments.filter(p => p.status === "Paid").length,
        collectedAmount: payments.filter(p => p.status === "Paid").reduce((s, p) => s + Number(p.amount), 0),
        vesselCount,
      };
    });
  }),
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const contract = await opsDb.getOpsContract(input.id);
    if (!contract) throw new TRPCError({ code: "NOT_FOUND" });
    const [library, schedule, assignments, customers, vessels] = await Promise.all([
      opsDb.listContractLibrary(input.id),
      opsDb.listPaymentSchedule(input.id),
      opsDb.listVesselAssignments(input.id),
      db.listCustomers(),
      db.listVessels(),
    ]);
    const customer = customers.find(c => c.id === contract.customerId);
    // Supply progress per vessel: an equipment unit counts as supplied once it has left the warehouse.
    const contractAssets = await opsDb.listAssets({ contractId: input.id });
    const suppliedStatuses = new Set(["In Transit", "Active", "Pending Return", "Returned"]);
    const assignedVessels = assignments.map(a => {
      const v = vessels.find(v => v.id === a.vesselId);
      const own = contractAssets.filter(x => x.vesselId === a.vesselId);
      return {
        ...a,
        vesselName: v?.name ?? "—",
        vesselImo: v?.imo ?? null,
        equipmentTotal: own.length,
        equipmentSupplied: own.filter(x => suppliedStatuses.has(String(x.status))).length,
      };
    });
    // Each vessel is billed on its own schedule, so label every installment with its vessel.
    const vesselName = (id: number | null) =>
      id == null ? null : (vessels.find(v => v.id === id)?.name ?? `Vessel ${id}`);
    const labelledSchedule = schedule
      .map(p => ({ ...p, vesselName: vesselName(p.vesselId) }))
      .sort((a, b) =>
        (a.vesselName ?? "").localeCompare(b.vesselName ?? "") ||
        a.installmentNumber - b.installmentNumber);
    // Product totals per vessel, so the offer is derived from the product list itself.
    const costPerVessel = library.reduce((s, i) => s + Number(i.unitCost) * i.quantity, 0);
    const listPricePerVessel = library.reduce((s, i) => s + Number(i.sellingPrice) * i.quantity, 0);
    const margin = listPricePerVessel > 0 ? ((listPricePerVessel - costPerVessel) / listPricePerVessel) * 100 : 0;
    return {
      contract,
      library,
      schedule: labelledSchedule,
      assignments: assignedVessels,
      customer,
      totals: { costPerVessel, listPricePerVessel, margin },
    };
  }),
  create: protectedProcedure
    .input(z.object({
      contractNumber: z.string().min(1),
      customerId: z.number(),
      title: z.string().min(1),
      pricePerVessel: z.number().min(0),
      startDate: z.number(),
      endDate: z.number(),
      installmentCount: z.number().int().min(1).max(30),
      notes: z.string().optional(),
      vesselIds: z.array(z.number()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.endDate <= input.startDate) throw new TRPCError({ code: "BAD_REQUEST", message: "End date must be after start date" });
      const vesselIds = input.vesselIds ?? [];
      // Contract total = agreed price per vessel x number of vessels in the fleet.
      const totalValue = input.pricePerVessel * Math.max(vesselIds.length, 1);
      const id = await opsDb.createOpsContract({
        contractNumber: input.contractNumber,
        customerId: input.customerId,
        title: input.title,
        status: "Offer",
        totalValue: totalValue.toFixed(2),
        pricePerVessel: input.pricePerVessel.toFixed(2),
        installmentCount: input.installmentCount,
        startDate: input.startDate,
        endDate: input.endDate,
        notes: input.notes,
        createdBy: ctx.user.id,
      });
      for (const vesselId of vesselIds) {
        await opsDb.createVesselAssignment({
          vesselId,
          contractId: id,
          assignedDate: Date.now(),
          notes: "Added at contract creation",
        });
        // Same automation as assignVessel, so vessels added here are not left without equipment.
        await generateEquipmentForVessel(id, vesselId);
      }
      return { id };
    }),
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().optional(),
      status: z.enum(opsContractStatuses).optional(),
      notes: z.string().nullable().optional(),
      startDate: z.number().optional(),
      endDate: z.number().optional(),
      pricePerVessel: z.number().min(0).optional(),
      installmentCount: z.number().int().min(1).max(30).optional(),
      paymentMethod: z.enum(opsPaymentMethods).optional(),
      paymentTermsDays: z.number().int().min(0).max(365).optional(),
      paymentNotes: z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, pricePerVessel, installmentCount, ...rest } = input;
      const contract = await opsDb.getOpsContract(id);
      if (!contract) throw new TRPCError({ code: "NOT_FOUND" });
      const data: Record<string, unknown> = { ...rest };
      const financialsChanged = pricePerVessel !== undefined || installmentCount !== undefined;
      if (pricePerVessel !== undefined) data.pricePerVessel = pricePerVessel.toFixed(2);
      if (installmentCount !== undefined) data.installmentCount = installmentCount;
      if (financialsChanged) {
        const assignments = await opsDb.listVesselAssignments(id);
        const price = pricePerVessel ?? Number(contract.pricePerVessel);
        const count = installmentCount ?? contract.installmentCount;
        const totalValue = price * Math.max(assignments.length, 1);
        data.totalValue = totalValue.toFixed(2);
        await opsDb.updateOpsContract(id, data as any);
        // Price or installment count changed, so every shipped vessel is re-planned.
        // syncAllVesselSchedules leaves vessels with invoiced or paid installments alone.
        void count;
        await syncAllVesselSchedules(id);
        return { success: true };
      }
      await opsDb.updateOpsContract(id, data as any);
      return { success: true };
    }),
  /** Assign a vessel to a contract — triggers automation engine. */
  assignVessel: protectedProcedure
    .input(z.object({ contractId: z.number(), vesselId: z.number(), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const contract = await opsDb.getOpsContract(input.contractId);
      if (!contract) throw new TRPCError({ code: "NOT_FOUND" });
      // Create assignment
      const assignId = await opsDb.createVesselAssignment({
        vesselId: input.vesselId,
        contractId: input.contractId,
        assignedDate: Date.now(),
        notes: input.notes,
      });
      // AUTOMATION ENGINE: Read contract library and generate asset records
      const generated = await generateEquipmentForVessel(input.contractId, input.vesselId);
      // Log history
      const vessel = await db.getVesselById(input.vesselId);
      await opsDb.createVesselHistoryEntry({
        vesselId: input.vesselId,
        eventType: "AssetAssigned",
        description: `Vessel assigned to contract ${contract.contractNumber}. ${generated.created} equipment record(s) auto-generated.`,
        createdBy: ctx.user.id,
      });
      await recalcContractTotal(input.contractId);
      return { id: assignId, created: generated.created };
    }),
  /**
   * Record (or clear) the shipment date of one vessel. This is what activates the vessel
   * commercially: its own installments are generated from that date, independently of the
   * rest of the fleet. Clearing the date removes its still-unbilled installments again.
   */
  setVesselShipment: protectedProcedure
    .input(z.object({ assignmentId: z.number(), shipmentDate: z.number().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const assignment = await opsDb.getVesselAssignment(input.assignmentId);
      if (!assignment) throw new TRPCError({ code: "NOT_FOUND" });
      const billed = (await opsDb.listPaymentScheduleForVessel(assignment.contractId, assignment.vesselId))
        .some(p => p.status !== "Pending");
      if (billed) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This vessel already has invoiced or paid installments — adjust those rows individually instead.",
        });
      }
      await opsDb.updateVesselAssignment(input.assignmentId, { shipmentDate: input.shipmentDate });
      await syncVesselSchedule(assignment.contractId, assignment.vesselId);
      const contract = await opsDb.getOpsContract(assignment.contractId);
      const ref = contract?.contractNumber ?? String(assignment.contractId);
      await opsDb.createVesselHistoryEntry({
        vesselId: assignment.vesselId,
        eventType: "Shipment",
        description: input.shipmentDate
          ? `Shipment recorded for contract ${ref} — installments start ${new Date(input.shipmentDate).toISOString().slice(0, 10)}.`
          : `Shipment date cleared for contract ${ref} — pending installments removed.`,
        createdBy: ctx.user.id,
      });
      return { success: true };
    }),
  /**
   * Re-run equipment generation for one vessel (or the whole fleet) after products change.
   * Safe to call repeatedly: existing serial rows are kept, only missing ones are added.
   */
  generateEquipment: protectedProcedure
    .input(z.object({ contractId: z.number(), vesselId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const contract = await opsDb.getOpsContract(input.contractId);
      if (!contract) throw new TRPCError({ code: "NOT_FOUND" });
      const assignments = await opsDb.listVesselAssignments(input.contractId);
      const targets = input.vesselId
        ? assignments.filter(a => a.vesselId === input.vesselId)
        : assignments;
      if (targets.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Add a vessel to the contract first" });
      }
      let created = 0;
      let skipped = 0;
      for (const assignment of targets) {
        const result = await generateEquipmentForVessel(input.contractId, assignment.vesselId);
        created += result.created;
        skipped += result.skipped;
        if (result.created > 0) {
          await opsDb.createVesselHistoryEntry({
            vesselId: assignment.vesselId,
            eventType: "AssetAssigned",
            description: `${result.created} equipment record(s) generated from contract ${contract.contractNumber}.`,
            createdBy: ctx.user.id,
          });
        }
      }
      return { created, skipped, vessels: targets.length };
    }),
  removeVessel: protectedProcedure
    .input(z.object({ assignmentId: z.number(), contractId: z.number().optional() }))
    .mutation(async ({ input }) => {
      const assignment = await opsDb.getVesselAssignment(input.assignmentId);
      await opsDb.deleteVesselAssignment(input.assignmentId);
      // Drop that vessel's unbilled installments; invoiced or paid ones stay on the record.
      if (assignment) {
        const rows = await opsDb.listPaymentScheduleForVessel(assignment.contractId, assignment.vesselId);
        if (rows.every(p => p.status === "Pending")) {
          await opsDb.deletePaymentScheduleItemsForVessel(assignment.contractId, assignment.vesselId);
        }
      }
      if (input.contractId) await recalcContractTotal(input.contractId);
      return { success: true };
    }),
  /** Add a product to the contract's single product list. */
  addLibraryItem: protectedProcedure
    .input(z.object({
      contractId: z.number(),
      itemType: z.enum(opsLibraryItemTypes),
      catalogId: z.number().nullable().optional(),
      name: z.string().min(1),
      quantity: z.number().int().min(1),
      unitCost: z.number().min(0).optional(),
      sellingPrice: z.number().min(0).optional(),
      quotaType: z.enum(opsQuotaTypes).optional(),
      quotaLimit: z.number().int().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const id = await opsDb.createContractLibraryItem({
        ...input,
        catalogId: input.catalogId ?? null,
        unitCost: (input.unitCost ?? 0).toFixed(2),
        sellingPrice: (input.sellingPrice ?? 0).toFixed(2),
      } as any);
      return { id };
    }),
  /** Edit a product already on the contract. */
  updateLibraryItem: protectedProcedure
    .input(z.object({
      id: z.number(),
      itemType: z.enum(opsLibraryItemTypes).optional(),
      catalogId: z.number().nullable().optional(),
      name: z.string().min(1).optional(),
      quantity: z.number().int().min(1).optional(),
      unitCost: z.number().min(0).optional(),
      sellingPrice: z.number().min(0).optional(),
      quotaType: z.enum(opsQuotaTypes).nullable().optional(),
      quotaLimit: z.number().int().nullable().optional(),
      notes: z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, unitCost, sellingPrice, ...rest } = input;
      const data: Record<string, unknown> = { ...rest };
      if (unitCost !== undefined) data.unitCost = unitCost.toFixed(2);
      if (sellingPrice !== undefined) data.sellingPrice = sellingPrice.toFixed(2);
      await opsDb.updateContractLibraryItem(id, data as any);
      return { success: true };
    }),
  removeLibraryItem: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await opsDb.deleteContractLibraryItem(input.id);
      return { success: true };
    }),
  /** Update a payment schedule item status. */
  updatePayment: protectedProcedure
    .input(z.object({ id: z.number(), status: z.enum(["Pending", "Invoiced", "Paid"]), invoiceNumber: z.string().optional(), paidDate: z.number().optional() }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await opsDb.updatePaymentScheduleItem(id, data as any);
      return { success: true };
    }),
});

// ═══════════════════════════════════════════════════════════════════════════════
// ASSETS ROUTER
// ═══════════════════════════════════════════════════════════════════════════════

export const opsAssetsRouter = router({
  list: protectedProcedure
    .input(z.object({ vesselId: z.number().optional(), contractId: z.number().optional(), status: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const assets = await opsDb.listAssets(input ?? undefined);
      const vessels = await db.listVessels();
      const vesselMap = new Map(vessels.map(v => [v.id, v]));
      // Attach the equipment's current certificate (the one expiring last) so the
      // Equipment table can flag compliance without a second round-trip.
      const certs = await opsDb.listCertificates();
      const latestByAsset = new Map<number, (typeof certs)[number]>();
      for (const c of certs) {
        const prev = latestByAsset.get(c.assetId);
        if (!prev || c.expiryDate > prev.expiryDate) latestByAsset.set(c.assetId, c);
      }
      const now = Date.now();
      return assets.map(a => {
        const cert = latestByAsset.get(a.id);
        return {
          ...a,
          vesselName: a.vesselId ? vesselMap.get(a.vesselId)?.name ?? "—" : null,
          certificateNumber: cert?.certificateNumber ?? null,
          certificateExpiry: cert?.expiryDate ?? null,
          certificateDaysLeft: cert ? daysUntilExpiry(cert.expiryDate, now) : null,
          certificateUrgency: cert ? certUrgency(cert.expiryDate, now) : null,
        };
      });
    }),
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const asset = await opsDb.getAsset(input.id);
    if (!asset) throw new TRPCError({ code: "NOT_FOUND" });
    const certificates = await opsDb.listCertificates(input.id);
    return { asset, certificates };
  }),
  create: protectedProcedure
    .input(z.object({
      serialNumber: z.string().min(1),
      name: z.string().min(1),
      catalogItemId: z.number().optional(),
      vesselId: z.number().optional(),
      contractId: z.number().optional(),
      status: z.enum(opsAssetStatuses).optional(),
      targetReturnPort: z.string().optional(),
      notes: z.string().optional(),
      // Optional certificate captured in the same step: instruments arrive with a
      // calibration certificate, and typing it here saves a second trip to the
      // Certificates page (which is where it lands anyway).
      certificateNumber: z.string().optional(),
      certificateIssueDate: z.number().optional(),
      certificateExpiryDate: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { certificateNumber, certificateIssueDate, certificateExpiryDate, ...assetData } = input;
      const id = await opsDb.createAsset(assetData as any);
      // A certificate needs at least a number and an expiry date to be meaningful;
      // the issue date defaults to today when left blank.
      if (certificateNumber && certificateExpiryDate) {
        await opsDb.createCertificate({
          assetId: id,
          certificateNumber,
          issueDate: certificateIssueDate ?? Date.now(),
          expiryDate: certificateExpiryDate,
        } as any);
      }
      if (input.vesselId) {
        await opsDb.createVesselHistoryEntry({
          vesselId: input.vesselId,
          eventType: "AssetAssigned",
          description: `Asset "${input.name}" (S/N: ${input.serialNumber}) created and assigned${input.status ? ` as ${input.status}` : ""}.`,
          createdBy: ctx.user.id,
        });
      }
      return { id };
    }),
  updateStatus: protectedProcedure
    .input(z.object({ id: z.number(), status: z.enum(opsAssetStatuses), targetReturnPort: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const asset = await opsDb.getAsset(input.id);
      if (!asset) throw new TRPCError({ code: "NOT_FOUND" });
      await opsDb.updateAsset(input.id, { status: input.status, targetReturnPort: input.targetReturnPort ?? asset.targetReturnPort });
      if (asset.vesselId) {
        await opsDb.createVesselHistoryEntry({
          vesselId: asset.vesselId,
          eventType: "StatusChange",
          description: `Asset "${asset.name}" (S/N: ${asset.serialNumber}) status changed: ${asset.status} → ${input.status}`,
          metadata: JSON.stringify({ assetId: input.id, from: asset.status, to: input.status }),
          createdBy: ctx.user.id,
        });
      }
      return { success: true };
    }),
  update: protectedProcedure
    .input(z.object({ id: z.number(), name: z.string().optional(), vesselId: z.number().nullable().optional(), contractId: z.number().nullable().optional(), targetReturnPort: z.string().nullable().optional(), notes: z.string().nullable().optional() }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await opsDb.updateAsset(id, data as any);
      return { success: true };
    }),
  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    await opsDb.deleteAsset(input.id);
    return { success: true };
  }),
});

// ═══════════════════════════════════════════════════════════════════════════════
// CERTIFICATES ROUTER
// ═══════════════════════════════════════════════════════════════════════════════

export const opsCertificatesRouter = router({
  list: protectedProcedure
    .input(z.object({ assetId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const certs = await opsDb.listCertificates(input?.assetId);
      const assets = await opsDb.listAssets();
      const vessels = await db.listVessels();
      const assetMap = new Map(assets.map(a => [a.id, a]));
      const vesselMap = new Map(vessels.map(v => [v.id, v]));
      const now = Date.now();
      return certs.map(c => {
        const asset = assetMap.get(c.assetId);
        return {
          ...c,
          assetName: asset?.name ?? "—",
          assetSerial: asset?.serialNumber ?? "—",
          vesselName: asset?.vesselId ? vesselMap.get(asset.vesselId)?.name ?? null : null,
          // Derived server-side so the table, the KPI cards and the reminder
          // engine cannot disagree about how urgent a certificate is.
          daysLeft: daysUntilExpiry(c.expiryDate, now),
          urgency: certUrgency(c.expiryDate, now),
        };
      });
    }),
  /**
   * Create any certificate reminder tasks that are due (60 / 15 days out).
   * Safe to call repeatedly — reminders are deduped by marker.
   */
  runReminders: protectedProcedure.mutation(async () => {
    return await runCertificateReminders();
  }),
  create: protectedProcedure
    .input(z.object({ assetId: z.number(), certificateNumber: z.string().min(1), issueDate: z.number(), expiryDate: z.number(), fileUrl: z.string().optional(), notes: z.string().optional() }))
    .mutation(async ({ input }) => {
      const id = await opsDb.createCertificate(input as any);
      return { id };
    }),
  update: protectedProcedure
    .input(z.object({ id: z.number(), certificateNumber: z.string().optional(), issueDate: z.number().optional(), expiryDate: z.number().optional(), fileUrl: z.string().nullable().optional(), notes: z.string().nullable().optional() }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await opsDb.updateCertificate(id, data as any);
      return { success: true };
    }),
  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    await opsDb.deleteCertificate(input.id);
    return { success: true };
  }),
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONSUMABLE ORDERS ROUTER
// ═══════════════════════════════════════════════════════════════════════════════

export const opsOrdersRouter = router({
  list: protectedProcedure
    .input(z.object({ vesselId: z.number().optional(), contractId: z.number().optional(), status: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const orders = await opsDb.listConsumableOrders(input ?? undefined);
      const vessels = await db.listVessels();
      const vesselMap = new Map(vessels.map(v => [v.id, v]));
      return orders.map(o => ({
        ...o,
        vesselName: vesselMap.get(o.vesselId)?.name ?? "—",
      }));
    }),
  /** Fulfill a consumable order — deducts from contract quota. */
  create: protectedProcedure
    .input(z.object({
      vesselId: z.number(),
      contractId: z.number(),
      libraryItemId: z.number(),
      quantity: z.number().int().min(1),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = await opsDb.createConsumableOrder({
        ...input,
        orderDate: Date.now(),
        status: "Pending",
      });
      await opsDb.createVesselHistoryEntry({
        vesselId: input.vesselId,
        eventType: "OrderFulfilled",
        description: `Consumable order #${id} created (qty: ${input.quantity})`,
        metadata: JSON.stringify({ orderId: id, libraryItemId: input.libraryItemId, quantity: input.quantity }),
        createdBy: ctx.user.id,
      });
      return { id };
    }),
  updateStatus: protectedProcedure
    .input(z.object({ id: z.number(), status: z.enum(opsOrderStatuses), shippedDate: z.number().optional(), deliveredDate: z.number().optional() }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await opsDb.updateConsumableOrder(id, data as any);
      return { success: true };
    }),
});

// ═══════════════════════════════════════════════════════════════════════════════
// VESSEL OPERATIONS ROUTER (COMMAND CENTER)
// ═══════════════════════════════════════════════════════════════════════════════

export const opsVesselRouter = router({
  /** Get full vessel operations dashboard data. */
  dashboard: protectedProcedure.input(z.object({ vesselId: z.number() })).query(async ({ input }) => {
    const vessel = await db.getVesselById(input.vesselId);
    if (!vessel) throw new TRPCError({ code: "NOT_FOUND" });
    const [assignments, assets, orders, history] = await Promise.all([
      opsDb.getVesselAssignmentsByVessel(input.vesselId),
      opsDb.listAssets({ vesselId: input.vesselId }),
      opsDb.listConsumableOrders({ vesselId: input.vesselId }),
      opsDb.listVesselHistory(input.vesselId),
    ]);
    // Get contract details for each assignment
    const contractIds = assignments.map(a => a.contractId);
    const contracts = await Promise.all(contractIds.map(id => opsDb.getOpsContract(id)));
    const contractMap = new Map(contracts.filter(Boolean).map(c => [c!.id, c!]));
    // Get certificates for assets
    const allCerts = await Promise.all(assets.map(a => opsDb.listCertificates(a.id)));
    const certsByAsset = new Map(assets.map((a, i) => [a.id, allCerts[i]]));
    // Get library items for quota tracking
    const libraries = await Promise.all(contractIds.map(id => opsDb.listContractLibrary(id)));
    const libraryByContract = new Map(contractIds.map((id, i) => [id, libraries[i]]));
    // Calculate quota usage
    const quotaUsage = contractIds.map(cId => {
      const lib = libraryByContract.get(cId) ?? [];
      const consumables = lib.filter(l => l.itemType === "Consumable" && l.quotaLimit);
      return consumables.map(c => {
        const used = orders.filter(o => o.contractId === cId && o.libraryItemId === c.id).reduce((s, o) => s + o.quantity, 0);
        return { libraryItem: c, used, remaining: (c.quotaLimit ?? 0) - used };
      });
    }).flat();
    return {
      vessel,
      assignments: assignments.map(a => ({ ...a, contract: contractMap.get(a.contractId) })),
      assets: assets.map(a => ({ ...a, certificates: certsByAsset.get(a.id) ?? [] })),
      orders,
      history: history.slice(0, 50),
      quotaUsage,
    };
  }),
  /** Add a comment to vessel history. */
  addComment: protectedProcedure
    .input(z.object({ vesselId: z.number(), comment: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const id = await opsDb.createVesselHistoryEntry({
        vesselId: input.vesselId,
        eventType: "Comment",
        description: input.comment,
        createdBy: ctx.user.id,
      });
      return { id };
    }),
  history: protectedProcedure.input(z.object({ vesselId: z.number() })).query(({ input }) => opsDb.listVesselHistory(input.vesselId)),
});

// ═══════════════════════════════════════════════════════════════════════════════
// OPERATIONS DASHBOARD (OVERVIEW)
// ═══════════════════════════════════════════════════════════════════════════════

export const opsDashboardRouter = router({
  summary: protectedProcedure.query(async () => {
    const [contracts, assets, orders, certs, schedule] = await Promise.all([
      opsDb.listOpsContracts(),
      opsDb.listAssets(),
      opsDb.listConsumableOrders(),
      opsDb.listCertificates(),
      opsDb.listPaymentSchedule(),
    ]);
    const now = Date.now();
    return {
      activeContracts: contracts.filter(c => c.status === "Active").length,
      totalContracts: contracts.length,
      totalAssets: assets.length,
      activeAssets: assets.filter(a => a.status === "Active").length,
      pendingReturns: assets.filter(a => a.status === "Pending Return").length,
      pendingOrders: orders.filter(o => o.status === "Pending").length,
      // Windows follow the service agreement's 60 / 15-day reminder duties, not
      // arbitrary round numbers — see shared/certificateExpiry.ts.
      expiringCerts15: certs.filter(c => certUrgency(c.expiryDate, now) === "final").length,
      expiringCerts60: certs.filter(c => certUrgency(c.expiryDate, now) === "warning").length,
      expiredCerts: certs.filter(c => certUrgency(c.expiryDate, now) === "expired").length,
      pendingPayments: schedule.filter(p => p.status === "Pending").length,
      overduePayments: schedule.filter(p => p.status === "Pending" && p.dueDate < now).length,
      totalContractValue: contracts.filter(c => c.status === "Active").reduce((s, c) => s + Number(c.totalValue), 0),
      collectedAmount: schedule.filter(p => p.status === "Paid").reduce((s, p) => s + Number(p.amount), 0),
    };
  }),
  /** Reverse logistics dashboard: assets pending return. */
  reverseLogistics: protectedProcedure.query(async () => {
    const assets = await opsDb.listAssets({ status: "Pending Return" });
    const vessels = await db.listVessels();
    const vesselMap = new Map(vessels.map(v => [v.id, v]));
    return assets.map(a => ({
      ...a,
      vesselName: a.vesselId ? vesselMap.get(a.vesselId)?.name ?? "—" : null,
    }));
  }),
  /** Upcoming certificate renewals. */
  upcomingRenewals: protectedProcedure.query(async () => {
    const certs = await opsDb.listCertificates();
    const assets = await opsDb.listAssets();
    const vessels = await db.listVessels();
    const assetMap = new Map(assets.map(a => [a.id, a]));
    const vesselMap = new Map(vessels.map(v => [v.id, v]));
    const now = Date.now();
    const day60 = 60 * 24 * 60 * 60 * 1000;
    return certs
      .filter(c => c.expiryDate <= now + day60)
      .map(c => {
        const asset = assetMap.get(c.assetId);
        return {
          ...c,
          assetName: asset?.name ?? "—",
          assetSerial: asset?.serialNumber ?? "—",
          vesselName: asset?.vesselId ? vesselMap.get(asset.vesselId)?.name ?? null : null,
          daysUntilExpiry: Math.ceil((c.expiryDate - now) / (24 * 60 * 60 * 1000)),
        };
      })
      .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
  }),
});
