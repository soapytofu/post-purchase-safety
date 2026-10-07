import type { RecallMatch, Purchase, Recall } from "@prisma/client";
import { assertTrustedSourceUrl } from "./source-url";

export type EmailContent = { subject: string; text: string; html: string; unsubscribeUrl: string };
const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

export function buildRecallEmail(match: RecallMatch & { purchase: Purchase; recall: Recall }, appUrl: string, unsubscribeToken: string): EmailContent {
  assertTrustedSourceUrl(match.recall.sourceUrl, match.recall.sourceAuthority);
  const inbox = new URL(`/alerts#${match.id}`, appUrl).href;
  const unsubscribeUrl = new URL(`/email-preferences?token=${encodeURIComponent(unsubscribeToken)}`, appUrl).href;
  const lines = [
    "A product in your household may be affected by a recall.",
    `Purchase: ${match.purchase.productName}`,
    `Notice: ${match.recall.headline}`,
    `Authority: ${match.recall.sourceAuthority}`,
    `Match confidence: ${match.confidence.toLowerCase()} (not hazard severity)`,
    "This is an inferred match, not confirmation that your item is affected. Compare the brand, UPC, lot or model with the official notice.",
    `Recommended action: ${match.recall.recommendedAction}`,
    `Official notice: ${match.recall.sourceUrl}`,
    `Review your alert: ${inbox}`,
    `Turn off email alerts: ${unsubscribeUrl}`,
    "Email delivery and recall coverage are not guaranteed. Continue checking official notices.",
  ];
  return { subject: "SafeKeep: a purchase may be affected by a recall", text: lines.join("\n\n"), html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#18342f;max-width:600px"><h1 style="font-size:26px">Check a purchase on your shelf</h1>${lines.slice(0, 7).map(line => `<p>${escape(line)}</p>`).join("")}<p><a href="${escape(match.recall.sourceUrl)}">Read the official recall</a></p><p><a href="${escape(inbox)}">Review your SafeKeep alert</a></p><p><a href="${escape(unsubscribeUrl)}">Turn off email alerts</a></p><p>${escape(lines[10])}</p></div>`, unsubscribeUrl };
}

export class EmailSendError extends Error {
  constructor(public readonly retryable: boolean, message: string) { super(message); }
}

export async function sendRecallEmail(to: string, content: EmailContent, idempotencyKey: string) {
  const unsubscribe = new URL(content.unsubscribeUrl);
  const token = unsubscribe.searchParams.get("token")!;
  const oneClickUrl = new URL(`/api/notifications/unsubscribe?token=${encodeURIComponent(token)}`, unsubscribe.origin).href;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST", signal: AbortSignal.timeout(10_000),
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject: content.subject, text: content.text, html: content.html, headers: { "List-Unsubscribe": `<${oneClickUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } }),
  });
  if (!response.ok) throw new EmailSendError(response.status === 429 || response.status >= 500, `Email service returned HTTP ${response.status}`);
  const result = await response.json() as { id?: unknown };
  if (typeof result.id !== "string") throw new EmailSendError(true, "Email service did not confirm acceptance");
  return result.id;
}
