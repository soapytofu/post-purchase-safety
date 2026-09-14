import type { RecallProvider } from "@/providers/recall-provider";
import { prisma } from "@/lib/prisma";
import { regenerateMatches } from "@/lib/match-service";

export async function syncRecallProvider(provider: RecallProvider) {
  const recalls = await provider.fetchRecalls();
  if (!recalls.length) throw new Error(`${provider.name} returned no recall records`);
  if (provider.managedAuthorities?.length) {
    await prisma.recall.deleteMany({
      where: {
        sourceAuthority: { in: [...provider.managedAuthorities] },
        externalId: { notIn: recalls.map((recall) => recall.externalId) },
      },
    });
  }
  for (const recall of recalls) {
    const data = { ...recall, upcs: JSON.stringify(recall.upcs), lotNumbers: JSON.stringify(recall.lotNumbers), rawData: JSON.stringify(recall.rawData ?? {}), isFixture: recall.isFixture ?? false };
    await prisma.recall.upsert({
      where: { sourceAuthority_externalId: { sourceAuthority: recall.sourceAuthority, externalId: recall.externalId } },
      create: data,
      update: data,
    });
  }
  await prisma.syncState.upsert({ where: { id: provider.name }, create: { id: provider.name, provider: provider.name, syncedAt: new Date(), recordCount: recalls.length }, update: { syncedAt: new Date(), recordCount: recalls.length } });
  await regenerateMatches();
  return recalls.length;
}
