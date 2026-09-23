import Link from "next/link";
import { Bell, LayoutDashboard, Newspaper, Plus, ReceiptText, ShieldCheck } from "lucide-react";
import { Logo } from "./logo";

const links = [
  ["/", "Dashboard", LayoutDashboard],
  ["/purchases", "Purchases", ReceiptText],
  ["/alerts", "Safety alerts", Bell],
  ["/notices", "Notices", Newspaper],
  ["/add", "Add / import", Plus],
] as const;

export function Nav() {
  return <aside className="sidebar">
    <Link href="/" aria-label="SafeKeep home"><Logo /></Link>
    <nav>{links.map(([href, label, Icon]) => <Link key={href} href={href}><Icon size={18} /><span>{label}</span></Link>)}</nav>
    <div className="privacy-note"><ShieldCheck size={17} /><div><strong>Private by design</strong><p>Your purchase ledger stays on this device.</p></div></div>
  </aside>;
}
