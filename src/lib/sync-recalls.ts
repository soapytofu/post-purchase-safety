import type { RecallProvider } from "@/providers/recall-provider";
import { prisma } from "@/lib/prisma";
import { regenerateMatches } from "@/lib/match-service";
import { assertTrustedSourceUrl } from "@/lib/source-url";
import { Prisma, type PrismaClient } from "@prisma/client";
import { noticeContent, recordNoticeBatch } from "@/lib/notice-history";

export async function syncRecallProvider(provider: RecallProvider, client: PrismaClient = prisma) {
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
    const keys = new Set(recalls.map(recall => JSON.stringify([recall.sourceAuthority, recall.externalId])));
    if (keys.size !== recalls.length) throw new Error(`${provider.name} returned duplicate notice identifiers`);

    await client.$transaction(async (tx) => {
      // Serialize refreshes of the same provider; history and catalog commit
      // together. Acquire catalog locks before history locks (also used by cases).
      await tx.syncState.upsert({ where: { id: provider.name }, create: { id: provider.name, provider: provider.name, syncedAt: new Date(0), recordCount: 0 }, update: { lastAttemptAt: attemptedAt } });
      const authorities = [...new Set([...(provider.managedAuthorities ?? []), ...recalls.map(recall => recall.sourceAuthority)])];
      if (/^postgres(?:ql)?:/.test(process.env.DATABASE_URL ?? "")) await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Recall" WHERE "sourceAuthority" IN (${Prisma.join(authorities)}) ORDER BY "id" FOR UPDATE`);
      // Preserve source observations before the consumer catalog is updated or
      // pruned. History has no cascade from that replaceable catalog.
      const previous = await tx.recall.findMany({ where: { sourceAuthority: { in: authorities }, isFixture: snapshotIsFixture } });
      await recordNoticeBatch(tx, previous, "BEFORE_SYNC");
      if (result.replaceSnapshot && provider.managedAuthorities?.length) {
        await tx.recall.deleteMany({
          where: {
            sourceAuthority: { in: [...provider.managedAuthorities] },
            isFixture: snapshotIsFixture,
            externalId: { notIn: recalls.map((recall) => recall.externalId) },
          },
        });
      }
      const existing = new Map(previous.map(recall => [JSON.stringify([recall.sourceAuthority, recall.externalId]), recall]));
      const fresh: Prisma.RecallCreateManyInput[] = [];
      for (const recall of recalls) {
        const data = { ...recall, upcs: JSON.stringify(recall.upcs), lotNumbers: JSON.stringify(recall.lotNumbers), rawData: JSON.stringify(recall.rawData ?? {}), isFixture: recall.isFixture ?? false };
        const old = existing.get(JSON.stringify([recall.sourceAuthority, recall.externalId]));
        if (!old) fresh.push(data);
        else if (noticeContent(old).contentHash !== noticeContent({ ...old, ...data }).contentHash) {
          await tx.recall.update({ where: { id: old.id }, data });
        }
      }
      for (let offset = 0; offset < fresh.length; offset += 100) await tx.recall.createMany({ data: fresh.slice(offset, offset + 100) });
      const synchronized = await tx.recall.findMany({ where: { sourceAuthority: { in: authorities }, isFixture: snapshotIsFixture } });
      await recordNoticeBatch(tx, synchronized, "SYNC");
      await regenerateMatches(tx);
      await tx.syncState.upsert({
        where: { id: provider.name },
        create: { id: provider.name, provider: provider.name, syncedAt: attemptedAt, lastAttemptAt: attemptedAt, lastSuccessAt: new Date(), status: result.status, errorMessage: result.message, recordCount: synchronized.length },
        update: { syncedAt: attemptedAt, lastAttemptAt: attemptedAt, lastSuccessAt: new Date(), status: result.status, errorMessage: result.message ?? null, recordCount: synchronized.length },
      });
    }, { maxWait: 10_000, timeout: 60_000 });
    return recalls.length;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown provider error";
    await client.syncState.upsert({
      where: { id: provider.name },
      create: { id: provider.name, provider: provider.name, syncedAt: new Date(0), lastAttemptAt: attemptedAt, status: "FAILED", errorMessage: message.slice(0, 500), recordCount: 0 },
      update: { lastAttemptAt: attemptedAt, status: "FAILED", errorMessage: message.slice(0, 500) },
    });
    throw error;
  }
}
