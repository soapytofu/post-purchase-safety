"use client";

import { useActionState } from "react";
import { updateEmailAlerts, unsubscribeFromEmail } from "@/app/notifications/actions";

export function EmailPreferences({ enabled, email, deliveryReady }: { enabled: boolean; email: string | null; deliveryReady: boolean }) {
  const [state, action, pending] = useActionState(updateEmailAlerts, { message: "" });
  return <form action={action} className="email-preferences">
    <label className="email-opt-in"><input type="checkbox" name="enabled" defaultChecked={enabled} /><span><strong>Email me relevant recall alerts</strong><span>New and existing unreviewed medium- or high-confidence matches to my household’s food and product purchases. No marketing or demo alerts.</span></span></label>
    <p>{enabled && email ? `Destination: ${email}` : "Uses your verified sign-in email, never an address supplied by another household."}</p>
    <p className={deliveryReady ? "flash" : "coverage-warning"}>{deliveryReady ? "Email service configured. Queued alerts are sent during scheduled processing." : "Email delivery is not connected yet. You can save your preference, but no emails will be sent."}</p>
    <p>Review the official notice before taking action. Emails may be delayed or fail; keep checking your safety inbox. You can turn this off anytime.</p>
    <button className="button button-primary" disabled={pending}>{pending ? "Saving…" : "Save email preference"}</button>
    {state.message && <p className="flash" role="status">{state.message}</p>}
  </form>;
}

export function EmailUnsubscribe({ token }: { token: string }) {
  const [state, action, pending] = useActionState(unsubscribeFromEmail, { message: "" });
  return <form action={action}><input type="hidden" name="token" value={token} /><button className="button button-primary" disabled={pending || Boolean(state.message)}>{pending ? "Updating…" : "Turn off email alerts"}</button>{state.message && <p className="flash" role="status">{state.message}</p>}</form>;
}
