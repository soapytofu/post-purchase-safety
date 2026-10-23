import { CpscRecallProvider } from "@/providers/cpsc-recall-provider";
import { FsisRecallProvider } from "@/providers/fsis-recall-provider";
import { OpenFdaRecallProvider } from "@/providers/openfda-recall-provider";
import type { RecallProvider } from "@/providers/recall-provider";
import { syncRecallProvider } from "@/lib/sync-recalls";
import { prisma } from "@/lib/prisma";
import type { PrismaClient } from "@prisma/client";

export function liveRecallProviders(): RecallProvider[] {
  return [new OpenFdaRecallProvider(), new FsisRecallProvider(), new CpscRecallProvider()];
}

export async function syncAllLiveProviders(providers = liveRecallProviders(), client: PrismaClient = prisma) {
  const results: Array<{ provider: string; status: "succeeded" | "partial" | "failed"; count?: number; error?: string }> = [];
  for (const provider of providers) {
    try {
      await syncRecallProvider(provider, client);
      const state = await client.syncState.findUniqueOrThrow({ where: { id: provider.name } });
      results.push({ provider: provider.name, status: state.status === "PARTIAL" ? "partial" : "succeeded", count: state.recordCount });
    } catch (error) {
      results.push({ provider: provider.name, status: "failed", error: error instanceof Error ? error.message : "Unknown provider error" });
    }
  }
  return results;
}
