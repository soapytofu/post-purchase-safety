// Prisma otherwise sizes the pool from the machine's CPU count, which can
// exhaust a small hosted project's shared pooler during overlapping restarts.
export function databaseConnectionUrl(value: string | undefined): string | undefined {
  if (!value || !/^postgres(?:ql)?:\/\//.test(value)) return value;
  const url = new URL(value);
  if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", "3");
  if (!url.searchParams.has("pool_timeout")) url.searchParams.set("pool_timeout", "20");
  return url.toString();
}
