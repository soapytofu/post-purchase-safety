import { NextRequest, NextResponse } from "next/server";
import { authClient } from "@/lib/supabase-server";
import { authConfigured, authRedirectUrl, safeReturnTo } from "@/lib/auth-config";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeReturnTo(request.nextUrl.searchParams.get("next") ?? request.cookies.get("safekeep-sign-in-return")?.value);
  if (authConfigured() && code) {
    const client = await authClient();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) { const response = NextResponse.redirect(authRedirectUrl(next, request.url), { headers: { "Cache-Control": "no-store" } }); response.cookies.delete("safekeep-sign-in-return"); return response; }
  }
  return NextResponse.redirect(authRedirectUrl(`/login?error=link&next=${encodeURIComponent(next)}`, request.url), { headers: { "Cache-Control": "no-store" } });
}
