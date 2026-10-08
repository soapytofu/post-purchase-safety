import Link from "./app-link";
import { ArrowRight, ExternalLink, Newspaper } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { sourceHealth } from "@/lib/source-health";
import { noticeBrand } from "@/lib/notice-brand";

export async function LatestRecalls() {
  const [recalls, states] = await Promise.all([
    prisma.recall.findMany({ where: { isFixture: false }, orderBy: [{ recallDate: "desc" }, { createdAt: "desc" }], take: 3 }),
    prisma.syncState.findMany({ where: { provider: { not: "demo-fixtures" } } }),
  ]);
  const healthy = sourceHealth(states).healthy;
  return <section className="latest-recalls" aria-labelledby="latest-recalls-title">
    <div className="section-heading"><div><p className="eyebrow">Before you shop</p><h2 id="latest-recalls-title">Latest recalls</h2><p>Public notices, whether or not an item is in your household.</p></div><Link className="button button-secondary" href="/notices">Browse all recalls <ArrowRight size={16} /></Link></div>
    {!healthy && <p className="coverage-warning">Source coverage is incomplete or out of date. These are the newest notices in our available data, not a complete safety check.</p>}
    <div className="latest-recall-grid">{recalls.map(recall => <article key={recall.id}><div className="notice-card-meta"><span className="source-pill">{recall.sourceAuthority}</span><time dateTime={recall.recallDate.toISOString()}>{recall.recallDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</time></div><h3>{recall.productName}</h3><p>{noticeBrand(recall)}</p><p className="latest-hazard">{recall.headline}</p><a href={recall.sourceUrl} target="_blank" rel="noreferrer">Check affected items <ExternalLink size={14} /></a></article>)}</div>
    {!recalls.length && <div className="empty-state"><Newspaper /><strong>No live recalls loaded yet</strong><span>The operator needs to connect a scheduled source refresh. No demo records are shown here.</span></div>}
    <p className="recall-caution">Compare the brand, UPC and lot with the official notice before buying or using an item. Absence from this list does not mean a product is safe.</p>
  </section>;
}
