import { isAuthorizedSyncRequest } from "@/lib/sync-auth";
import { syncAllLiveProviders } from "@/lib/live-providers";
import { dispatchRecallEmails } from "@/lib/email-notifications";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!process.env.SYNC_SECRET) return Response.json({ error: "Automated sync is not configured" }, { status: 503 });
  if (!isAuthorizedSyncRequest(request.headers.get("authorization"))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const startedAt = new Date().toISOString();
  const results = await syncAllLiveProviders();
  const notifications = await dispatchRecallEmails();
  const failed = results.filter((result) => result.status === "failed").length;
  return Response.json({ startedAt, completedAt: new Date().toISOString(), results, notifications }, { status: failed || notifications.failed ? 207 : 200, headers: { "Cache-Control": "no-store" } });
}
