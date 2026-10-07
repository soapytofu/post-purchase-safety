export function authConfigured() {
  return process.env.AUTH_MODE === "supabase" && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

export function hostedDatabaseConfigured() {
  return /^postgres(?:ql)?:\/\//.test(process.env.DATABASE_URL ?? "");
}

export function authRedirectUrl(path: "/" | "/login?error=link", requestUrl: string) {
  // Next's development request URL can use localhost even when the browser
  // connected to 127.0.0.1. Keep redirects on the configured cookie origin.
  return new URL(path, process.env.APP_URL ?? requestUrl);
}
