"use client";

import Link, { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";
import { LoaderCircle } from "lucide-react";

function NavigationHint() {
  const { pending } = useLinkStatus();
  return <span className={`navigation-hint${pending ? " is-pending" : ""}`} role="status">
    {pending && <><LoaderCircle size={14} className="spin" aria-hidden="true" /><span className="visually-hidden">Loading destination…</span></>}
  </span>;
}

export default function AppLink({ children, ...props }: ComponentProps<typeof Link>) {
  return <Link {...props} data-app-link>{children}<NavigationHint /></Link>;
}
