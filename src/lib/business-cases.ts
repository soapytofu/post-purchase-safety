import { Prisma, type InventoryStockRow, type PrismaClient, type Recall } from "@prisma/client";
import { z } from "zod";
import { BUSINESS_MATCH_VERSION, matchBusinessStock, type BusinessEvidence } from "@/domain/matching/business";
import { authorizedBusinessWrite, BusinessAccessError, membershipFor } from "./business-data";
import { noticeContent, noticeSnapshot, recordNoticeRevision, type NoticeSnapshot } from "./notice-history";

export class BusinessCaseError extends Error {}
export const caseStatuses = ["NEEDS_REVIEW", "CONFIRMED_AFFECTED", "NOT_AFFECTED"] as const;
const roles = ["OWNER", "MANAGER"] as const;
const pg = () => /^postgres(?:ql)?:/.test(process.env.DATABASE_URL ?? "");
type Tx = Prisma.TransactionClient;
export type StockEvidence = InventoryStockRow & { inventoryAsOf: string; storeCode: string; storeName: string };

async function lockNotice(tx: Tx, recallId: string) {
  if (pg()) await tx.$queryRaw`SELECT "id" FROM "Recall" WHERE "id" = ${recallId} FOR UPDATE`;
  const recall = await tx.recall.findFirst({ where: { id: recallId, isFixture: false } });
  if (!recall) throw new BusinessCaseError("This notice is no longer in the current catalog. Existing saved evidence remains available.");
  return recall;
}
async function appendObservation(tx: Tx, userId: string, item: { id: string; organizationId: string; locationId: string; noticeHistoryId: string }, stock: InventoryStockRow, recall: Recall, source: "CASE_SAVE" | "CASE_REFRESH") {
  const revision = await recordNoticeRevision(tx, recall, source);
  const duplicate = await tx.businessCaseObservation.findUnique({ where: { caseId_stockRowId_noticeRevisionId_algorithmVersion: { caseId: item.id, stockRowId: stock.id, noticeRevisionId: revision.id, algorithmVersion: BUSINESS_MATCH_VERSION } } });
  if (duplicate) return { observation: duplicate, created: false };
  const notice = noticeSnapshot(recall);
  const evidence = matchBusinessStock(stock, { ...notice, id: recall.id }) ?? { kind: "NONE", reasons: ["Saved stock no longer meets the current candidate rules."], conflicts: [], limitations: ["A missing automated match does not establish that the stock is safe. Verify the revised official notice."] };
  const [snapshot, location] = await Promise.all([
    tx.inventorySnapshot.findFirstOrThrow({ where: { id: stock.snapshotId, organizationId: item.organizationId, locationId: item.locationId } }),
    tx.businessLocation.findFirstOrThrow({ where: { id: item.locationId, organizationId: item.organizationId } }),
  ]);
  const stockEvidence: StockEvidence = { ...stock, inventoryAsOf: snapshot.inventoryAsOf.toISOString(), storeCode: location.code, storeName: location.name };
  const previous = await tx.businessCaseObservation.aggregate({ where: { caseId: item.id, organizationId: item.organizationId }, _max: { sequence: true } });
  const observation = await tx.businessCaseObservation.create({ data: { caseId: item.id, sequence: (previous._max.sequence ?? 0) + 1, organizationId: item.organizationId, locationId: item.locationId, stockRowId: stock.id, noticeHistoryId: item.noticeHistoryId, noticeRevisionId: revision.id, algorithmVersion: BUSINESS_MATCH_VERSION, matchKind: evidence.kind, evidence: JSON.stringify(evidence), stockEvidence: JSON.stringify(stockEvidence), observedById: userId } });
  return { observation, created: true };
}
async function addEvidenceEvent(tx: Tx, userId: string, caseId: string, organizationId: string, observationId: string, first: boolean) {
  const item = first ? await tx.businessRecallCase.findUniqueOrThrow({ where: { id: caseId } }) : await tx.businessRecallCase.update({ where: { id: caseId }, data: { status: "NEEDS_REVIEW", affectedQuantity: null, version: { increment: 1 } } });
  await tx.businessCaseEvent.create({ data: { caseId, organizationId, actorId: userId, version: item.version, kind: first ? "CREATED" : "EVIDENCE_ADDED", payload: JSON.stringify({ observationId }) } });
}

export async function saveBusinessCase(client: PrismaClient, userId: string, organizationId: string, input: { stockRowId: string; recallId: string; noticeUpdatedAt: string }) {
  return authorizedBusinessWrite(client, userId, organizationId, roles, async tx => {
    const stock = await tx.inventoryStockRow.findFirst({ where: { id: input.stockRowId, organizationId, quantityOnHand: { gt: 0 } } });
    if (!stock) throw new BusinessAccessError();
    const location = await tx.businessLocation.findFirst({ where: { id: stock.locationId, organizationId, archivedAt: null, currentSnapshotId: stock.snapshotId } });
    if (!location) throw new BusinessCaseError("Stock changed after this inbox was loaded. Refresh the inbox before saving.");
    const recall = await lockNotice(tx, input.recallId);
    if (recall.updatedAt.toISOString() !== input.noticeUpdatedAt) throw new BusinessCaseError("The notice changed after this inbox was loaded. Refresh and review it before saving.");
    if (!matchBusinessStock(stock, { ...noticeSnapshot(recall), id: recall.id })) throw new BusinessCaseError("This stock is no longer an automated candidate. Refresh the inbox.");
    const revision = await recordNoticeRevision(tx, recall, "CASE_SAVE");
    const existing = await tx.businessRecallCase.findUnique({ where: { organizationId_locationId_stockKey_noticeHistoryId: { organizationId, locationId: stock.locationId, stockKey: stock.stockKey, noticeHistoryId: revision.historyId } } });
    const item = existing ?? await tx.businessRecallCase.create({ data: { organizationId, locationId: stock.locationId, stockKey: stock.stockKey, noticeHistoryId: revision.historyId } });
    const { observation, created } = await appendObservation(tx, userId, item, stock, recall, "CASE_SAVE");
    if (created) await addEvidenceEvent(tx, userId, item.id, organizationId, observation.id, !existing);
    return { caseId: item.id, alreadySaved: !created };
  });
}

export async function refreshBusinessCase(client: PrismaClient, userId: string, organizationId: string, caseId: string, expectedVersion: number) {
  return authorizedBusinessWrite(client, userId, organizationId, roles, async tx => {
    const item = await tx.businessRecallCase.findFirst({ where: { id: caseId, organizationId }, include: { noticeHistory: true } });
    if (!item) throw new BusinessAccessError();
    if (item.version !== expectedVersion) throw new BusinessCaseError("This case changed in another tab. Reload before updating it.");
    const last = await tx.businessCaseObservation.findFirstOrThrow({ where: { caseId, organizationId }, orderBy: { sequence: "desc" } });
    const current = await tx.recall.findUnique({ where: { sourceAuthority_externalId: { sourceAuthority: item.noticeHistory.sourceAuthority, externalId: item.noticeHistory.externalId } } });
    if (!current) throw new BusinessCaseError("The notice is absent from the current catalog. Its saved evidence is retained; absence does not mean the recall is closed.");
    const recall = await lockNotice(tx, current.id);
    // Refresh the notice against the last saved stock snapshot. New imports are
    // attached explicitly from the inbox so historical stock is never rewritten.
    const stock = await tx.inventoryStockRow.findFirstOrThrow({ where: { id: last.stockRowId, organizationId, locationId: item.locationId } });
    const { observation, created } = await appendObservation(tx, userId, item, stock, recall, "CASE_REFRESH");
    if (created) await addEvidenceEvent(tx, userId, item.id, organizationId, observation.id, false);
    return { alreadyCurrent: !created };
  });
}

const reviewInput = z.object({ caseId: z.string().min(1).max(100), expectedVersion: z.number().int().positive(), observationId: z.string().min(1).max(100), status: z.enum(caseStatuses), note: z.string().trim().min(10, "Explain your review in at least 10 characters.").max(2000), affectedQuantity: z.number().int().positive().optional(), evidenceReviewed: z.boolean() });
export async function reviewBusinessCase(client: PrismaClient, userId: string, organizationId: string, value: unknown) {
  const input = reviewInput.parse(value);
  return authorizedBusinessWrite(client, userId, organizationId, roles, async tx => {
    const item = await tx.businessRecallCase.findFirst({ where: { id: input.caseId, organizationId }, include: { noticeHistory: true } });
    if (!item) throw new BusinessAccessError();
    const live = await tx.recall.findUnique({ where: { sourceAuthority_externalId: { sourceAuthority: item.noticeHistory.sourceAuthority, externalId: item.noticeHistory.externalId } } });
    const recall = live && !live.isFixture ? await lockNotice(tx, live.id) : null;
    // Match the sync lock order and serialize a decision with notice changes.
    const history = await tx.noticeHistory.update({ where: { id: item.noticeHistoryId }, data: { lockVersion: { increment: 1 } } });
    const fresh = await tx.businessRecallCase.findFirstOrThrow({ where: { id: item.id, organizationId } });
    const last = await tx.businessCaseObservation.findFirstOrThrow({ where: { caseId: item.id, organizationId }, include: { noticeRevision: true }, orderBy: { sequence: "desc" } });
    if (fresh.version !== input.expectedVersion || last.id !== input.observationId) throw new BusinessCaseError("This case changed. Reload and review its latest evidence before saving a decision.");
    if (last.noticeRevision.number !== history.revisionCount || (recall && noticeContent(recall).contentHash !== last.noticeRevision.contentHash)) throw new BusinessCaseError("The notice changed. Capture the latest notice evidence before recording a decision.");
    if (input.status !== "NEEDS_REVIEW" && !input.evidenceReviewed) throw new BusinessCaseError("Confirm that you checked the official notice and the saved stock identifiers.");
    const stock = JSON.parse(last.stockEvidence) as StockEvidence;
    if (input.status === "CONFIRMED_AFFECTED" && (!input.affectedQuantity || input.affectedQuantity > stock.quantityOnHand)) throw new BusinessCaseError("Affected quantity must be between 1 and the saved snapshot quantity.");
    const updated = await tx.businessRecallCase.update({ where: { id: item.id }, data: { status: input.status, affectedQuantity: input.status === "CONFIRMED_AFFECTED" ? input.affectedQuantity : null, version: { increment: 1 } } });
    await tx.businessCaseEvent.create({ data: { caseId: item.id, organizationId, version: updated.version, actorId: userId, kind: "REVIEWED", payload: JSON.stringify({ observationId: last.id, from: fresh.status, to: updated.status, affectedQuantity: updated.affectedQuantity, note: input.note, noticeRevisionId: last.noticeRevisionId }) } });
    return updated;
  });
}

export async function listBusinessCases(client: PrismaClient, userId: string, organizationId: string, filters: { page?: number; status?: string; locationId?: string } = {}) {
  const membership = await membershipFor(client, userId, organizationId);
  const [organization, locations] = await Promise.all([client.organization.findUniqueOrThrow({ where: { id: organizationId } }), client.businessLocation.findMany({ where: { organizationId }, orderBy: { code: "asc" } })]);
  if (filters.locationId && !locations.some(location => location.id === filters.locationId)) throw new BusinessAccessError();
  const where = { organizationId, ...(filters.locationId ? { locationId: filters.locationId } : {}), ...(caseStatuses.includes(filters.status as typeof caseStatuses[number]) ? { status: filters.status } : {}) };
  const total = await client.businessRecallCase.count({ where });
  const pages = Math.max(1, Math.ceil(total / 20));
  const page = Math.min(pages, Math.max(1, Number.isFinite(filters.page) ? Math.floor(filters.page!) : 1));
  const cases = await client.businessRecallCase.findMany({ where, include: { location: true, noticeHistory: true, observations: { orderBy: { sequence: "desc" }, take: 1, include: { noticeRevision: true } } }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 20 });
  await membershipFor(client, userId, organizationId);
  return { organization, membership, locations, cases, total, pages, page };
}

export async function getBusinessCase(client: PrismaClient, userId: string, organizationId: string, caseId: string, options: { observationId?: string; eventPage?: number; revisionPage?: number } = {}) {
  await membershipFor(client, userId, organizationId);
  const item = await client.businessRecallCase.findFirst({ where: { id: caseId, organizationId }, include: { location: true, noticeHistory: true } });
  if (!item) throw new BusinessAccessError();
  const latest = await client.businessCaseObservation.findFirstOrThrow({ where: { caseId, organizationId }, include: { noticeRevision: true }, orderBy: { sequence: "desc" } });
  const observation = options.observationId ? await client.businessCaseObservation.findFirst({ where: { id: options.observationId, caseId, organizationId }, include: { noticeRevision: true } }) : latest;
  if (!observation) throw new BusinessAccessError();
  const eventCount = await client.businessCaseEvent.count({ where: { caseId, organizationId } });
  const pages = (count: number, requested = 1) => { const total = Math.max(1, Math.ceil(count / 20)); return { pages: total, page: Math.min(total, Math.max(1, Number.isFinite(requested) ? Math.floor(requested) : 1)) }; };
  const activity = pages(eventCount, options.eventPage), history = pages(item.noticeHistory.revisionCount, options.revisionPage);
  const [events, revisions, currentNotice] = await Promise.all([
    client.businessCaseEvent.findMany({ where: { caseId, organizationId }, orderBy: { version: "desc" }, take: 20, skip: (activity.page - 1) * 20 }),
    client.noticeRevision.findMany({ where: { historyId: item.noticeHistoryId }, orderBy: { number: "desc" }, take: 20, skip: (history.page - 1) * 20 }),
    client.recall.findFirst({ where: { sourceAuthority: item.noticeHistory.sourceAuthority, externalId: item.noticeHistory.externalId, isFixture: false } }),
  ]);
  let currentNoticeChanged = false, catalogInvalid = false;
  if (currentNotice) { try { currentNoticeChanged = noticeContent(currentNotice).contentHash !== latest.noticeRevision.contentHash; } catch { catalogInvalid = true; } }
  const membership = await membershipFor(client, userId, organizationId);
  return { item, membership, latest, observation, stock: JSON.parse(observation.stockEvidence) as StockEvidence, notice: JSON.parse(observation.noticeRevision.payload) as NoticeSnapshot, evidence: JSON.parse(observation.evidence) as BusinessEvidence, events, revisions, activity, history, currentNoticeChanged, catalogInvalid, catalogMissing: !currentNotice, checkedAt: new Date() };
}
