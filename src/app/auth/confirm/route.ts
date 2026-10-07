import { NextRequest, NextResponse } from "next/server";
import { authClient } from "@/lib/supabase-server";
import { authConfigured, authRedirectUrl } from "@/lib/auth-config";

// Token-hash email templates also work when the user opens the email on another device.
export async function GET(request: NextRequest) {
  const token_hash = request.nextUrl.searchParams.get("token_hash");
  if (authConfigured() && token_hash) {
    const client = await authClient();
    const { error } = await client.auth.verifyOtp({ token_hash, type: "email" });
    if (!error) return NextResponse.redirect(authRedirectUrl("/", request.url), { headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.redirect(authRedirectUrl("/login?error=link", request.url), { headers: { "Cache-Control": "no-store" } });
}
