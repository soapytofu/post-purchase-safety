import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { authConfigured } from "./auth-config";

export async function authClient() {
  if (!authConfigured()) throw new Error("Account sign-in is not configured.");
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(values) {
        // Server Components cannot write cookies; the proxy refreshes them first.
        try { values.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* rendering only */ }
      },
    },
  });
}
