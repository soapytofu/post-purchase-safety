import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { authorizedBusinessWrite, BusinessAccessError, membershipFor } from "./business-data";
import { inventoryStockKey, parseInventoryCsv, type InventoryIssue, type InventoryRow } from "./inventory-csv";

type DraftStore = { id: string; code: string; name: string; baseSnapshotId: string | null; inventoryAsOf: string; rowCount: number; units: number; previousRows: number; previousUnits: number; removedRows: number };
type Payload = { rows: InventoryRow[]; stores: DraftStore[] };
export type InventoryPreview = { id: string; fileName: string; status: string; expiresAt: string; rows: InventoryRow[]; rowCount: number; page: number; pages: number; stores: DraftStore[] };
export type InventoryPreviewResult = { preview?: InventoryPreview; issues: InventoryIssue[]; issueCount: number };
export class InventoryError extends Error {}
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const PAGE_SIZE = 20;

export async function inventoryPreviewPage(client: PrismaClient, userId: string, organizationId: string, draftId: string, requestedPage = 1): Promise<InventoryPreview> {
  await membershipFor(client, userId, organizationId, ["OWNER", "MANAGER"]);
  const draft = await client.inventoryImport.findFirst({ where: { id: draftId, organizationId, createdById: userId } });
  if (!draft) throw new BusinessAccessError();
  if (draft.status === "DRAFT" && draft.expiresAt.getTime() <= Date.now()) throw new InventoryError("This preview expired. Upload the file again to refresh its checks.");
  const payload = JSON.parse(draft.payload) as Payload;
  const pages = Math.max(1, Math.ceil(payload.rows.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1));
  return { id: draft.id, fileName: draft.fileName, status: draft.status, expiresAt: draft.expiresAt.toISOString(), rows: payload.rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), rowCount: payload.rows.length, page, pages, stores: payload.stores };
}

export async function previewInventoryCsv(client: PrismaClient, userId: string, organizationId: string, fileName: string, csv: string, selectedLocationIds: string[]): Promise<InventoryPreviewResult> {
  await membershipFor(client, userId, organizationId, ["OWNER", "MANAGER"]);
  const ids = [...new Set(selectedLocationIds)].sort();
  if (!ids.length || ids.length > 50 || ids.length !== selectedLocationIds.length) throw new InventoryError("Select 1–50 distinct stores included in this CSV.");
  const locations = await client.businessLocation.findMany({ where: { organizationId, id: { in: ids }, archivedAt: null }, orderBy: { code: "asc" } });
  if (locations.length !== ids.length) throw new BusinessAccessError();
  const parsed = parseInventoryCsv(csv, locations.map(location => location.code));
  if (parsed.issueCount) return { issues: parsed.issues, issueCount: parsed.issueCount };
  // Canonical content ignores CSV quoting/header-order differences, but retains
  // SKU/barcode leading zeros and values. Applied content is never reactivated.
  const canonicalRows = parsed.rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "line").sort(([a], [b]) => a.localeCompare(b))))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const contentHash = digest(JSON.stringify([ids, canonicalRows]));
  const id = await authorizedBusinessWrite(client, userId, organizationId, ["OWNER", "MANAGER"], async tx => {
    const duplicate = await tx.inventoryImport.findFirst({ where: { organizationId, appliedHash: contentHash } });
    if (duplicate) {
      // Give this user their own read-only preview of already-applied content,
      // rather than disclosing another member's draft or permitting a replay.
      if (duplicate.createdById === userId) return duplicate.id;
      return (await tx.inventoryImport.create({ data: { organizationId, createdById: userId, contentHash, fileName: fileName.slice(0, 150), status: "DUPLICATE", payload: duplicate.payload, expiresAt: new Date() } })).id;
    }
    const currentLocations = await tx.businessLocation.findMany({ where: { organizationId, id: { in: ids }, archivedAt: null }, orderBy: { code: "asc" } });
    if (currentLocations.length !== ids.length) throw new BusinessAccessError();
    const stores: DraftStore[] = [];
    for (const location of currentLocations) {
      const rows = parsed.rows.filter(row => row.location_code === location.code);
      if (!rows.length) throw new InventoryError("The selected stores changed. Upload the file again.");
      const asOf = rows[0].inventory_as_of;
      const previous = location.currentSnapshotId ? await tx.inventorySnapshot.findFirst({ where: { id: location.currentSnapshotId, organizationId, locationId: location.id }, include: { rows: { select: { stockKey: true, quantityOnHand: true } } } }) : null;
      if (previous && new Date(asOf).getTime() <= previous.inventoryAsOf.getTime()) throw new InventoryError(`Store ${location.code}: inventory_as_of must be later than its current snapshot. Older/equal snapshots cannot replace newer stock.`);
      const newKeys = new Set(rows.map(row => digest(inventoryStockKey(row))));
      stores.push({ id: location.id, code: location.code, name: location.name, baseSnapshotId: location.currentSnapshotId, inventoryAsOf: asOf, rowCount: rows.length, units: rows.reduce((sum, row) => sum + row.quantity_on_hand, 0), previousRows: previous?.rows.length ?? 0, previousUnits: previous?.rows.reduce((sum, row) => sum + row.quantityOnHand, 0) ?? 0, removedRows: previous?.rows.filter(row => !newKeys.has(row.stockKey)).length ?? 0 });
    }
    const payload: Payload = { rows: parsed.rows, stores };
    // Each preview is immutable: a second tab cannot silently replace the
    // baseline that an earlier confirmation is about to approve.
    return (await tx.inventoryImport.create({ data: { organizationId, createdById: userId, contentHash, fileName: fileName.slice(0, 150), payload: JSON.stringify(payload), expiresAt: new Date(Date.now() + 30 * 60_000) } })).id;
  });
  return { preview: await inventoryPreviewPage(client, userId, organizationId, id), issues: [], issueCount: 0 };
}

export async function commitInventoryImport(client: PrismaClient, userId: string, organizationId: string, draftId: string) {
  return authorizedBusinessWrite(client, userId, organizationId, ["OWNER", "MANAGER"], async tx => {
    const draft = await tx.inventoryImport.findFirst({ where: { id: draftId, organizationId, createdById: userId } });
    if (!draft) throw new BusinessAccessError();
    if (draft.status === "APPLIED" || draft.status === "DUPLICATE") return { alreadyApplied: true };
    if (draft.expiresAt.getTime() <= Date.now()) throw new InventoryError("This preview expired. Upload the file again.");
    const duplicate = await tx.inventoryImport.findFirst({ where: { organizationId, appliedHash: draft.contentHash } });
    if (duplicate) return { alreadyApplied: true };
    const payload = JSON.parse(draft.payload) as Payload;
    for (const store of payload.stores) {
      const location = await tx.businessLocation.findFirst({ where: { id: store.id, organizationId, archivedAt: null } });
      if (!location || location.currentSnapshotId !== store.baseSnapshotId) throw new InventoryError("A selected store was archived or its stock changed after this preview. Upload again to review current stock; nothing was replaced.");
      const snapshot = await tx.inventorySnapshot.create({ data: { organizationId, locationId: location.id, importId: draft.id, inventoryAsOf: new Date(store.inventoryAsOf) } });
      const rows = payload.rows.filter(row => row.location_code === store.code);
      // Bounded batches keep parameter counts manageable in SQLite/PostgreSQL.
      for (let offset = 0; offset < rows.length; offset += 100) {
        await tx.inventoryStockRow.createMany({ data: rows.slice(offset, offset + 100).map(row => ({ organizationId, locationId: location.id, snapshotId: snapshot.id, stockKey: digest(inventoryStockKey(row)), sku: row.sku, productName: row.product_name, quantityOnHand: row.quantity_on_hand, brand: row.brand, gtin: row.gtin, manufacturer: row.manufacturer, modelNumber: row.model_number, lotNumber: row.lot_number, serialNumber: row.serial_number, productionDate: row.production_date, supplier: row.supplier, category: row.category })) });
      }
      const changed = await tx.businessLocation.updateMany({ where: { id: location.id, organizationId, currentSnapshotId: store.baseSnapshotId, archivedAt: null }, data: { currentSnapshotId: snapshot.id } });
      if (changed.count !== 1) throw new InventoryError("Store stock changed. Upload again; nothing was replaced.");
    }
    await tx.inventoryImport.update({ where: { id: draft.id }, data: { status: "APPLIED", appliedHash: draft.contentHash, appliedAt: new Date() } });
    return { alreadyApplied: false };
  });
}

export async function getBusinessInventory(client: PrismaClient, userId: string, organizationId: string, filters: { locationId?: string; query?: string; page?: number } = {}) {
  const membership = await membershipFor(client, userId, organizationId);
  const locations = await client.businessLocation.findMany({ where: { organizationId }, orderBy: { code: "asc" } });
  if (filters.locationId && !locations.some(location => location.id === filters.locationId)) throw new BusinessAccessError();
  const selected = locations.filter(location => !location.archivedAt && (!filters.locationId || filters.locationId === location.id));
  const references = selected.filter(location => location.currentSnapshotId).map(location => ({ id: location.currentSnapshotId!, locationId: location.id }));
  // An empty selection must never degrade into an unscoped historical query.
  const current = references.length ? await client.inventorySnapshot.findMany({ where: { organizationId, OR: references }, include: { _count: { select: { rows: true } } } }) : [];
  const snapshotIds = current.map(snapshot => snapshot.id);
  const query = filters.query?.trim().slice(0, 200) ?? "";
  const where = { organizationId, snapshotId: { in: snapshotIds }, ...(query ? { OR: ["sku", "productName", "brand", "gtin", "modelNumber"].map(field => ({ [field]: { contains: query, ...(/^postgres(?:ql)?:\/\//.test(process.env.DATABASE_URL ?? "") ? { mode: "insensitive" as const } : {}) } })) } : {}) };
  const total = await client.inventoryStockRow.count({ where });
  const pages = Math.max(1, Math.ceil(total / 50));
  const page = Math.min(pages, Math.max(1, Number.isFinite(filters.page) ? Math.floor(filters.page!) : 1));
  const rows = await client.inventoryStockRow.findMany({ where, orderBy: [{ locationId: "asc" }, { sku: "asc" }, { id: "asc" }], take: 50, skip: (page - 1) * 50 });
  const totals = await client.inventoryStockRow.groupBy({ by: ["locationId"], where: { organizationId, snapshotId: { in: snapshotIds } }, _sum: { quantityOnHand: true }, _count: true });
  const history = membership.role !== "STAFF" ? await client.inventoryImport.findMany({ where: { organizationId, status: "APPLIED" }, select: { id: true, fileName: true, appliedAt: true }, orderBy: { appliedAt: "desc" }, take: 10 }) : [];
  return { membership, locations, snapshots: current, rows, total, pages, page, totals, history };
}
