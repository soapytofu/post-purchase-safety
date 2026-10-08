import { NextRequest, NextResponse } from "next/server";
import { authClient } from "@/lib/supabase-server";
import { authConfigured, authRedirectUrl, safeReturnTo } from "@/lib/auth-config";

// Token-hash email templates also work when the user opens the email on another device.
export async function GET(request: NextRequest) {
  const token_hash = request.nextUrl.searchParams.get("token_hash");
  const next = safeReturnTo(request.nextUrl.searchParams.get("next") ?? request.cookies.get("safekeep-sign-in-return")?.value);
  if (authConfigured() && token_hash) {
    const client = await authClient();
    const { error } = await client.auth.verifyOtp({ token_hash, type: "email" });
    if (!error) { const response = NextResponse.redirect(authRedirectUrl(next, request.url), { headers: { "Cache-Control": "no-store" } }); response.cookies.delete("safekeep-sign-in-return"); return response; }
  }
  return NextResponse.redirect(authRedirectUrl(`/login?error=link&next=${encodeURIComponent(next)}`, request.url), { headers: { "Cache-Control": "no-store" } });
}
