"use client";

import { useActionState, useState } from "react";
import type { ReactNode } from "react";
import type { BusinessFormState } from "@/app/business/actions";

export function BusinessForm({ action, children, label, pendingLabel = "Saving…" }: { action: (previous: BusinessFormState, form: FormData) => Promise<BusinessFormState>; children: ReactNode; label: string; pendingLabel?: string }) {
  const [state, formAction, pending] = useActionState(action, { message: "" });
  const [origin, setOrigin] = useState("");
  return <form action={formAction} onSubmit={() => setOrigin(window.location.origin)} className="business-form">
    <fieldset disabled={pending}>{children}<button className="button button-primary" disabled={pending} type="submit">{pending ? pendingLabel : label}</button></fieldset>
    {state.message && <p role="status" aria-live="polite" className="business-form-status">{state.message}</p>}
    {state.inviteToken && <div className="business-invite-result"><label>Private invitation link<input readOnly value={`${origin}/business/join#${state.inviteToken}`} onFocus={event => event.target.select()} /></label><p>The link only works for the invited email. Treat it as private; it is shown here once. You can revoke it below.</p></div>}
  </form>;
}
