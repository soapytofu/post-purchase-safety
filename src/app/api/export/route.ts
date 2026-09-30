import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const purchases = await prisma.purchase.findMany({ orderBy: { createdAt: "asc" }, include: { matches: { orderBy: { createdAt: "asc" }, include: { recall: { select: { externalId: true, sourceAuthority: true, headline: true, sourceUrl: true, recallDate: true } } } } } });
  const exportedAt = new Date();
  return new Response(JSON.stringify({ format: "safekeep-export", version: 1, exportedAt: exportedAt.toISOString(), purchases }, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="safekeep-export-${exportedAt.toISOString().slice(0, 10)}.json"`, "Cache-Control": "no-store" } });
}
