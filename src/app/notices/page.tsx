import Link from "next/link";
import { AlertTriangle, ChevronLeft, ChevronRight, ExternalLink, Search } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SyncButton } from "@/components/sync-button";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 30;
const date = (value: Date) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(value);

function sourceWhere(source: string) {
  if (source === "fda") return { sourceAuthority: { contains: "FDA" }, isFixture: false } as const;
  if (source === "cpsc") return { sourceAuthority: "CPSC", isFixture: false } as const;
  if (source === "demo") return { isFixture: true } as const;
  return {};
}

function href(params: { q: string; source: string; page: number }) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.source !== "all") query.set("source", params.source);
  if (params.page > 1) query.set("page", String(params.page));
  return `/notices${query.size ? `?${query}` : ""}`;
}

export default async function Notices({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const source = ["all", "fda", "cpsc", "demo"].includes(params.source ?? "") ? params.source! : "all";
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const where = {
    AND: [
      sourceWhere(source),
      q ? { OR: [{ headline: { contains: q } }, { productName: { contains: q } }, { brand: { contains: q } }, { description: { contains: q } }] } : {},
    ],
  };
  const [notices, total, syncStates] = await Promise.all([
    prisma.recall.findMany({ where, orderBy: [{ recallDate: "desc" }, { createdAt: "desc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.recall.count({ where }),
    prisma.syncState.findMany({ orderBy: { provider: "asc" } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return <div className="page">
    <PageHeader eyebrow="Authoritative notice library" title="Food and product notices" description="Browse the records SafeKeep has synchronized. A notice appearing here does not mean an item you own is affected—compare identifiers and follow the primary source." action={<SyncButton />} />
    <section className="coverage-grid" aria-label="Source coverage">
      {syncStates.filter((state) => state.provider !== "demo-fixtures").map((state) => { const lastSuccess = state.lastSuccessAt ?? (state.syncedAt.getTime() > 0 ? state.syncedAt : null); return <article key={state.id} className={state.status === "FAILED" ? "coverage-failed" : ""}><div><strong>{state.provider === "openfda-food-enforcement" ? "FDA food enforcement" : state.provider === "cpsc-recalls" ? "CPSC consumer products" : state.provider}</strong><span>{state.status === "FAILED" ? "Last refresh failed; prior records retained" : `${state.recordCount} records in latest successful sync`}</span></div><time>{lastSuccess ? `Current as of ${date(lastSuccess)}` : "Never successfully synced"}</time></article>; })}
      {!syncStates.some((state) => state.provider !== "demo-fixtures") && <article><div><strong>No live sources synchronized yet</strong><span>Use the sync controls to load FDA food or CPSC product notices.</span></div><time>Coverage not established</time></article>}
    </section>
    <form className="toolbar notice-toolbar"><label className="search"><Search size={17} /><input name="q" defaultValue={q} placeholder="Search notices, products, or brands" /></label><select name="source" defaultValue={source}><option value="all">All sources</option><option value="fda">FDA food</option><option value="cpsc">CPSC products</option><option value="demo">Demo notices</option></select><button className="button button-secondary">Apply</button></form>
    <div className="notice-summary"><strong>{total.toLocaleString()} notice{total === 1 ? "" : "s"}</strong><span>Page {Math.min(page, pages)} of {pages}</span></div>
    <section className="notice-catalog">
      {notices.map((notice) => <article className="notice-card" key={notice.id}><div className="notice-card-meta"><span className={`source-pill ${notice.isFixture ? "source-demo" : ""}`}>{notice.isFixture ? "Demo" : notice.sourceAuthority}</span><time>{date(notice.recallDate)}</time></div><h2>{notice.headline}</h2><p>{notice.description}</p><dl><div><dt>Product</dt><dd>{notice.productName}</dd></div><div><dt>Brand / firm</dt><dd>{notice.brand || "Not specified"}</dd></div><div><dt>Category</dt><dd>{notice.category}</dd></div><div><dt>Hazard / class</dt><dd>{notice.severity || "Not specified"}</dd></div></dl><div className="notice-action"><div><AlertTriangle size={16} /><span>{notice.recommendedAction}</span></div><a href={notice.sourceUrl} target="_blank" rel="noreferrer">Primary source <ExternalLink size={14} /></a></div></article>)}
      {!notices.length && <div className="empty-state"><AlertTriangle />No notices match these filters.</div>}
    </section>
    {pages > 1 && <nav className="pagination" aria-label="Notice pages"><Link aria-disabled={page <= 1} className={page <= 1 ? "disabled" : ""} href={href({ q, source, page: Math.max(1, page - 1) })}><ChevronLeft size={15} />Previous</Link><span>{page} / {pages}</span><Link aria-disabled={page >= pages} className={page >= pages ? "disabled" : ""} href={href({ q, source, page: Math.min(pages, page + 1) })}>Next<ChevronRight size={15} /></Link></nav>}
  </div>;
}
