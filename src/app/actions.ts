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

const purchaseSchema = z.object({
  productName: z.string().trim().min(1), brand: z.string().trim().min(1), category: z.string().trim().min(1),
  retailer: z.string().trim().min(1), purchaseDate: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
  upc: z.string().trim().optional(), lotNumber: z.string().trim().optional(),
});

export async function addPurchase(formData: FormData) {
  const parsed = purchaseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/add?error=Please%20complete%20all%20required%20fields");
  await prisma.purchase.create({ data: { ...parsed.data, purchaseDate: new Date(`${parsed.data.purchaseDate}T12:00:00.000Z`), upc: parsed.data.upc || null, lotNumber: parsed.data.lotNumber || null, source: PurchaseSource.MANUAL } });
  await regenerateMatches();
  revalidatePath("/"); revalidatePath("/purchases"); revalidatePath("/alerts");
  redirect("/purchases?added=1");
}

export async function importPurchases(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) redirect("/add?error=Choose%20a%20CSV%20file");
  const result = parsePurchaseCsv(await file.text());
  if (result.errors.length) redirect(`/add?error=${encodeURIComponent(result.errors[0])}`);
  await prisma.purchase.createMany({ data: result.rows.map((row) => ({ productName: row.product_name, brand: row.brand, category: row.category, retailer: row.retailer, purchaseDate: new Date(`${row.purchase_date}T12:00:00.000Z`), upc: row.upc || null, lotNumber: row.lot_number || null, source: PurchaseSource.CSV })) });
  await regenerateMatches();
  revalidatePath("/"); revalidatePath("/purchases"); revalidatePath("/alerts");
  redirect(`/purchases?imported=${result.rows.length}`);
}

export async function updateMatchStatus(formData: FormData) {
  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  if (!Object.values(MatchStatus).includes(status as MatchStatus)) return;
  await prisma.recallMatch.update({ where: { id }, data: { status: status as MatchStatus } });
  revalidatePath("/"); revalidatePath("/alerts");
}

export async function syncRecalls(formData: FormData) {
  const source = String(formData.get("source") ?? "live");
  const provider = source === "fixtures" ? new FixtureRecallProvider() : new OpenFdaRecallProvider();
  let count: number;
  try {
    count = await syncRecallProvider(provider);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Live sync failed";
    redirect(`/?sync=error&message=${encodeURIComponent(message)}`);
  }
  revalidatePath("/"); revalidatePath("/purchases"); revalidatePath("/alerts");
  redirect(`/?sync=${source}&count=${count}`);
}
