export const requiredSources = ["openfda-food-enforcement", "usda-fsis-recalls", "cpsc-recalls"] as const;

type SourceState = { provider: string; status: string; recordCount: number; lastAttemptAt: Date | null; lastSuccessAt: Date | null };

export function sourceHealth(states: SourceState[], now = Date.now()) {
  const staleBefore = now - 48 * 60 * 60 * 1000;
  const sources = requiredSources.map(provider => {
    const state = states.find(item => item.provider === provider);
    return { provider, status: state?.status ?? "MISSING", recordCount: state?.recordCount ?? 0, lastAttemptAt: state?.lastAttemptAt ?? null, lastSuccessAt: state?.lastSuccessAt ?? null, stale: !state?.lastSuccessAt || state.lastSuccessAt.getTime() < staleBefore };
  });
  return { healthy: sources.every(source => source.status === "SUCCEEDED" && source.recordCount > 0 && !source.stale), sources };
}
