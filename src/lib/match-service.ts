import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { matchPurchaseToRecall } from "@/domain/matching/match";
import type { NormalizedRecall } from "@/domain/types";

export function recallRecordToDomain(recall: { externalId: string; sourceAuthority: string; headline: string; description: string; brand: string; productName: string; category: string; upcs: string; lotNumbers: string; distributionStartDate: Date | null; distributionEndDate: Date | null; recallDate: Date; severity: string | null; recommendedAction: string; sourceUrl: string; rawData: string; isFixture: boolean }): NormalizedRecall {
  return { ...recall, upcs: JSON.parse(recall.upcs), lotNumbers: JSON.parse(recall.lotNumbers), rawData: JSON.parse(recall.rawData) };
}

type MatchClient = Pick<Prisma.TransactionClient, "purchase" | "recall" | "recallMatch">;

export async function regenerateMatches(client: MatchClient = prisma) {
  const [purchases, recalls] = await Promise.all([client.purchase.findMany(), client.recall.findMany()]);
  for (const purchase of purchases) {
    for (const recallRecord of recalls) {
      const result = matchPurchaseToRecall(purchase, recallRecordToDomain(recallRecord));
      if (result.confidence === "NONE") {
        await client.recallMatch.deleteMany({ where: { purchaseId: purchase.id, recallId: recallRecord.id } });
      } else {
        await client.recallMatch.upsert({
          where: { purchaseId_recallId: { purchaseId: purchase.id, recallId: recallRecord.id } },
          create: { purchaseId: purchase.id, recallId: recallRecord.id, confidence: result.confidence, score: result.score, reasons: JSON.stringify(result.reasons) },
          update: { confidence: result.confidence, score: result.score, reasons: JSON.stringify(result.reasons) },
        });
      }
    }
  }
}
