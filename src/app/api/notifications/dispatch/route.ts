import { isAuthorizedSyncRequest } from "@/lib/sync-auth";
import { dispatchRecallEmails, enqueueRecallEmails } from "@/lib/email-notifications";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!isAuthorizedSyncRequest(request.headers.get("authorization"))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await enqueueRecallEmails();
  const result = await dispatchRecallEmails();
  return Response.json(result, { status: !result.configured ? 503 : result.failed ? 207 : 200, headers: { "Cache-Control": "no-store" } });
}
