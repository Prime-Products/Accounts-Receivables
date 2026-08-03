import { eq, desc, asc, and, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  opsServices, InsertOpsService,
  opsAssetCatalog, InsertOpsAssetCatalog,
  opsConsumableCatalog, InsertOpsConsumableCatalog,
  opsQuotations, InsertOpsQuotation,
  opsQuotationItems, InsertOpsQuotationItem,
  opsContracts, InsertOpsContract,
  opsContractLibrary, InsertOpsContractLibrary,
  opsPaymentSchedule, InsertOpsPaymentSchedule,
  opsVesselAssignments, InsertOpsVesselAssignment,
  opsAssets, InsertOpsAsset,
  opsCertificates, InsertOpsCertificate,
  opsConsumableOrders, InsertOpsConsumableOrder,
  opsVesselHistory, InsertOpsVesselHistory,
} from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;
function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    _db = drizzle(process.env.DATABASE_URL);
  }
  return _db!;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICES CATALOG
// ═══════════════════════════════════════════════════════════════════════════════
export async function listServices() {
  return getDb().select().from(opsServices).orderBy(asc(opsServices.name));
}
export async function getService(id: number) {
  const rows = await getDb().select().from(opsServices).where(eq(opsServices.id, id)).limit(1);
  return rows[0] ?? null;
}
export async function createService(data: Omit<InsertOpsService, "id">) {
  const [result] = await getDb().insert(opsServices).values(data).$returningId();
  return result.id;
}
export async function updateService(id: number, data: Partial<InsertOpsService>) {
  await getDb().update(opsServices).set(data).where(eq(opsServices.id, id));
}
export async function deleteService(id: number) {
  await getDb().delete(opsServices).where(eq(opsServices.id, id));
}

// ═══════════════════════════════════════════════════════════════════════════════
// ASSET CATALOG
// ═══════════════════════════════════════════════════════════════════════════════
export async function listAssetCatalog() {
  return getDb().select().from(opsAssetCatalog).orderBy(asc(opsAssetCatalog.name));
}
export async function getAssetCatalogItem(id: number) {
  const rows = await getDb().select().from(opsAssetCatalog).where(eq(opsAssetCatalog.id, id)).limit(1);
  return rows[0] ?? null;
}
export async function createAssetCatalogItem(data: Omit<InsertOpsAssetCatalog, "id">) {
  const [result] = await getDb().insert(opsAssetCatalog).values(data).$returningId();
  return result.id;
}
export async function updateAssetCatalogItem(id: number, data: Partial<InsertOpsAssetCatalog>) {
  await getDb().update(opsAssetCatalog).set(data).where(eq(opsAssetCatalog.id, id));
}
export async function deleteAssetCatalogItem(id: number) {
  await getDb().delete(opsAssetCatalog).where(eq(opsAssetCatalog.id, id));
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSUMABLE CATALOG
// ═══════════════════════════════════════════════════════════════════════════════
export async function listConsumableCatalog() {
  return getDb().select().from(opsConsumableCatalog).orderBy(asc(opsConsumableCatalog.name));
}
export async function getConsumableCatalogItem(id: number) {
  const rows = await getDb().select().from(opsConsumableCatalog).where(eq(opsConsumableCatalog.id, id)).limit(1);
  return rows[0] ?? null;
}
export async function createConsumableCatalogItem(data: Omit<InsertOpsConsumableCatalog, "id">) {
  const [result] = await getDb().insert(opsConsumableCatalog).values(data).$returningId();
  return result.id;
}
export async function updateConsumableCatalogItem(id: number, data: Partial<InsertOpsConsumableCatalog>) {
  await getDb().update(opsConsumableCatalog).set(data).where(eq(opsConsumableCatalog.id, id));
}
export async function deleteConsumableCatalogItem(id: number) {
  await getDb().delete(opsConsumableCatalog).where(eq(opsConsumableCatalog.id, id));
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUOTATIONS
// ═══════════════════════════════════════════════════════════════════════════════
export async function listQuotations() {
  return getDb().select().from(opsQuotations).orderBy(desc(opsQuotations.createdAt));
}
export async function getQuotation(id: number) {
  const rows = await getDb().select().from(opsQuotations).where(eq(opsQuotations.id, id)).limit(1);
  return rows[0] ?? null;
}
export async function createQuotation(data: Omit<InsertOpsQuotation, "id">) {
  const [result] = await getDb().insert(opsQuotations).values(data).$returningId();
  return result.id;
}
export async function updateQuotation(id: number, data: Partial<InsertOpsQuotation>) {
  await getDb().update(opsQuotations).set(data).where(eq(opsQuotations.id, id));
}
export async function deleteQuotation(id: number) {
  await getDb().delete(opsQuotations).where(eq(opsQuotations.id, id));
}

// QUOTATION ITEMS
export async function listQuotationItems(quotationId: number) {
  return getDb().select().from(opsQuotationItems).where(eq(opsQuotationItems.quotationId, quotationId));
}
export async function createQuotationItem(data: Omit<InsertOpsQuotationItem, "id">) {
  const [result] = await getDb().insert(opsQuotationItems).values(data).$returningId();
  return result.id;
}
export async function updateQuotationItem(id: number, data: Partial<InsertOpsQuotationItem>) {
  await getDb().update(opsQuotationItems).set(data).where(eq(opsQuotationItems.id, id));
}
export async function deleteQuotationItem(id: number) {
  await getDb().delete(opsQuotationItems).where(eq(opsQuotationItems.id, id));
}
export async function deleteQuotationItems(quotationId: number) {
  await getDb().delete(opsQuotationItems).where(eq(opsQuotationItems.quotationId, quotationId));
}

// ═══════════════════════════════════════════════════════════════════════════════
// OPERATIONS CONTRACTS
// ═══════════════════════════════════════════════════════════════════════════════
export async function listOpsContracts() {
  return getDb().select().from(opsContracts).orderBy(desc(opsContracts.createdAt));
}
export async function getOpsContract(id: number) {
  const rows = await getDb().select().from(opsContracts).where(eq(opsContracts.id, id)).limit(1);
  return rows[0] ?? null;
}
export async function createOpsContract(data: Omit<InsertOpsContract, "id">) {
  const [result] = await getDb().insert(opsContracts).values(data).$returningId();
  return result.id;
}
export async function updateOpsContract(id: number, data: Partial<InsertOpsContract>) {
  await getDb().update(opsContracts).set(data).where(eq(opsContracts.id, id));
}
export async function deleteOpsContract(id: number) {
  await getDb().delete(opsContracts).where(eq(opsContracts.id, id));
}

// CONTRACT LIBRARY
export async function listContractLibrary(contractId: number) {
  return getDb().select().from(opsContractLibrary).where(eq(opsContractLibrary.contractId, contractId));
}
export async function createContractLibraryItem(data: Omit<InsertOpsContractLibrary, "id">) {
  const [result] = await getDb().insert(opsContractLibrary).values(data).$returningId();
  return result.id;
}
export async function updateContractLibraryItem(id: number, data: Partial<InsertOpsContractLibrary>) {
  await getDb().update(opsContractLibrary).set(data).where(eq(opsContractLibrary.id, id));
}
export async function deleteContractLibraryItem(id: number) {
  await getDb().delete(opsContractLibrary).where(eq(opsContractLibrary.id, id));
}

// PAYMENT SCHEDULE
export async function listPaymentSchedule(contractId?: number) {
  if (contractId) {
    return getDb().select().from(opsPaymentSchedule).where(eq(opsPaymentSchedule.contractId, contractId)).orderBy(asc(opsPaymentSchedule.installmentNumber));
  }
  return getDb().select().from(opsPaymentSchedule).orderBy(asc(opsPaymentSchedule.dueDate));
}
export async function createPaymentScheduleItem(data: Omit<InsertOpsPaymentSchedule, "id">) {
  const [result] = await getDb().insert(opsPaymentSchedule).values(data).$returningId();
  return result.id;
}
export async function updatePaymentScheduleItem(id: number, data: Partial<InsertOpsPaymentSchedule>) {
  await getDb().update(opsPaymentSchedule).set(data).where(eq(opsPaymentSchedule.id, id));
}
export async function deletePaymentScheduleItems(contractId: number) {
  await getDb().delete(opsPaymentSchedule).where(eq(opsPaymentSchedule.contractId, contractId));
}

// ═══════════════════════════════════════════════════════════════════════════════
// VESSEL ASSIGNMENTS
// ═══════════════════════════════════════════════════════════════════════════════
export async function listVesselAssignments(contractId?: number) {
  if (contractId) {
    return getDb().select().from(opsVesselAssignments).where(eq(opsVesselAssignments.contractId, contractId));
  }
  return getDb().select().from(opsVesselAssignments);
}
export async function getVesselAssignmentsByVessel(vesselId: number) {
  return getDb().select().from(opsVesselAssignments).where(eq(opsVesselAssignments.vesselId, vesselId));
}
export async function createVesselAssignment(data: Omit<InsertOpsVesselAssignment, "id">) {
  const [result] = await getDb().insert(opsVesselAssignments).values(data).$returningId();
  return result.id;
}
export async function deleteVesselAssignment(id: number) {
  await getDb().delete(opsVesselAssignments).where(eq(opsVesselAssignments.id, id));
}

// ═══════════════════════════════════════════════════════════════════════════════
// ASSETS (EQUIPMENT)
// ═══════════════════════════════════════════════════════════════════════════════
export async function listAssets(filters?: { vesselId?: number; contractId?: number; status?: string }) {
  let query = getDb().select().from(opsAssets).$dynamic();
  const conditions = [];
  if (filters?.vesselId) conditions.push(eq(opsAssets.vesselId, filters.vesselId));
  if (filters?.contractId) conditions.push(eq(opsAssets.contractId, filters.contractId));
  if (filters?.status) conditions.push(eq(opsAssets.status, filters.status as any));
  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }
  return query.orderBy(desc(opsAssets.updatedAt));
}
export async function getAsset(id: number) {
  const rows = await getDb().select().from(opsAssets).where(eq(opsAssets.id, id)).limit(1);
  return rows[0] ?? null;
}
export async function createAsset(data: Omit<InsertOpsAsset, "id">) {
  const [result] = await getDb().insert(opsAssets).values(data).$returningId();
  return result.id;
}
export async function updateAsset(id: number, data: Partial<InsertOpsAsset>) {
  await getDb().update(opsAssets).set(data).where(eq(opsAssets.id, id));
}
export async function deleteAsset(id: number) {
  await getDb().delete(opsAssets).where(eq(opsAssets.id, id));
}

// ═══════════════════════════════════════════════════════════════════════════════
// CERTIFICATES
// ═══════════════════════════════════════════════════════════════════════════════
export async function listCertificates(assetId?: number) {
  if (assetId) {
    return getDb().select().from(opsCertificates).where(eq(opsCertificates.assetId, assetId)).orderBy(desc(opsCertificates.expiryDate));
  }
  return getDb().select().from(opsCertificates).orderBy(asc(opsCertificates.expiryDate));
}
export async function getCertificate(id: number) {
  const rows = await getDb().select().from(opsCertificates).where(eq(opsCertificates.id, id)).limit(1);
  return rows[0] ?? null;
}
export async function createCertificate(data: Omit<InsertOpsCertificate, "id">) {
  const [result] = await getDb().insert(opsCertificates).values(data).$returningId();
  return result.id;
}
export async function updateCertificate(id: number, data: Partial<InsertOpsCertificate>) {
  await getDb().update(opsCertificates).set(data).where(eq(opsCertificates.id, id));
}
export async function deleteCertificate(id: number) {
  await getDb().delete(opsCertificates).where(eq(opsCertificates.id, id));
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSUMABLE ORDERS
// ═══════════════════════════════════════════════════════════════════════════════
export async function listConsumableOrders(filters?: { vesselId?: number; contractId?: number; status?: string }) {
  let query = getDb().select().from(opsConsumableOrders).$dynamic();
  const conditions = [];
  if (filters?.vesselId) conditions.push(eq(opsConsumableOrders.vesselId, filters.vesselId));
  if (filters?.contractId) conditions.push(eq(opsConsumableOrders.contractId, filters.contractId));
  if (filters?.status) conditions.push(eq(opsConsumableOrders.status, filters.status as any));
  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }
  return query.orderBy(desc(opsConsumableOrders.orderDate));
}
export async function getConsumableOrder(id: number) {
  const rows = await getDb().select().from(opsConsumableOrders).where(eq(opsConsumableOrders.id, id)).limit(1);
  return rows[0] ?? null;
}
export async function createConsumableOrder(data: Omit<InsertOpsConsumableOrder, "id">) {
  const [result] = await getDb().insert(opsConsumableOrders).values(data).$returningId();
  return result.id;
}
export async function updateConsumableOrder(id: number, data: Partial<InsertOpsConsumableOrder>) {
  await getDb().update(opsConsumableOrders).set(data).where(eq(opsConsumableOrders.id, id));
}

// ═══════════════════════════════════════════════════════════════════════════════
// VESSEL HISTORY
// ═══════════════════════════════════════════════════════════════════════════════
export async function listVesselHistory(vesselId: number) {
  return getDb().select().from(opsVesselHistory).where(eq(opsVesselHistory.vesselId, vesselId)).orderBy(desc(opsVesselHistory.createdAt));
}
export async function createVesselHistoryEntry(data: Omit<InsertOpsVesselHistory, "id">) {
  const [result] = await getDb().insert(opsVesselHistory).values(data).$returningId();
  return result.id;
}
