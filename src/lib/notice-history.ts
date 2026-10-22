import { createHash, randomUUID } from "node:crypto";
import type { Prisma, Recall } from "@prisma/client";

export function stableJson(value: unknown): string {
  const ordered = (item: unknown): unknown => Array.isArray(item) ? item.map(ordered) : item && typeof item === "object" ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, val]) => [key, ordered(val)])) : item;
  return JSON.stringify(ordered(value));
}
export function noticeSnapshot(recall: Recall) {
  const strings = (text: string): string[] => {
    const value: unknown = JSON.parse(text);
    if (!Array.isArray(value) || !value.every(item => typeof item === "string")) throw new Error("Notice identifiers must be arrays of strings.");
    return [...new Set(value)].sort();
  };
  return {
    sourceAuthority: recall.sourceAuthority, externalId: recall.externalId,
    headline: recall.headline, description: recall.description, productName: recall.productName,
    brand: recall.brand, category: recall.category, upcs: strings(recall.upcs), lotNumbers: strings(recall.lotNumbers),
    recallDate: recall.recallDate.toISOString(), distributionStartDate: recall.distributionStartDate?.toISOString() ?? null,
    distributionEndDate: recall.distributionEndDate?.toISOString() ?? null, severity: recall.severity,
    recommendedAction: recall.recommendedAction, sourceUrl: recall.sourceUrl, rawData: JSON.parse(recall.rawData) as unknown,
  };
}
export type NoticeSnapshot = ReturnType<typeof noticeSnapshot>;
export function noticeContent(recall: Recall) {
  const snapshot = noticeSnapshot(recall);
  const payload = stableJson(snapshot);
  return { snapshot, payload, contentHash: createHash("sha256").update(payload).digest("hex") };
}
export function changedNoticeFields(before: NoticeSnapshot, after: NoticeSnapshot) {
  return Object.keys(after).filter(key => stableJson(before[key as keyof NoticeSnapshot]) !== stableJson(after[key as keyof NoticeSnapshot]));
}
export type HistorySource = "SYNC" | "BEFORE_SYNC" | "CASE_SAVE" | "CASE_REFRESH" | "BASELINE";

// Call inside a transaction. The upsert takes a row lock before assigning a
// revision number, serializing a case save with concurrent source updates.
export async function recordNoticeRevision(tx: Prisma.TransactionClient, recall: Recall, source: HistorySource) {
  if (recall.isFixture) throw new Error("Demo notices cannot enter business notice history.");
  const content = noticeContent(recall);
  const history = await tx.noticeHistory.upsert({ where: { sourceAuthority_externalId: { sourceAuthority: recall.sourceAuthority, externalId: recall.externalId } }, create: { sourceAuthority: recall.sourceAuthority, externalId: recall.externalId, lockVersion: 1 }, update: { lockVersion: { increment: 1 } } });
  if (history.currentHash === content.contentHash && history.revisionCount) {
    return tx.noticeRevision.findUniqueOrThrow({ where: { historyId_number: { historyId: history.id, number: history.revisionCount } } });
  }
  const revision = await tx.noticeRevision.create({ data: { historyId: history.id, number: history.revisionCount + 1, contentHash: content.contentHash, payload: content.payload, observationSource: source } });
  await tx.noticeHistory.update({ where: { id: history.id }, data: { revisionCount: revision.number, currentHash: content.contentHash } });
  const decided = await tx.businessRecallCase.findMany({ where: { noticeHistoryId: history.id, status: { not: "NEEDS_REVIEW" } } });
  for (const item of decided) {
    const reopened = await tx.businessRecallCase.update({ where: { id: item.id }, data: { status: "NEEDS_REVIEW", affectedQuantity: null, version: { increment: 1 } } });
    await tx.businessCaseEvent.create({ data: { caseId: item.id, organizationId: item.organizationId, version: reopened.version, actorId: "system:notice-history", kind: "NOTICE_CHANGED", payload: JSON.stringify({ noticeRevisionId: revision.id, noticeVersion: revision.number, previousStatus: item.status, previousAffectedQuantity: item.affectedQuantity }) } });
  }
  return revision;
}

// Bulk initial capture avoids thousands of network round-trips on the first
// sync after rollout. Changed existing notices still use the serialized path.
export async function recordNoticeBatch(tx: Prisma.TransactionClient, records: Recall[], source: HistorySource) {
  const live = records.filter(record => !record.isFixture);
  for (let offset = 0; offset < live.length; offset += 100) {
    const batch = live.slice(offset, offset + 100).map(recall => ({ recall, ...noticeContent(recall) }));
    const known = await tx.noticeHistory.findMany({ where: { OR: batch.map(({ recall }) => ({ sourceAuthority: recall.sourceAuthority, externalId: recall.externalId })) } });
    const lookup = new Map(known.map(item => [stableJson([item.sourceAuthority, item.externalId]), item]));
    const fresh = batch.filter(({ recall }) => !lookup.has(stableJson([recall.sourceAuthority, recall.externalId]))).map(item => ({ ...item, id: randomUUID() }));
    if (fresh.length) {
      const create = { data: fresh.map(item => ({ id: item.id, sourceAuthority: item.recall.sourceAuthority, externalId: item.recall.externalId, revisionCount: 1, currentHash: item.contentHash })), ...(/^postgres(?:ql)?:/.test(process.env.DATABASE_URL ?? "") ? { skipDuplicates: true } : {}) } as Prisma.NoticeHistoryCreateManyArgs;
      await tx.noticeHistory.createMany(create);
      const inserted = new Set((await tx.noticeHistory.findMany({ where: { id: { in: fresh.map(item => item.id) } }, select: { id: true } })).map(item => item.id));
      await tx.noticeRevision.createMany({ data: fresh.filter(item => inserted.has(item.id)).map(item => ({ historyId: item.id, number: 1, contentHash: item.contentHash, payload: item.payload, observationSource: source })) });
      // A concurrent writer may have created a history between lookup and insert.
      for (const item of fresh.filter(item => !inserted.has(item.id))) await recordNoticeRevision(tx, item.recall, source);
    }
    for (const item of batch) {
      const previous = lookup.get(stableJson([item.recall.sourceAuthority, item.recall.externalId]));
      if (previous && previous.currentHash !== item.contentHash) await recordNoticeRevision(tx, item.recall, source);
    }
  }
}
