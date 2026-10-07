"use client";

import Link from "./app-link";
import { usePathname } from "next/navigation";
import { Bell, LayoutDashboard, Newspaper, Plus, ReceiptText, Settings, ShieldCheck } from "lucide-react";
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
  return <aside className="sidebar">
    <Link href="/" aria-label="SafeKeep home"><Logo /></Link>
    <p className="nav-section-label">Your workspace</p>
    <nav aria-label="Main navigation">{links.map(([href, label, Icon]) => <Link key={href} href={href} aria-label={label} aria-current={pathname === href ? "page" : undefined}><Icon size={18} aria-hidden="true" /><span>{label}</span></Link>)}</nav>
    <div className="privacy-note"><ShieldCheck size={17} /><div><strong>Private by design</strong><p>Receipt images stay in your browser. Your ledger belongs to your household.</p></div></div>
  </aside>;
}
