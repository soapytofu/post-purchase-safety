"use server";

import { revalidatePath } from "next/cache";
import { requireHousehold } from "@/lib/auth";
import { authClient } from "@/lib/supabase-server";
import { prisma } from "@/lib/prisma";
import { saveEmailPreference, enqueueRecallEmails, unsubscribeEmailAlerts } from "@/lib/email-notifications";
import { notificationDeliveryConfigured } from "@/lib/email-config";

export async function updateEmailAlerts(_previous: { message: string }, form: FormData) {
  const scope = await requireHousehold();
  if (scope.local || !scope.userId) return { message: "Sign in with a verified account to use email alerts." };
  const { data: { user }, error } = await (await authClient()).auth.getUser();
  if (error || user?.id !== scope.userId || !user.email || !user.email_confirmed_at) return { message: "Verify your account email before enabling notifications." };
  const enabled = form.get("enabled") === "on";
  await saveEmailPreference(prisma, user.id, user.email, enabled);
  if (enabled) await enqueueRecallEmails(prisma, scope.householdId);
  revalidatePath("/settings");
  return { message: enabled ? notificationDeliveryConfigured() ? "Preference saved. Eligible unreviewed live matches will be emailed during scheduled processing." : "Preference saved. Emails will start only after the operator configures delivery. Existing unreviewed medium/high-confidence live matches are eligible." : "Email alerts turned off. Pending emails are canceled." };
}

export async function unsubscribeFromEmail(_previous: { message: string }, form: FormData) {
  await unsubscribeEmailAlerts(String(form.get("token") ?? ""));
  return { message: "If this link was valid, email alerts are now turned off. You can change your preferences in Settings." };
}
