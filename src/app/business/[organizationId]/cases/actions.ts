"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireBusinessAccount } from "@/lib/auth";
import { BusinessAccessError } from "@/lib/business-data";
import { addBusinessCaseNote, BusinessCaseError, refreshBusinessCase, reviewBusinessCase, saveBusinessCase } from "@/lib/business-cases";
import { prisma } from "@/lib/prisma";

export type CaseFormState = { message: string; caseId?: string; success?: boolean };
export async function caseMutation(_previous: CaseFormState, form: FormData): Promise<CaseFormState> {
  const organizationId = String(form.get("organizationId") ?? "");
  const identity = await requireBusinessAccount(`/business/${organizationId}/cases`);
  const value = (key: string) => String(form.get(key) ?? "");
  try {
    let caseId = value("caseId"), message;
    switch (value("operation")) {
      case "save": {
        const result = await saveBusinessCase(prisma, identity.id, organizationId, { stockRowId: value("stockRowId"), recallId: value("recallId"), noticeUpdatedAt: value("noticeUpdatedAt") });
        caseId = result.caseId;
        message = result.alreadySaved ? "This evidence is already saved." : "Case saved with its stock and notice evidence.";
        break;
      }
      case "refresh": {
        const result = await refreshBusinessCase(prisma, identity.id, organizationId, caseId, Number(value("expectedVersion")));
        message = result.alreadyCurrent ? "Saved notice evidence is already current." : "Latest notice captured against the saved stock. Review the new evidence.";
        break;
      }
      case "review":
        await reviewBusinessCase(prisma, identity.id, organizationId, { caseId, expectedVersion: Number(value("expectedVersion")), observationId: value("observationId"), status: value("status"), note: value("note"), affectedQuantity: value("affectedQuantity") ? Number(value("affectedQuantity")) : undefined, evidenceReviewed: value("evidenceReviewed") === "yes" });
        message = "Review recorded. Earlier evidence and decisions remain in the activity history.";
        break;
      case "note":
        await addBusinessCaseNote(prisma, identity.id, organizationId, { caseId, expectedVersion: Number(value("expectedVersion")), note: value("note") });
        message = "Note added to the activity history. The review decision is unchanged.";
        break;
      default: return { message: "Choose a supported case action." };
    }
    revalidatePath(`/business/${organizationId}/cases`);
    revalidatePath(`/business/${organizationId}/cases/${caseId}`);
    return { message, caseId, success: true };
  } catch (error) {
    if (error instanceof BusinessCaseError) return { message: error.message };
    if (error instanceof BusinessAccessError) return { message: "This case or permission is unavailable. Refresh and check your business access." };
    if (error instanceof z.ZodError) return { message: error.issues[0]?.message ?? "Check the review fields." };
    return { message: "The case could not be updated. Refresh the page and try again; no partial decision was saved." };
  }
}
