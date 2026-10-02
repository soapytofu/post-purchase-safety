import { NextRequest, NextResponse } from "next/server";
import { authClient } from "@/lib/supabase-server";
import { authConfigured } from "@/lib/auth-config";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (authConfigured() && code) {
    const client = await authClient();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/", request.url), { headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.redirect(new URL("/login?error=link", request.url), { headers: { "Cache-Control": "no-store" } });
}
