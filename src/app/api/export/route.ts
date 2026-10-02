import { prisma } from "@/lib/prisma";
import { householdSession } from "@/lib/auth";
import { purchaseScope } from "@/lib/household-data";

export const runtime = "nodejs";

export async function GET() {
  const scope = await householdSession();
  if (!scope) return Response.json({ error: "Sign in to export your household data." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const purchases = await prisma.purchase.findMany({ where: purchaseScope(scope), orderBy: { createdAt: "asc" }, include: { matches: { orderBy: { createdAt: "asc" }, include: { recall: { select: { externalId: true, sourceAuthority: true, headline: true, sourceUrl: true, recallDate: true } } } } } });
  const exportedAt = new Date();
  return new Response(JSON.stringify({ format: "safekeep-export", version: 1, exportedAt: exportedAt.toISOString(), purchases }, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="safekeep-export-${exportedAt.toISOString().slice(0, 10)}.json"`, "Cache-Control": "no-store" } });
}
