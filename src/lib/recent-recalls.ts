export function recallDateFilter(period: string, now = new Date()) {
  const days = period === "7" ? 7 : period === "90" ? 90 : period === "all" ? null : 30;
  if (days === null) return {};
  return { recallDate: { gte: new Date(now.getTime() - days * 86_400_000) } };
}
