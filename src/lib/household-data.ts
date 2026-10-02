import { Prisma, type PrismaClient } from "@prisma/client";

export type HouseholdScope = { householdId: string | null };
type Client = Pick<PrismaClient, "appUser" | "membership" | "purchase" | "recallMatch">;

// Only a server-verified auth identity may be passed here; never a form field or cookie ID.
export async function provisionHousehold(client: Client, verifiedUserId: string) {
  let user;
  try {
    user = await client.appUser.upsert({
      where: { id: verifiedUserId },
      create: { id: verifiedUserId, membership: { create: { household: { create: {} }, role: "OWNER" } } },
      update: {},
      include: { membership: true },
    });
  } catch (error) {
    // Nested upserts may race on first sign-in. The unique identity wins; do not create another household.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    user = await client.appUser.findUniqueOrThrow({ where: { id: verifiedUserId }, include: { membership: true } });
  }
  if (!user.membership) throw new Error("No active household membership.");
  return { householdId: user.membership.householdId, role: user.membership.role };
}

export function purchaseScope(scope: HouseholdScope): Prisma.PurchaseWhereInput {
  return { householdId: scope.householdId };
}

export function matchScope(scope: HouseholdScope): Prisma.RecallMatchWhereInput {
  return { purchase: purchaseScope(scope) };
}

export async function setHouseholdMatchStatus(client: Client, scope: HouseholdScope, id: string, status: Prisma.RecallMatchUpdateInput["status"]) {
  const result = await client.recallMatch.updateMany({ where: { id, ...matchScope(scope) }, data: { status } });
  if (result.count !== 1) throw new Error("Match not found in your household.");
}

export async function deleteHouseholdPurchases(client: Client, scope: HouseholdScope) {
  return client.purchase.deleteMany({ where: purchaseScope(scope) });
}
