export const requiredSources = ["openfda-food-enforcement", "usda-fsis-recalls", "cpsc-recalls"] as const;
export const sourceCoverage: Record<string, string> = {
  "openfda-food-enforcement": "FDA food enforcement records currently marked Ongoing; not every FDA announcement or completed recall.",
  "usda-fsis-recalls": "USDA FSIS recall and public-health-alert archive; RSS fallback is recent-only and remains partial.",
  "cpsc-recalls": "CPSC consumer-product recalls from the past two years.",
};
export const SOURCE_STALE_AFTER_HOURS = 3;

type SourceState = { provider: string; status: string; recordCount: number; lastAttemptAt: Date | null; lastSuccessAt: Date | null };

export function sourceHealth(states: SourceState[], now = Date.now()) {
  const staleBefore = now - SOURCE_STALE_AFTER_HOURS * 60 * 60 * 1000;
  const sources = requiredSources.map(provider => {
    const state = states.find(item => item.provider === provider);
    return { provider, status: state?.status ?? "MISSING", recordCount: state?.recordCount ?? 0, lastAttemptAt: state?.lastAttemptAt ?? null, lastSuccessAt: state?.lastSuccessAt ?? null, stale: !state?.lastSuccessAt || state.lastSuccessAt.getTime() < staleBefore };
  });
  return { healthy: sources.every(source => source.status === "SUCCEEDED" && source.recordCount > 0 && !source.stale), sources };
}
