import { isAuthorizedSyncRequest } from "@/lib/sync-auth";
import { syncAllLiveProviders } from "@/lib/live-providers";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!process.env.SYNC_SECRET) return Response.json({ error: "Automated sync is not configured" }, { status: 503 });
  if (!isAuthorizedSyncRequest(request.headers.get("authorization"))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const startedAt = new Date().toISOString();
  const results = await syncAllLiveProviders();
  const failed = results.filter((result) => result.status === "failed").length;
  return Response.json({ startedAt, completedAt: new Date().toISOString(), results }, { status: failed ? 207 : 200, headers: { "Cache-Control": "no-store" } });
}
