export type RecentSearch = { query: string; searchedAt: number };
export const SEARCH_HISTORY_LIMIT = 8;
const RETENTION_MS = 30 * 86_400_000;

export function searchHistoryKey(area: "purchases" | "recalls", identity = "public") {
  return `safekeep:search-history:v1:${area}:${encodeURIComponent(identity)}`;
}

export function parseSearchHistory(raw: string | null, now = Date.now()): RecentSearch[] {
  let parsed: unknown;
  try { parsed = JSON.parse(raw ?? "[]"); } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  return parsed.filter((item): item is RecentSearch => Boolean(item) && typeof item.query === "string" && item.query.trim().length > 0 && item.query.length <= 200 && typeof item.searchedAt === "number" && Number.isFinite(item.searchedAt) && item.searchedAt <= now && item.searchedAt >= now - RETENTION_MS)
    .sort((a, b) => b.searchedAt - a.searchedAt)
    .filter(item => { const key = item.query.trim().toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; })
    .slice(0, SEARCH_HISTORY_LIMIT).map(item => ({ query: item.query.trim(), searchedAt: item.searchedAt }));
}

export function rememberSearch(history: RecentSearch[], query: string, now = Date.now()) {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length > 200) return parseSearchHistory(JSON.stringify(history), now);
  return parseSearchHistory(JSON.stringify([{ query: trimmed, searchedAt: now }, ...history]), now);
}
