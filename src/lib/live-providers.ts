import { CpscRecallProvider } from "@/providers/cpsc-recall-provider";
import { FsisRecallProvider } from "@/providers/fsis-recall-provider";
import { OpenFdaRecallProvider } from "@/providers/openfda-recall-provider";
import type { RecallProvider } from "@/providers/recall-provider";
import { syncRecallProvider } from "@/lib/sync-recalls";

export function liveRecallProviders(): RecallProvider[] {
  return [new OpenFdaRecallProvider(), new FsisRecallProvider(), new CpscRecallProvider()];
}

export async function syncAllLiveProviders() {
  const results: Array<{ provider: string; status: "succeeded" | "failed"; count?: number; error?: string }> = [];
  for (const provider of liveRecallProviders()) {
    try {
      results.push({ provider: provider.name, status: "succeeded", count: await syncRecallProvider(provider) });
    } catch (error) {
      results.push({ provider: provider.name, status: "failed", error: error instanceof Error ? error.message : "Unknown provider error" });
    }
  }
  return results;
}
