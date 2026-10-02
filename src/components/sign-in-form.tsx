"use client";

import { useActionState } from "react";
import { requestSignIn } from "@/app/auth/actions";

export function SignInForm() {
  const [state, action, pending] = useActionState(requestSignIn, { message: "" });
  return <form action={action} className="purchase-form">
    <label className="wide">Email address<input name="email" type="email" autoComplete="email" maxLength={254} required placeholder="you@example.com" /></label>
    <button className="button button-primary wide" disabled={pending}>{pending ? "Sending…" : "Email me a secure sign-in link"}</button>
    <p className={state.sent ? "flash wide" : "inline-error wide"} role="status" aria-live="polite">{state.message}</p>
  </form>;
}
