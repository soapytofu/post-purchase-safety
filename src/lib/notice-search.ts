// SQLite's default contains comparison is insensitive; PostgreSQL needs an
// explicit mode. Keep both the local pilot and hosted database supported.
export function noticeContains(value: string) {
  return { contains: value, ...(/^postgres(?:ql)?:\/\//.test(process.env.DATABASE_URL ?? "") ? { mode: "insensitive" as const } : {}) };
}
