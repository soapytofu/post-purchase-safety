import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const states = await prisma.syncState.findMany({ where: { provider: { not: "demo-fixtures" } }, orderBy: { provider: "asc" } });
  const staleBefore = Date.now() - 48 * 60 * 60 * 1000;
  const sources = states.map((state) => ({ provider: state.provider, status: state.status, recordCount: state.recordCount, lastAttemptAt: state.lastAttemptAt, lastSuccessAt: state.lastSuccessAt, stale: !state.lastSuccessAt || state.lastSuccessAt.getTime() < staleBefore }));
  const healthy = states.length >= 3 && sources.every((source) => source.status !== "FAILED" && !source.stale);
  return Response.json({ status: healthy ? "healthy" : "degraded", checkedAt: new Date().toISOString(), sources }, { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
