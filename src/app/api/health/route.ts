import { prisma } from "@/lib/prisma";
import { sourceHealth } from "@/lib/source-health";

export const runtime = "nodejs";

export async function GET() {
  const states = await prisma.syncState.findMany({ where: { provider: { not: "demo-fixtures" } }, orderBy: { provider: "asc" } });
  const { healthy, sources } = sourceHealth(states);
  return Response.json({ status: healthy ? "healthy" : "degraded", checkedAt: new Date().toISOString(), sources }, { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
