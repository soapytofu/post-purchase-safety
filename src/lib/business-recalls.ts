import { Prisma, type InventoryStockRow, type PrismaClient } from "@prisma/client";
import { BUSINESS_MATCH_VERSION, businessNoticeIndex, matchBusinessStock, type BusinessEvidence } from "@/domain/matching/business";
import { membershipFor } from "./business-data";
import { BusinessAccessError } from "./business-data";
import { sourceHealth } from "./source-health";

export class BusinessMatchingError extends Error {}
const MAX_STOCK_ROWS = 20_000;
const MAX_NOTICES = 10_000;
const MAX_PAIRS = 200_000;
function identifiers(raw: string): string[] {
  try { const value: unknown = JSON.parse(raw); if (Array.isArray(value) && value.every(item => typeof item === "string")) return value; } catch { /* Fail closed; malformed notices must not imply a clean inbox. */ }
  throw new BusinessMatchingError("A synchronized notice has invalid identifier data. Matching is unavailable until the source data is repaired.");
}
const noticeSelect = { id: true, externalId: true, sourceAuthority: true, headline: true, description: true, productName: true, brand: true, upcs: true, lotNumbers: true, recallDate: true, updatedAt: true, severity: true, recommendedAction: true, sourceUrl: true, distributionStartDate: true, distributionEndDate: true } as const;
type Notice = Prisma.RecallGetPayload<{ select: typeof noticeSelect }>;
export type BusinessCandidate = { stock: InventoryStockRow; notice: Omit<Notice, "upcs" | "lotNumbers"> & { upcs: string[]; lotNumbers: string[] }; evidence: BusinessEvidence };

// A read-only current-stock evaluation, NOT a durable exposure case. Nothing is
// written to household matches, email queues, imports or notice records.
export async function getBusinessRecallInbox(client: PrismaClient, userId: string, organizationId: string, filters: { locationId?: string; query?: string; kind?: string; page?: number } = {}) {
  const data = await client.$transaction(async tx => {
    const membership = await membershipFor(tx, userId, organizationId);
    const organization = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } });
    const locations = await tx.businessLocation.findMany({ where: { organizationId, archivedAt: null }, orderBy: { code: "asc" } });
    if (filters.locationId && !locations.some(location => location.id === filters.locationId)) throw new BusinessAccessError();
    const selected = locations.filter(location => !filters.locationId || location.id === filters.locationId);
    const references = selected.filter(location => location.currentSnapshotId).map(location => ({ id: location.currentSnapshotId!, locationId: location.id }));
    const snapshots = references.length ? await tx.inventorySnapshot.findMany({ where: { organizationId, OR: references } }) : [];
    if (snapshots.length !== references.length) throw new BusinessMatchingError("A store has an invalid current snapshot reference. Matching is unavailable until it is repaired.");
    const stock = snapshots.length ? await tx.inventoryStockRow.findMany({ where: { organizationId, snapshotId: { in: snapshots.map(s => s.id) }, quantityOnHand: { gt: 0 } }, orderBy: { id: "asc" }, take: MAX_STOCK_ROWS + 1 }) : [];
    if (stock.length > MAX_STOCK_ROWS) throw new BusinessMatchingError("This view exceeds 20,000 in-stock rows. Select a single store, or ask for a queued evaluation. No partial results are shown.");
    // No rolling notice-date window: old recalls can still affect current stock.
    const notices = await tx.recall.findMany({ where: { isFixture: false }, select: noticeSelect, orderBy: { id: "asc" }, take: MAX_NOTICES + 1 });
    if (notices.length > MAX_NOTICES) throw new BusinessMatchingError("The notice catalog exceeds the interactive matching limit. A queued evaluation is needed; no partial results are shown.");
    const states = await tx.syncState.findMany();
    return { membership, organization, locations, selected, snapshots, stock, notices, states };
  }, { timeout: 30_000, isolationLevel: (/^postgres(?:ql)?:/.test(process.env.DATABASE_URL ?? "") ? "RepeatableRead" : "Serializable") as Prisma.TransactionIsolationLevel });
  const notices = data.notices.map(notice => ({ ...notice, upcs: identifiers(notice.upcs), lotNumbers: identifiers(notice.lotNumbers) }));
  const byId = new Map(notices.map(notice => [notice.id, notice]));
  const candidatesFor = businessNoticeIndex(notices);
  const candidates: BusinessCandidate[] = [];
  let comparisons = 0;
  for (const stock of data.stock) for (const indexedNotice of candidatesFor(stock)) {
    if (++comparisons > MAX_PAIRS) throw new BusinessMatchingError("This stock view needs a queued evaluation. Select a single store to narrow it; no partial results are shown.");
    const notice = byId.get(indexedNotice.id)!;
    const evidence = matchBusinessStock(stock, notice);
    if (evidence) candidates.push({ stock, notice, evidence });
  }
  // Recheck outside the read snapshot: an in-flight removal must not return data.
  await membershipFor(client, userId, organizationId);
  candidates.sort((a, b) => Number(b.evidence.kind === "IDENTIFIER") - Number(a.evidence.kind === "IDENTIFIER") || b.notice.recallDate.getTime() - a.notice.recallDate.getTime() || a.stock.id.localeCompare(b.stock.id) || a.notice.id.localeCompare(b.notice.id));
  const query = filters.query?.trim().slice(0, 200).toLowerCase() ?? "";
  const filtered = candidates.filter(({ stock, notice, evidence }) => (!filters.kind || filters.kind === evidence.kind) && (!query || [stock.sku, stock.productName, stock.brand, stock.gtin, stock.modelNumber, notice.headline, notice.productName, notice.brand].some(value => value.toLowerCase().includes(query))));
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / 20));
  const page = Math.min(pages, Math.max(1, Number.isFinite(filters.page) ? Math.floor(filters.page!) : 1));
  const matchedStock = new Map(filtered.map(candidate => [candidate.stock.id, candidate.stock]));
  return {
    membership: data.membership, organization: data.organization, locations: data.locations, selected: data.selected, snapshots: data.snapshots,
    candidates: filtered.slice((page - 1) * 20, page * 20), total, pages, page,
    matchedRows: matchedStock.size, possibleUnits: [...matchedStock.values()].reduce((sum, row) => sum + row.quantityOnHand, 0),
    matchedLocations: new Set([...matchedStock.values()].map(row => row.locationId)).size,
    evaluatedRows: data.stock.length, evaluatedNotices: notices.length, coverage: sourceHealth(data.states),
    algorithmVersion: BUSINESS_MATCH_VERSION, checkedAt: new Date(),
  };
}
