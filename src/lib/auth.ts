import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authClient } from "./supabase-server";
import { authConfigured, hostedDatabaseConfigured, safeReturnTo } from "./auth-config";
import { hostnameFromHostHeader, isLoopbackHostname } from "./access-boundary";
import { provisionHousehold } from "./household-data";
import { prisma } from "./prisma";

export const localPilotAllowed = async () => process.env.AUTH_MODE !== "supabase" && process.env.NODE_ENV !== "production" && isLoopbackHostname(hostnameFromHostHeader((await headers()).get("host")));

export const verifiedAccount = cache(async () => {
  if (!authConfigured() || (process.env.NODE_ENV === "production" && !hostedDatabaseConfigured())) return null;
  const client = await authClient();
  // Fresh server-side verification also catches deleted/banned accounts. Never use getSession for authorization.
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user || !user.email_confirmed_at) return null;
  if (!user.email) return null;
  return { id: user.id, email: user.email };
});

export const householdSession = cache(async () => {
  if (await localPilotAllowed()) return { householdId: null, userId: null, role: "OWNER", local: true };
  const user = await verifiedAccount();
  if (!user) return null;
  const membership = await provisionHousehold(prisma, user.id);
  return { ...membership, userId: user.id, local: false };
});

// Business accounts never inherit the local development/household bypass.
export async function requireBusinessAccount(returnTo = "/business") {
  const identity = await verifiedAccount();
  if (!identity) redirect(`/login?next=${encodeURIComponent(safeReturnTo(returnTo))}`);
  await provisionHousehold(prisma, identity.id);
  return identity;
}

export async function requireHousehold(returnTo = "/") {
  const session = await householdSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(safeReturnTo(returnTo))}`);
  return session;
}

export async function requireLocalOperator() {
  if (!(await localPilotAllowed())) throw new Error("Use the protected scheduled sync endpoint for hosted source updates.");
}
