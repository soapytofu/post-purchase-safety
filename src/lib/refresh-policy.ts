import { requiredSources } from "./source-health";

// Keep aligned with the private Supabase watchdog's freshness window.
export const REFRESH_OVERDUE_MINUTES = 90;
type FeedState = { provider: string; status: string; recordCount: number; lastSuccessAt: Date | null };

export function feedsNeedRefresh(states: FeedState[], now = Date.now()): boolean {
  return requiredSources.some(provider => {
    const state = states.find(item => item.provider === provider);
    const completedAt = state?.lastSuccessAt?.getTime();
    return !state || state.status !== "SUCCEEDED" || state.recordCount <= 0 ||
      completedAt === undefined || !Number.isFinite(completedAt) || completedAt > now ||
      completedAt <= now - REFRESH_OVERDUE_MINUTES * 60_000;
  });
}
