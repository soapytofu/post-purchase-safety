"use server";

import { MatchStatus, PurchaseSource } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { regenerateMatches } from "@/lib/match-service";
import { parsePurchaseCsv } from "@/lib/csv";
import { syncRecallProvider } from "@/lib/sync-recalls";
import { FixtureRecallProvider } from "@/providers/fixture-recall-provider";
import { OpenFdaRecallProvider } from "@/providers/openfda-recall-provider";
import { CpscRecallProvider } from "@/providers/cpsc-recall-provider";
import { FsisRecallProvider } from "@/providers/fsis-recall-provider";
import { requireHousehold, requireLocalOperator } from "@/lib/auth";
import { purchaseScope, deleteHouseholdPurchases, setHouseholdMatchStatus } from "@/lib/household-data";

const purchaseSchema = z.object({
  productName: z.string().trim().min(1), brand: z.string().trim().min(1), category: z.string().trim().min(1),
  retailer: z.string().trim().min(1), purchaseDate: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
  upc: z.string().trim().optional(), lotNumber: z.string().trim().optional(),
});

const receiptSchema = z.object({
  merchant: z.string().trim().min(1).max(120),
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => !Number.isNaN(Date.parse(`${value}T12:00:00.000Z`))),
  items: z.array(z.object({
    productName: z.string().trim().min(1).max(200),
    brand: z.string().trim().min(1).max(120),
    category: z.string().trim().min(1).max(120),
  })).min(1).max(50),
});

export async function addPurchase(formData: FormData) {
  const scope = await requireHousehold();
  const parsed = purchaseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/add?error=Please%20complete%20all%20required%20fields");
  await prisma.purchase.create({ data: { ...parsed.data, householdId: scope.householdId, purchaseDate: new Date(`${parsed.data.purchaseDate}T12:00:00.000Z`), upc: parsed.data.upc || null, lotNumber: parsed.data.lotNumber || null, source: PurchaseSource.MANUAL } });
  await regenerateMatches(prisma, purchaseScope(scope));
  revalidatePath("/"); revalidatePath("/purchases"); revalidatePath("/alerts");
  redirect("/purchases?added=1");
}

export async function importPurchases(formData: FormData) {
  const scope = await requireHousehold();
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) redirect("/add?error=Choose%20a%20CSV%20file");
  if (file.size > 1_000_000) redirect("/add?error=Choose%20a%20CSV%20smaller%20than%201%20MB");
  const result = parsePurchaseCsv(await file.text());
  if (result.errors.length) redirect(`/add?error=${encodeURIComponent(result.errors[0])}`);
  if (result.rows.length > 500) redirect("/add?error=Import%20up%20to%20500%20items%20per%20file");
  await prisma.purchase.createMany({ data: result.rows.map((row) => ({ householdId: scope.householdId, productName: row.product_name, brand: row.brand, category: row.category, retailer: row.retailer, purchaseDate: new Date(`${row.purchase_date}T12:00:00.000Z`), upc: row.upc || null, lotNumber: row.lot_number || null, source: PurchaseSource.CSV })) });
  await regenerateMatches(prisma, purchaseScope(scope));
  revalidatePath("/"); revalidatePath("/purchases"); revalidatePath("/alerts");
  redirect(`/purchases?imported=${result.rows.length}`);
}

export async function importReceiptPurchases(formData: FormData) {
  const scope = await requireHousehold();
  const value = formData.get("receiptPayload");
  let payload: unknown;
  try { payload = JSON.parse(typeof value === "string" ? value : ""); } catch { redirect("/add?error=The%20receipt%20details%20could%20not%20be%20read"); }
  const parsed = receiptSchema.safeParse(payload);
  if (!parsed.success) redirect("/add?error=Review%20the%20merchant%2C%20date%2C%20and%20selected%20items");
  await prisma.purchase.createMany({ data: parsed.data.items.map((item) => ({
    ...item,
    householdId: scope.householdId,
    retailer: parsed.data.merchant,
    purchaseDate: new Date(`${parsed.data.purchaseDate}T12:00:00.000Z`),
    source: PurchaseSource.RECEIPT,
  })) });
  await regenerateMatches(prisma, purchaseScope(scope));
  revalidatePath("/"); revalidatePath("/purchases"); revalidatePath("/alerts");
  redirect(`/purchases?receipt=${parsed.data.items.length}`);
}

export async function deleteAllPurchases() {
  const scope = await requireHousehold();
  if (scope.role !== "OWNER") throw new Error("Only a household owner can delete purchase history.");
  await deleteHouseholdPurchases(prisma, scope);
  revalidatePath("/"); revalidatePath("/purchases"); revalidatePath("/alerts"); revalidatePath("/settings");
  redirect("/settings?cleared=1");
}

export async function updateMatchStatus(formData: FormData) {
  const scope = await requireHousehold();
  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  if (!Object.values(MatchStatus).includes(status as MatchStatus)) return;
  await setHouseholdMatchStatus(prisma, scope, id, status as MatchStatus);
  revalidatePath("/"); revalidatePath("/alerts");
}

export async function syncRecalls(formData: FormData) {
  await requireLocalOperator();
  const source = String(formData.get("source") ?? "live");
  const provider = source === "fixtures" ? new FixtureRecallProvider() : source === "cpsc" ? new CpscRecallProvider() : source === "fsis" ? new FsisRecallProvider() : new OpenFdaRecallProvider();
  let count: number;
  try {
    count = await syncRecallProvider(provider);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Live sync failed";
    redirect(`/?sync=error&message=${encodeURIComponent(message)}`);
  }
  revalidatePath("/"); revalidatePath("/purchases"); revalidatePath("/alerts"); revalidatePath("/notices");
  redirect(`/?sync=${source}&count=${count}`);
}
