"use client";

import Link from "./app-link";
import { usePathname } from "next/navigation";
import { Bell, Building2, LayoutDashboard, Newspaper, Plus, ReceiptText, Settings, ShieldCheck } from "lucide-react";
import { Logo } from "./logo";

const links = [
  ["/", "Dashboard", LayoutDashboard],
  ["/purchases", "Purchases", ReceiptText],
  ["/alerts", "Safety alerts", Bell],
  ["/notices", "Latest recalls", Newspaper],
  ["/add", "Add purchase", Plus],
  ["/settings", "Settings", Settings],
] as const;

export function Nav() {
  const pathname = usePathname();
  const business = pathname.startsWith("/business");
  return <aside className="sidebar">
    <Link href="/" aria-label="SafeKeep home"><Logo /></Link>
    <p className="nav-section-label">{business ? "Business workspace" : "Household workspace"}</p>
    <nav aria-label="Main navigation">{!business && links.map(([href, label, Icon]) => <Link key={href} href={href} aria-label={label} aria-current={pathname === href ? "page" : undefined}><Icon size={18} aria-hidden="true" /><span>{label}</span></Link>)}<Link href="/business" aria-current={business ? "page" : undefined}><Building2 size={18} aria-hidden="true" /><span>{business ? "Your businesses" : "Switch to business"}</span></Link>{business && <><Link href="/notices"><Newspaper size={18} aria-hidden="true" /><span>Public recalls</span></Link><Link href="/"><LayoutDashboard size={18} aria-hidden="true" /><span>Switch to household</span></Link></>}</nav>
    <div className="privacy-note"><ShieldCheck size={17} /><div><strong>Private by design</strong><p>{business ? "Business teams and locations stay separate from household purchases." : "Receipt images stay in your browser. Your ledger belongs to your household."}</p></div></div>
  </aside>;
}
