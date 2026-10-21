"use client";

import { useEffect, useRef } from "react";
import { acceptInvite } from "@/app/business/actions";
import { BusinessForm } from "./business-form";

export function BusinessJoinForm() {
  const tokenInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const fragment = window.location.hash.slice(1);
    if (/^[a-f0-9]{64}$/.test(fragment) && tokenInput.current) { tokenInput.current.value = fragment; tokenInput.current.defaultValue = fragment; }
    // The fragment is not sent in HTTP requests or Referer headers. Remove it
    // from browser history after reading; acceptance still requires a POST.
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  return <BusinessForm action={acceptInvite} label="Accept invitation" pendingLabel="Checking invitation…"><label>Invitation code<input ref={tokenInput} name="token" pattern="[a-f0-9]{64}" required autoComplete="off" spellCheck={false} /></label><p>Accepting shares your verified email with this business’s owner. It does not share your household or purchases.</p></BusinessForm>;
}
