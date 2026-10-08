export function authConfigured() {
  return process.env.AUTH_MODE === "supabase" && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

export function hostedDatabaseConfigured() {
  return /^postgres(?:ql)?:\/\//.test(process.env.DATABASE_URL ?? "");
}

export function safeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\s\u0000-\u001f]/.test(value)) return "/";
  const url = new URL(value, "https://internal.invalid");
  if (url.origin !== "https://internal.invalid" || !["/", "/add", "/purchases", "/alerts", "/settings"].includes(url.pathname)) return "/";
  return `${url.pathname}${url.search}${url.hash}`;
}

export function authRedirectUrl(path: string, requestUrl: string) {
  // Next's development request URL can use localhost even when the browser
  // connected to 127.0.0.1. Keep redirects on the configured cookie origin.
  const base = new URL(process.env.APP_URL ?? requestUrl);
  const result = new URL(path, base);
  return result.origin === base.origin ? result : new URL("/", base);
}
