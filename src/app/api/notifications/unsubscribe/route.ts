import { unsubscribeEmailAlerts } from "@/lib/email-notifications";

export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  await unsubscribeEmailAlerts(token);
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
