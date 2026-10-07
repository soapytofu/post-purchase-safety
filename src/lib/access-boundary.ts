export function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

export function hostnameFromHostHeader(host: string | null): string {
  if (!host) return "";
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    return end > 0 ? host.slice(1, end) : "";
  }
  return host.split(":", 1)[0];
}

export function isPublicPilotPath(pathname: string): boolean {
  return pathname === "/notices" || pathname.startsWith("/notices/") || pathname === "/api/health" || pathname === "/api/sync" || pathname === "/email-preferences" || pathname === "/api/notifications/unsubscribe" || pathname === "/api/notifications/dispatch";
}
