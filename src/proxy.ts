import { NextResponse, type NextRequest } from "next/server";
import { hostnameFromHostHeader, isLoopbackHostname, isPublicPilotPath } from "@/lib/access-boundary";

export function proxy(request: NextRequest) {
  const loopbackDevelopment = process.env.NODE_ENV !== "production" && isLoopbackHostname(hostnameFromHostHeader(request.headers.get("host")));
  if (loopbackDevelopment || isPublicPilotPath(request.nextUrl.pathname)) return NextResponse.next();
  const message = "Private household routes are disabled on public hosts until authenticated tenancy is configured.";
  if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: message }, { status: 403 });
  return new NextResponse(message, { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
