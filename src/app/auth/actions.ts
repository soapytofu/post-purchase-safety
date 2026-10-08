"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { authClient } from "@/lib/supabase-server";
import { authConfigured, safeReturnTo } from "@/lib/auth-config";
import { cookies } from "next/headers";

export type SignInState = { message: string; sent?: boolean };

export async function requestSignIn(_previous: SignInState, form: FormData): Promise<SignInState> {
  const email = z.string().trim().email().max(254).safeParse(form.get("email"));
  if (!email.success) return { message: "Enter a valid email address." };
  if (!authConfigured()) return { message: "Account sign-in is not connected yet." };
  const base = process.env.APP_URL;
  if (!base || (process.env.NODE_ENV === "production" && !base.startsWith("https://"))) return { message: "The site address is not configured. Contact the operator." };
  const client = await authClient();
  const returnTo = safeReturnTo(form.get("next"));
  const callback = new URL("/auth/callback", base);
  callback.searchParams.set("next", returnTo);
  const { error } = await client.auth.signInWithOtp({ email: email.data, options: { emailRedirectTo: callback.toString() } });
  if (error) return { message: "We couldn’t send the link. Please wait a moment and try again." };
  (await cookies()).set("safekeep-sign-in-return", returnTo, { httpOnly: true, secure: base.startsWith("https://"), sameSite: "lax", path: "/", maxAge: 3600 });
  return { sent: true, message: "Check your email for a secure sign-in link. New accounts get their own empty household ledger." };
}

export async function signOut() {
  const client = await authClient();
  const { error } = await client.auth.signOut();
  if (error) throw new Error("Sign-out could not finish. Please try again.");
  redirect("/login");
}
