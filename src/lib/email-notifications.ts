import { createHash, randomBytes } from "node:crypto";
import type { Prisma, PrismaClient, AppUser } from "@prisma/client";
import { prisma } from "./prisma";
import { buildRecallEmail, EmailSendError, sendRecallEmail } from "./recall-email";
import { notificationDeliveryConfigured } from "./email-config";

type QueueClient = Pick<Prisma.TransactionClient, "appUser" | "recallMatch" | "emailNotification">;
const liveMatch = { confidence: { in: ["HIGH", "MEDIUM"] }, status: "UNREVIEWED", recall: { isFixture: false } } satisfies Prisma.RecallMatchWhereInput;

export function notificationKey(userId: string, purchaseId: string, authority: string, externalId: string) {
  return createHash("sha256").update(JSON.stringify([userId, purchaseId, authority, externalId])).digest("hex");
}

export async function enqueueRecallEmails(client: QueueClient = prisma, householdId?: string | null) {
  if (householdId === null) return 0; // Local pilot purchases never generate account emails.
  const users = await client.appUser.findMany({ where: { emailAlertsEnabled: true, notificationEmail: { not: null }, membership: householdId ? { householdId } : { isNot: null } }, include: { membership: true } });
  let queued = 0;
  for (const user of users) {
    if (!user.membership || !user.unsubscribeToken) continue;
    let cursor: string | undefined;
    while (true) {
      const matches = await client.recallMatch.findMany({ where: { ...liveMatch, purchase: { householdId: user.membership.householdId } }, include: { recall: true }, orderBy: { id: "asc" }, take: 200, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
      for (const match of matches) {
        const dedupeKey = notificationKey(user.id, match.purchaseId, match.recall.sourceAuthority, match.recall.externalId);
        const existing = await client.emailNotification.findUnique({ where: { dedupeKey }, select: { id: true } });
        if (existing) continue;
        await client.emailNotification.upsert({ where: { dedupeKey }, create: { dedupeKey, userId: user.id, matchId: match.id }, update: {} });
        queued++;
      }
      if (matches.length < 200) break;
      cursor = matches[matches.length - 1].id;
    }
  }
  return queued;
}

export async function saveEmailPreference(client: Pick<PrismaClient, "appUser" | "emailNotification" | "$transaction">, userId: string, verifiedEmail: string, enabled: boolean) {
  return client.$transaction(async tx => {
    const current = await tx.appUser.findUniqueOrThrow({ where: { id: userId } });
    await tx.appUser.update({ where: { id: userId }, data: {
      emailAlertsEnabled: enabled, notificationEmail: enabled ? verifiedEmail : null,
      emailAlertsConsentedAt: enabled ? new Date() : null,
      unsubscribeToken: enabled ? current.unsubscribeToken ?? randomBytes(32).toString("hex") : current.unsubscribeToken,
    } });
    if (!enabled) await tx.emailNotification.updateMany({ where: { userId, status: { in: ["PENDING", "PROCESSING"] } }, data: { status: "CANCELED", lockedAt: null } });
  });
}

export async function unsubscribeEmailAlerts(token: string, client: PrismaClient = prisma) {
  if (!/^[a-f0-9]{64}$/.test(token)) return;
  const user = await client.appUser.findUnique({ where: { unsubscribeToken: token }, select: { id: true } });
  if (!user) return;
  await client.$transaction(async tx => {
    await tx.appUser.update({ where: { id: user.id }, data: { emailAlertsEnabled: false, notificationEmail: null, emailAlertsConsentedAt: null } });
    await tx.emailNotification.updateMany({ where: { userId: user.id, status: { in: ["PENDING", "PROCESSING"] } }, data: { status: "CANCELED", lockedAt: null } });
  });
}

export async function verifyNotificationRecipient(user: AppUser, client: PrismaClient = prisma) {
  if (process.env.AUTH_MODE !== "supabase" || !user.notificationEmail) return false;
  // Recheck the authoritative account before delivery: changed email, deleted or
  // banned accounts must not keep receiving purchase details at an old address.
  const rows = await client.$queryRaw<{ valid: number }[]>`
    SELECT 1 AS valid FROM auth.users
    WHERE id::text = ${user.id} AND email = ${user.notificationEmail}
      AND email_confirmed_at IS NOT NULL AND deleted_at IS NULL
      AND (banned_until IS NULL OR banned_until <= CURRENT_TIMESTAMP)
  `;
  return rows.length === 1;
}

type Send = typeof sendRecallEmail;
type Verify = (user: AppUser) => Promise<boolean>;

export async function dispatchRecallEmails(client: PrismaClient = prisma, send: Send = sendRecallEmail, verify: Verify = user => verifyNotificationRecipient(user, client), now = new Date()) {
  if (send === sendRecallEmail && !notificationDeliveryConfigured()) return { configured: false, accepted: 0, failed: 0, canceled: 0 };
  const stale = new Date(now.getTime() - 5 * 60_000);
  const eligible = { OR: [{ status: "PENDING", nextAttemptAt: { lte: now } }, { status: "PROCESSING", lockedAt: { lt: stale } }] } satisfies Prisma.EmailNotificationWhereInput;
  const jobs = await client.emailNotification.findMany({ where: eligible, orderBy: { createdAt: "asc" }, take: 10 });
  const result = { configured: true, accepted: 0, failed: 0, canceled: 0 };
  for (const job of jobs) {
    const claim = await client.emailNotification.updateMany({ where: { id: job.id, ...eligible }, data: { status: "PROCESSING", lockedAt: now, attempts: { increment: 1 }, firstAttemptAt: job.firstAttemptAt ?? now } });
    if (!claim.count) continue;
    try {
      const fresh = await client.emailNotification.findUniqueOrThrow({ where: { id: job.id }, include: { user: { include: { membership: true } }, match: { include: { purchase: true, recall: true } } } });
      const { user, match } = fresh;
      if (fresh.status !== "PROCESSING" || !user.emailAlertsEnabled || !user.notificationEmail || !user.unsubscribeToken || !match || match.recall.isFixture || match.status !== "UNREVIEWED" || !["HIGH", "MEDIUM"].includes(match.confidence) || user.membership?.householdId !== match.purchase.householdId || !(await verify(user))) {
        await client.emailNotification.update({ where: { id: job.id }, data: { status: "CANCELED", lockedAt: null } });
        result.canceled++; continue;
      }
      // Resend retains idempotency keys for 24 hours. Never automatically retry
      // uncertain deliveries beyond that window, when a duplicate could result.
      if (fresh.attempts > 5 || now.getTime() - fresh.firstAttemptAt!.getTime() > 20 * 60 * 60_000) throw new EmailSendError(false, "Automatic retry window exhausted; operator review required");
      const content = buildRecallEmail(match, process.env.APP_URL!, user.unsubscribeToken);
      const providerMessageId = await send(user.notificationEmail, content, `recall-${fresh.dedupeKey}`);
      await client.emailNotification.update({ where: { id: job.id }, data: { status: "SENT", sentAt: new Date(), providerMessageId, lockedAt: null, lastError: null } });
      result.accepted++;
    } catch (error) {
      const retryable = !(error instanceof EmailSendError) || error.retryable;
      const attempts = job.attempts + 1;
      const lastError = error instanceof EmailSendError ? error.message : "Delivery could not be confirmed; retry scheduled";
      await client.emailNotification.updateMany({ where: { id: job.id, status: "PROCESSING" }, data: { status: retryable && attempts < 5 ? "PENDING" : "FAILED", nextAttemptAt: new Date(now.getTime() + 2 ** attempts * 60_000), lockedAt: null, lastError } });
      result.failed++;
    }
  }
  return result;
}
