"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { requireBusinessAccount } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BusinessAccessError, acceptBusinessInvitation, changeBusinessMember, createOrganization, inviteBusinessMember, revokeBusinessInvitation, saveLocation, setLocationArchived } from "@/lib/business-data";

export type BusinessFormState = { message: string; inviteToken?: string };
const field = (form: FormData, key: string) => String(form.get(key) ?? "");

function failure(error: unknown): BusinessFormState {
  if (error instanceof ZodError) return { message: error.issues[0]?.message ?? "Check the form fields." };
  if (error instanceof BusinessAccessError) return { message: "This workspace, item or permission is no longer available. Refresh and check your access." };
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { message: "This location code or membership already exists. Choose another code or refresh." };
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021") return { message: "Business setup is pending. The operator must apply the business database migration." };
  if (error instanceof Error && error.message === "This email is already a member of this business.") return { message: error.message };
  return { message: "We couldn’t save that change. Please refresh and try again." };
}

export async function createBusiness(_previous: BusinessFormState, form: FormData): Promise<BusinessFormState> {
  const identity = await requireBusinessAccount();
  let organization;
  try { organization = await createOrganization(prisma, identity, field(form, "name")); } catch (error) { return failure(error); }
  revalidatePath("/business");
  redirect(`/business/${organization.id}`);
}

export async function acceptInvite(_previous: BusinessFormState, form: FormData): Promise<BusinessFormState> {
  const identity = await requireBusinessAccount("/business/join");
  let organizationId;
  try { organizationId = await acceptBusinessInvitation(prisma, identity, field(form, "token")); } catch { return { message: "Invitation unavailable. Check the code, expiry and that you’re signed in with the invited email. Ask the owner for a fresh invitation if needed." }; }
  revalidatePath("/business");
  redirect(`/business/${organizationId}`);
}

export async function businessMutation(_previous: BusinessFormState, form: FormData): Promise<BusinessFormState> {
  const organizationId = field(form, "organizationId");
  const identity = await requireBusinessAccount(`/business/${organizationId}`);
  let inviteToken: string | undefined;
  try {
    switch (field(form, "operation")) {
      case "location":
        await saveLocation(prisma, identity.id, organizationId, { code: field(form, "code"), name: field(form, "name"), address: field(form, "address") }, field(form, "locationId") || undefined); break;
      case "archive": await setLocationArchived(prisma, identity.id, organizationId, field(form, "locationId"), true); break;
      case "restore": await setLocationArchived(prisma, identity.id, organizationId, field(form, "locationId"), false); break;
      case "invite": inviteToken = await inviteBusinessMember(prisma, identity.id, organizationId, { email: field(form, "email"), role: field(form, "role") }); break;
      case "revoke": await revokeBusinessInvitation(prisma, identity.id, organizationId, field(form, "invitationId")); break;
      case "member": {
        const role = field(form, "role");
        if (role !== "MANAGER" && role !== "STAFF" && role !== "REMOVE") throw new BusinessAccessError();
        await changeBusinessMember(prisma, identity.id, organizationId, field(form, "membershipId"), role); break;
      }
      default: throw new BusinessAccessError();
    }
  } catch (error) { return failure(error); }
  revalidatePath(`/business/${organizationId}`);
  revalidatePath("/business");
  return { message: inviteToken ? "Invitation created. Share it privately with the invited person; no email was sent. It expires in 7 days." : "Change saved.", inviteToken };
}
