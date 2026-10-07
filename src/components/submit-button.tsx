"use client";

import { useFormStatus } from "react-dom";
import type { ButtonHTMLAttributes } from "react";
import { LoaderCircle } from "lucide-react";

export function SubmitButton({ children, pendingLabel = "Saving…", disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return <button {...props} type="submit" disabled={disabled || pending} aria-busy={pending}>
    {pending ? <><LoaderCircle size={16} className="spin" aria-hidden="true" />{pendingLabel}</> : children}
  </button>;
}
