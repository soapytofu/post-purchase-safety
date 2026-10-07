export function notificationDeliveryConfigured() {
  if (process.env.EMAIL_ALERTS_ENABLED !== "true" || !process.env.RESEND_API_KEY || !process.env.EMAIL_FROM || process.env.AUTH_MODE !== "supabase") return false;
  try { return new URL(process.env.APP_URL ?? "").protocol === "https:"; } catch { return false; }
}
