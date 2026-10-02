import Link from "next/link";
import { Bell, LayoutDashboard, Newspaper, Plus, ReceiptText, Settings, ShieldCheck } from "lucide-react";
import { Logo } from "./logo";

const links = [
  ["/", "Dashboard", LayoutDashboard],
  ["/purchases", "Purchases", ReceiptText],
  ["/alerts", "Safety alerts", Bell],
  ["/notices", "Notices", Newspaper],
  ["/add", "Add / import", Plus],
  ["/settings", "Data & settings", Settings],
] as const;

export function Nav() {
  return <aside className="sidebar">
    <Link href="/" aria-label="SafeKeep home"><Logo /></Link>
    <nav>{links.map(([href, label, Icon]) => <Link key={href} href={href}><Icon size={18} /><span>{label}</span></Link>)}</nav>
    <div className="privacy-note"><ShieldCheck size={17} /><div><strong>Private by design</strong><p>Receipt images stay in your browser. Your ledger belongs to your household.</p></div></div>
  </aside>;
}
