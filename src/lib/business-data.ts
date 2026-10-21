import { createHash, randomBytes } from "node:crypto";
import { BusinessRole, Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";

// Identity must come from fresh server-side verification, never a form/cookie ID.
export type BusinessIdentity = { id: string; email: string };
type Reader = Pick<Prisma.TransactionClient, "organization" | "businessMembership" | "businessLocation" | "businessInvitation">;
export class BusinessAccessError extends Error {
  constructor() { super("Business workspace or permission unavailable."); }
}
export const organizationName = z.string().trim().min(2).max(100);
export const locationInput = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{0,19}$/, "Use a 1–20 character location code: letters, numbers, hyphens or underscores."),
  name: z.string().trim().min(2).max(100),
  address: z.string().trim().max(250).default(""),
});
const inviteInput = z.object({ email: z.string().trim().email().max(254).transform(value => value.toLowerCase()), role: z.enum(["MANAGER", "STAFF"]) });
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function membershipFor(client: Reader, verifiedUserId: string, organizationId: string, roles: readonly BusinessRole[] = ["OWNER", "MANAGER", "STAFF"]) {
  const membership = await client.businessMembership.findUnique({ where: { organizationId_userId: { organizationId, userId: verifiedUserId } } });
  if (!membership || !roles.includes(membership.role)) throw new BusinessAccessError();
  return membership;
}

// Serialize mutations with membership changes. Recheck authorization after taking
// the organization lock, so an in-flight action cannot use a revoked role.
export async function authorizedBusinessWrite<T>(client: PrismaClient, userId: string, organizationId: string, roles: readonly BusinessRole[], work: (tx: Prisma.TransactionClient) => Promise<T>) {
  return client.$transaction(async tx => {
    await membershipFor(tx, userId, organizationId, roles);
    await tx.organization.update({ where: { id: organizationId }, data: { authorizationVersion: { increment: 1 } } });
    await membershipFor(tx, userId, organizationId, roles);
    return work(tx);
  }, { timeout: 30_000 });
}

export async function createOrganization(client: PrismaClient, identity: BusinessIdentity, name: string) {
  return client.organization.create({ data: { name: organizationName.parse(name), members: { create: { userId: identity.id, email: identity.email.toLowerCase(), role: "OWNER" } } } });
}

export async function listOrganizations(client: Reader, userId: string) {
  return client.businessMembership.findMany({ where: { userId }, include: { organization: true }, orderBy: { createdAt: "asc" } });
}

export async function getBusinessWorkspace(client: Reader, userId: string, organizationId: string) {
  const membership = await membershipFor(client, userId, organizationId);
  const organization = await client.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const locations = await client.businessLocation.findMany({ where: { organizationId }, orderBy: { code: "asc" } });
  // Staff/manager need not receive private team email addresses or invite hashes.
  const members = membership.role === "OWNER" ? await client.businessMembership.findMany({ where: { organizationId }, select: { id: true, email: true, role: true }, orderBy: { createdAt: "asc" } }) : [];
  const invitations = membership.role === "OWNER" ? await client.businessInvitation.findMany({ where: { organizationId, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true, email: true, role: true, expiresAt: true }, orderBy: { createdAt: "desc" } }) : [];
  return { organization, membership, locations, members, invitations };
}

export async function saveLocation(client: PrismaClient, userId: string, organizationId: string, value: unknown, locationId?: string) {
  const data = locationInput.parse(value);
  return authorizedBusinessWrite(client, userId, organizationId, ["OWNER"], async tx => {
    if (!locationId) return tx.businessLocation.create({ data: { ...data, organizationId } });
    // Codes are stable inventory references; change the display name/address only.
    const result = await tx.businessLocation.updateMany({ where: { id: locationId, organizationId, code: data.code, archivedAt: null }, data: { name: data.name, address: data.address } });
    if (result.count !== 1) throw new BusinessAccessError();
    return tx.businessLocation.findFirstOrThrow({ where: { id: locationId, organizationId } });
  });
}

export async function setLocationArchived(client: PrismaClient, userId: string, organizationId: string, locationId: string, archived: boolean) {
  return authorizedBusinessWrite(client, userId, organizationId, ["OWNER"], async tx => {
    const result = await tx.businessLocation.updateMany({ where: { id: locationId, organizationId }, data: { archivedAt: archived ? new Date() : null } });
    if (result.count !== 1) throw new BusinessAccessError();
  });
}

export async function inviteBusinessMember(client: PrismaClient, userId: string, organizationId: string, input: unknown) {
  const data = inviteInput.parse(input);
  const token = randomBytes(32).toString("hex");
  return authorizedBusinessWrite(client, userId, organizationId, ["OWNER"], async tx => {
    const alreadyMember = await tx.businessMembership.findFirst({ where: { organizationId, email: data.email } });
    if (alreadyMember) throw new Error("This email is already a member of this business.");
    await tx.businessInvitation.updateMany({ where: { organizationId, email: data.email, usedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.businessInvitation.create({ data: { ...data, organizationId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } });
    return token;
  });
}

export async function acceptBusinessInvitation(client: PrismaClient, identity: BusinessIdentity, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new BusinessAccessError();
  const tokenHash = hashToken(token);
  return client.$transaction(async tx => {
    const invitation = await tx.businessInvitation.findUnique({ where: { tokenHash } });
    if (!invitation) throw new BusinessAccessError();
    await tx.organization.update({ where: { id: invitation.organizationId }, data: { authorizationVersion: { increment: 1 } } });
    const consumed = await tx.businessInvitation.updateMany({ where: { id: invitation.id, tokenHash, email: identity.email.toLowerCase(), usedAt: null, revokedAt: null, expiresAt: { gt: new Date() }, role: { in: ["MANAGER", "STAFF"] } }, data: { usedAt: new Date() } });
    if (consumed.count !== 1) throw new BusinessAccessError();
    // A stale invitation cannot promote an existing member.
    await tx.businessMembership.upsert({ where: { organizationId_userId: { organizationId: invitation.organizationId, userId: identity.id } }, create: { organizationId: invitation.organizationId, userId: identity.id, email: identity.email.toLowerCase(), role: invitation.role }, update: {} });
    return invitation.organizationId;
  });
}

export async function revokeBusinessInvitation(client: PrismaClient, userId: string, organizationId: string, invitationId: string) {
  return authorizedBusinessWrite(client, userId, organizationId, ["OWNER"], async tx => {
    const result = await tx.businessInvitation.updateMany({ where: { id: invitationId, organizationId, usedAt: null }, data: { revokedAt: new Date() } });
    if (result.count !== 1) throw new BusinessAccessError();
  });
}

export async function changeBusinessMember(client: PrismaClient, userId: string, organizationId: string, membershipId: string, role: "MANAGER" | "STAFF" | "REMOVE") {
  if (!["MANAGER", "STAFF", "REMOVE"].includes(role)) throw new BusinessAccessError();
  return authorizedBusinessWrite(client, userId, organizationId, ["OWNER"], async tx => {
    const where = { id: membershipId, organizationId, role: { not: BusinessRole.OWNER } };
    const member = await tx.businessMembership.findFirst({ where });
    if (!member) throw new BusinessAccessError();
    const result = role === "REMOVE" ? await tx.businessMembership.deleteMany({ where }) : await tx.businessMembership.updateMany({ where, data: { role } });
    if (result.count !== 1) throw new BusinessAccessError();
    // Removing/changing a member also invalidates old unaccepted invites.
    await tx.businessInvitation.updateMany({ where: { organizationId, email: member.email, usedAt: null }, data: { revokedAt: new Date() } });
  });
}

export async function exportBusinessLocations(client: Reader, userId: string, organizationId: string) {
  await membershipFor(client, userId, organizationId, ["OWNER", "MANAGER"]);
  const locations = await client.businessLocation.findMany({ where: { organizationId }, select: { code: true, name: true, address: true, archivedAt: true }, orderBy: { code: "asc" } });
  return { format: "safekeep-business-locations", version: 1, exportedAt: new Date().toISOString(), locations };
}
