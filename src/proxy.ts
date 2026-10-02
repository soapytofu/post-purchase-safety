import { NextResponse, type NextRequest } from "next/server";
import { hostnameFromHostHeader, isLoopbackHostname, isPublicPilotPath } from "@/lib/access-boundary";
import { createServerClient } from "@supabase/ssr";
import { authConfigured, hostedDatabaseConfigured } from "@/lib/auth-config";

export async function proxy(request: NextRequest) {
  const loopbackDevelopment = process.env.AUTH_MODE !== "supabase" && process.env.NODE_ENV !== "production" && isLoopbackHostname(hostnameFromHostHeader(request.headers.get("host")));
  const path = request.nextUrl.pathname;
  if (loopbackDevelopment || isPublicPilotPath(path)) return NextResponse.next();
  if (authConfigured() && (process.env.NODE_ENV !== "production" || hostedDatabaseConfigured())) {
    let response = NextResponse.next({ request });
    const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(values) {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    await client.auth.getClaims();
    response.headers.set("Cache-Control", "private, no-store");
    // Pages/actions/routes verify identity and membership again near the database.
    return response;
  }
  if (path === "/login" || path.startsWith("/auth/")) return NextResponse.next();
  const message = "Private household routes are disabled on public hosts until authenticated tenancy is configured.";
  if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: message }, { status: 403 });
  return new NextResponse(message, { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
