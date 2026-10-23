import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { matchPurchaseToRecall } from "@/domain/matching/match";
import type { NormalizedRecall } from "@/domain/types";
import { enqueueRecallEmails } from "./email-notifications";

export function recallRecordToDomain(recall: { externalId: string; sourceAuthority: string; headline: string; description: string; brand: string; productName: string; category: string; upcs: string; lotNumbers: string; distributionStartDate: Date | null; distributionEndDate: Date | null; recallDate: Date; severity: string | null; recommendedAction: string; sourceUrl: string; rawData: string; isFixture: boolean }): NormalizedRecall {
  return { ...recall, upcs: JSON.parse(recall.upcs), lotNumbers: JSON.parse(recall.lotNumbers), rawData: JSON.parse(recall.rawData) };
}

type MatchClient = Pick<Prisma.TransactionClient, "purchase" | "recall" | "recallMatch" | "appUser" | "emailNotification">;

export async function regenerateMatches(client: MatchClient = prisma, purchaseWhere?: Prisma.PurchaseWhereInput) {
  const [purchases, recalls] = await Promise.all([client.purchase.findMany({ where: purchaseWhere }), client.recall.findMany()]);
  const normalized = recalls.map(record => ({ id: record.id, recall: recallRecordToDomain(record) }));
  for (const purchase of purchases) {
    const matchedIds: string[] = [];
    for (const recallRecord of normalized) {
      const result = matchPurchaseToRecall(purchase, recallRecord.recall);
      if (result.confidence !== "NONE") {
        matchedIds.push(recallRecord.id);
        await client.recallMatch.upsert({
          where: { purchaseId_recallId: { purchaseId: purchase.id, recallId: recallRecord.id } },
          create: { purchaseId: purchase.id, recallId: recallRecord.id, confidence: result.confidence, score: result.score, reasons: JSON.stringify(result.reasons) },
          update: { confidence: result.confidence, score: result.score, reasons: JSON.stringify(result.reasons) },
        });
      }
    }
    // One scoped deletion replaces thousands of no-op per-pair requests.
    // Existing matching rows keep their IDs and the user's review status.
    await client.recallMatch.deleteMany({ where: { purchaseId: purchase.id, recallId: { notIn: matchedIds } } });
  }
  const householdId = purchaseWhere?.householdId;
  await enqueueRecallEmails(client, typeof householdId === "string" || householdId === null ? householdId : undefined);
}
