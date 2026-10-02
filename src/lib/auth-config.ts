export function authConfigured() {
  return process.env.AUTH_MODE === "supabase" && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

export function hostedDatabaseConfigured() {
  return /^postgres(?:ql)?:\/\//.test(process.env.DATABASE_URL ?? "");
}
