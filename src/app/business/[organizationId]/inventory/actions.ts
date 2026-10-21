"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requireBusinessAccount } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BusinessAccessError, membershipFor } from "@/lib/business-data";
import { commitInventoryImport, inventoryPreviewPage, InventoryError, previewInventoryCsv, type InventoryPreviewResult } from "@/lib/business-inventory";
import { MAX_INVENTORY_BYTES } from "@/lib/inventory-csv";

export type InventoryFormState = Partial<InventoryPreviewResult> & { message: string; done?: boolean };
function failure(error: unknown): InventoryFormState {
  if (error instanceof InventoryError) return { message: error.message };
  if (error instanceof BusinessAccessError) return { message: "This business, store or permission is unavailable. Refresh and check your access." };
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021") return { message: "Inventory setup is pending. Ask the operator to apply the inventory migration." };
  return { message: "Inventory could not be saved. Nothing was partially imported. Refresh and try again." };
}

export async function previewInventoryAction(_previous: InventoryFormState, form: FormData): Promise<InventoryFormState> {
  const organizationId = String(form.get("organizationId") ?? "");
  const identity = await requireBusinessAccount(`/business/${organizationId}/inventory`);
  try {
    await membershipFor(prisma, identity.id, organizationId, ["OWNER", "MANAGER"]);
    const file = form.get("file");
    if (!(file instanceof File) || !file.size || !file.name.toLowerCase().endsWith(".csv")) return { message: "Choose a UTF-8 .csv inventory file." };
    if (file.size > MAX_INVENTORY_BYTES) return { message: "Use a CSV file no larger than 5 MB." };
    let text;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()); }
    catch { return { message: "This file is not valid UTF-8. Re-export it as UTF-8 CSV." }; }
    const result = await previewInventoryCsv(prisma, identity.id, organizationId, file.name, text, form.getAll("locationId").map(String));
    return { ...result, message: result.issueCount ? `Found ${result.issueCount} validation issue${result.issueCount === 1 ? "" : "s"}. No stock changed. Correct the file and upload again.` : "Preview ready. No stock has changed yet." };
  } catch (error) { return failure(error); }
}

export async function confirmInventoryAction(_previous: InventoryFormState, form: FormData): Promise<InventoryFormState> {
  const organizationId = String(form.get("organizationId") ?? "");
  const identity = await requireBusinessAccount(`/business/${organizationId}/inventory`);
  if (form.get("confirmed") !== "yes") return { message: "Confirm that this is complete stock for the listed stores before importing." };
  try {
    const result = await commitInventoryImport(prisma, identity.id, organizationId, String(form.get("draftId") ?? ""));
    revalidatePath(`/business/${organizationId}/inventory`);
    revalidatePath(`/business/${organizationId}`);
    return { done: true, message: result.alreadyApplied ? "This content was already imported. It has not been applied again or restored over newer stock." : "Inventory imported. The selected stores’ stock has been replaced; other stores and household purchases are unchanged." };
  } catch (error) { return failure(error); }
}

export async function inventoryPreviewPageAction(organizationId: string, draftId: string, page: number) {
  const identity = await requireBusinessAccount(`/business/${organizationId}/inventory`);
  try { return { preview: await inventoryPreviewPage(prisma, identity.id, organizationId, draftId, page), message: "" }; }
  catch (error) { return { preview: undefined, message: failure(error).message }; }
}
