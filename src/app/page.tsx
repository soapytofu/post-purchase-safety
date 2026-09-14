import Link from "next/link";
import { ArrowRight, BellRing, CheckCircle2, Clock3, Database, PackageCheck, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { ConfidenceBadge } from "@/components/confidence-badge";
import { SyncButton } from "@/components/sync-button";

const date = (value: Date) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(value);

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const [purchaseCount, alertCount, highCount, recent, sync, matches] = await Promise.all([
    prisma.purchase.count(), prisma.recallMatch.count({ where: { status: { not: "DISMISSED" } } }), prisma.recallMatch.count({ where: { confidence: "HIGH", status: { not: "DISMISSED" } } }),
    prisma.purchase.findMany({ take: 4, orderBy: { createdAt: "desc" }, include: { matches: { select: { confidence: true } } } }), prisma.syncState.findFirst({ orderBy: { syncedAt: "desc" } }),
    prisma.recallMatch.findMany({ take: 3, where: { status: "UNREVIEWED" }, orderBy: [{ confidence: "asc" }, { createdAt: "desc" }], include: { purchase: true, recall: true } }),
  ]);
  return <div className="page">
    <PageHeader eyebrow="Local safety network" title="Good morning. Your shelf, checked." description="SafeKeep connects what you bought with safety notices that may matter—without sending your purchase history anywhere." action={<Link className="button button-primary" href="/add"><Plus size={16} />Add purchase</Link>} />
    {params.sync === "live" && <div className="flash">Live FDA sync complete: {params.count} ongoing food enforcement records loaded and checked.</div>}
    {params.sync === "fixtures" && <div className="flash">Demo fixtures reloaded and checked.</div>}
    {params.sync === "error" && <div className="inline-error">Live sync could not finish: {params.message}. Your existing local notices were not removed.</div>}
    <section className="trust-strip"><CheckCircle2 size={18} /><span><strong>Live and demo sources stay distinct.</strong> Matches are inferences, not safety determinations. Always verify the issuing authority.</span><SyncButton /></section>
    <section className="metrics">
      <article><span className="metric-icon sage"><PackageCheck size={20} /></span><p>Tracked purchases</p><strong>{purchaseCount}</strong><Link href="/purchases">View ledger <ArrowRight size={14} /></Link></article>
      <article><span className="metric-icon amber"><BellRing size={20} /></span><p>Potential matches</p><strong>{alertCount}</strong><Link href="/alerts">Open inbox <ArrowRight size={14} /></Link></article>
      <article><span className="metric-icon coral"><BellRing size={20} /></span><p>High confidence</p><strong>{highCount}</strong><span className="metric-caption">Check these first</span></article>
      <article><span className="metric-icon blue"><Database size={20} /></span><p>Most recent sync</p><strong className="metric-date">{sync ? date(sync.syncedAt) : "Not yet"}</strong><span className="metric-caption">{sync?.recordCount ?? 0} records · {sync?.provider ?? "No provider"}</span></article>
    </section>
    <div className="dashboard-grid">
      <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Needs attention</p><h2>Safety inbox</h2></div><Link href="/alerts">View all <ArrowRight size={15} /></Link></div>
        <div className="alert-list">{matches.length ? matches.map((match) => <Link href={`/alerts#${match.id}`} className="alert-row" key={match.id}><span className={`status-dot dot-${match.confidence.toLowerCase()}`} /><div><strong>{match.purchase.productName}</strong><span>{match.recall.headline}</span></div><ConfidenceBadge confidence={match.confidence} /><ArrowRight size={16} /></Link>) : <div className="empty-state"><CheckCircle2 />No unreviewed matches right now.</div>}</div>
      </section>
      <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Your ledger</p><h2>Recently tracked</h2></div><Link href="/purchases">View all <ArrowRight size={15} /></Link></div>
        <div className="purchase-list">{recent.map((purchase) => <div key={purchase.id}><span className="product-avatar">{purchase.productName.charAt(0)}</span><div><strong>{purchase.productName}</strong><span>{purchase.retailer} · {date(purchase.purchaseDate)}</span></div><span className={purchase.matches.length ? "recall-state attention" : "recall-state clear"}>{purchase.matches.length ? `${purchase.matches.length} match${purchase.matches.length > 1 ? "es" : ""}` : "No match"}</span></div>)}</div>
      </section>
    </div>
    <section className="how-it-works"><div><p className="eyebrow">A quieter kind of safety tool</p><h2>From receipt to relevant notice</h2><p>Clear evidence at every step, with your data kept close.</p></div>{[["01", "Record", "Add a purchase manually or import a simple CSV."], ["02", "Compare", "Deterministic matching checks identifiers, names, lots, and dates."], ["03", "Decide", "See confidence and source details, then record what you did."]].map(([number, title, copy]) => <article key={number}><span>{number}</span><div><h3>{title}</h3><p>{copy}</p></div></article>)}</section>
    <footer className="sync-foot"><Clock3 size={14} /> Last checked {sync ? date(sync.syncedAt) : "never"} · {sync?.provider ?? "No provider"}</footer>
  </div>;
}
