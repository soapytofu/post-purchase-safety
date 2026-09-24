import type { RecallProvider } from "@/providers/recall-provider";
import { prisma } from "@/lib/prisma";
import { regenerateMatches } from "@/lib/match-service";
import { assertTrustedSourceUrl } from "@/lib/source-url";

export async function syncRecallProvider(provider: RecallProvider) {
  const attemptedAt = new Date();
  try {
    const fetched = await provider.fetchRecalls();
    const result = Array.isArray(fetched) ? { records: fetched, status: "SUCCEEDED" as const, replaceSnapshot: true } : fetched;
    const recalls = result.records;
    if (!recalls.length) throw new Error(`${provider.name} returned no recall records`);
    for (const recall of recalls) assertTrustedSourceUrl(recall.sourceUrl, recall.sourceAuthority);
    const snapshotIsFixture = recalls.every((recall) => recall.isFixture === true);
    if (recalls.some((recall) => Boolean(recall.isFixture) !== snapshotIsFixture)) {
      throw new Error(`${provider.name} mixed live and demo records in one snapshot`);
    }

    await prisma.$transaction(async (tx) => {
      if (result.replaceSnapshot && provider.managedAuthorities?.length) {
        await tx.recall.deleteMany({
          where: {
            sourceAuthority: { in: [...provider.managedAuthorities] },
            isFixture: snapshotIsFixture,
            externalId: { notIn: recalls.map((recall) => recall.externalId) },
          },
        });
      }
      for (const recall of recalls) {
        const data = { ...recall, upcs: JSON.stringify(recall.upcs), lotNumbers: JSON.stringify(recall.lotNumbers), rawData: JSON.stringify(recall.rawData ?? {}), isFixture: recall.isFixture ?? false };
        await tx.recall.upsert({
          where: { sourceAuthority_externalId: { sourceAuthority: recall.sourceAuthority, externalId: recall.externalId } },
          create: data,
          update: data,
        });
      }
      await regenerateMatches(tx);
      await tx.syncState.upsert({
        where: { id: provider.name },
        create: { id: provider.name, provider: provider.name, syncedAt: attemptedAt, lastAttemptAt: attemptedAt, lastSuccessAt: attemptedAt, status: result.status, errorMessage: result.message, recordCount: recalls.length },
        update: { syncedAt: attemptedAt, lastAttemptAt: attemptedAt, lastSuccessAt: attemptedAt, status: result.status, errorMessage: result.message ?? null, recordCount: recalls.length },
      });
    }, { maxWait: 10_000, timeout: 60_000 });
    return recalls.length;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown provider error";
    await prisma.syncState.upsert({
      where: { id: provider.name },
      create: { id: provider.name, provider: provider.name, syncedAt: new Date(0), lastAttemptAt: attemptedAt, status: "FAILED", errorMessage: message.slice(0, 500), recordCount: 0 },
      update: { lastAttemptAt: attemptedAt, status: "FAILED", errorMessage: message.slice(0, 500) },
    });
    throw error;
  }
}
