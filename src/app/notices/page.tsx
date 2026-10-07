import Link from "@/components/app-link";
import { SearchForm } from "@/components/search-form";
import { searchHistoryKey } from "@/lib/search-history";
import { SubmitButton } from "@/components/submit-button";
import { MobileRecallFilter } from "@/components/mobile-recall-filter";
import { AlertTriangle, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/prisma";
import { broadCategoryFor, categoryWhere, noticeCategories } from "@/lib/notice-category";
import { recallDateFilter } from "@/lib/recent-recalls";
import { sourceHealth } from "@/lib/source-health";

const PAGE_SIZE = 12;
const date = (value: Date) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(value);

function sourceWhere(source: string) {
  if (source === "fda") return { sourceAuthority: { contains: "FDA" }, isFixture: false } as const;
  if (source === "cpsc") return { sourceAuthority: "CPSC", isFixture: false } as const;
  if (source === "fsis") return { sourceAuthority: "USDA FSIS", isFixture: false } as const;
  if (source === "demo") return { isFixture: true } as const;
  return { isFixture: false };
}

function href(params: { q: string; source: string; category: string; page: number; period?: string }) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.source !== "all") query.set("source", params.source);
  if (params.category !== "all") query.set("category", params.category);
  if (params.page > 1) query.set("page", String(params.page));
  if (params.period && params.period !== "30") query.set("period", params.period);
  return `/notices${query.size ? `?${query}` : ""}`;
}

export default async function Notices({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const period = ["7", "30", "90", "all"].includes(params.period ?? "") ? params.period! : "30";
  const source = ["all", "fda", "fsis", "cpsc", "demo"].includes(params.source ?? "") ? params.source! : "all";
  const category = ["all", ...noticeCategories.map((item) => item.id)].includes(params.category ?? "") ? params.category! : "all";
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const where = {
    AND: [
      sourceWhere(source),
      categoryWhere(category),
      recallDateFilter(period),
      q ? { OR: [{ headline: { contains: q } }, { productName: { contains: q } }, { brand: { contains: q } }, { description: { contains: q } }] } : {},
    ],
  };
  const [notices, total, syncStates] = await Promise.all([
    prisma.recall.findMany({ where, orderBy: [{ recallDate: "desc" }, { createdAt: "desc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.recall.count({ where }),
    prisma.syncState.findMany({ orderBy: { provider: "asc" } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const fda = sourceHealth(syncStates).sources.find(item => item.provider === "openfda-food-enforcement")!;
  const foodUnavailable = (category === "food" || source === "fda") && (fda.status !== "SUCCEEDED" || fda.stale);

  return <div className="page">
    <PageHeader eyebrow="Public recall library" title="Latest recalls" description="Browse food and product recalls before you buy. Compare your exact item with the official notice." />
    {!sourceHealth(syncStates).healthy && <p className="coverage-warning">Coverage is incomplete or out of date. We cannot guarantee every recent recall appears here; check the issuing authority before making a safety decision.</p>}
    <details className="coverage-details"><summary>Source coverage and refresh details</summary>
    <section className="coverage-grid" aria-label="Source coverage">
      {syncStates.filter((state) => state.provider !== "demo-fixtures").map((state) => { const lastSuccess = state.lastSuccessAt ?? (state.syncedAt.getTime() > 0 ? state.syncedAt : null); const label = state.provider === "openfda-food-enforcement" ? "FDA food enforcement" : state.provider === "usda-fsis-recalls" ? "USDA meat, poultry & eggs" : state.provider === "cpsc-recalls" ? "CPSC consumer products" : state.provider; return <article key={state.id} className={state.status === "FAILED" ? "coverage-failed" : state.status === "PARTIAL" ? "coverage-partial" : ""}><div><strong>{label}</strong><span>{state.status === "FAILED" ? "Last refresh failed; prior records retained" : state.status === "PARTIAL" ? `${state.recordCount} recent record${state.recordCount === 1 ? "" : "s"} from fallback feed; full snapshot retained` : `${state.recordCount} records in latest successful sync`}</span>{state.errorMessage && <small>{state.errorMessage}</small>}</div><time>{lastSuccess ? `${state.status === "PARTIAL" ? "Observed" : "Last refreshed"} as of ${date(lastSuccess)}` : "Never successfully synced"}</time></article>; })}
      {!syncStates.some((state) => state.provider !== "demo-fixtures") && <article><div><strong>No live sources synchronized yet</strong><span>Source refresh has not yet loaded public notices.</span></div><time>Coverage not established</time></article>}
    </section></details>
    <nav className="browse-categories" aria-label="Browse notices by category"><Link className={category === "all" ? "active" : ""} aria-current={category === "all" ? "page" : undefined} href={href({ q, source, category: "all", page: 1, period })}>All categories</Link>{noticeCategories.map((item) => <Link className={category === item.id ? "active" : ""} aria-current={category === item.id ? "page" : undefined} title={item.description} href={href({ q, source, category: item.id, page: 1, period })} key={item.id}>{item.label}</Link>)}</nav>
    <nav className="filter-pills" aria-label="Recall date range">{[["7", "Past week"], ["30", "Past month"], ["90", "Past 3 months"], ["all", "All dates"]].map(([value, label]) => <Link key={value} href={href({ q, source, category, page: 1, period: value })} className={period === value ? "active" : ""} aria-current={period === value ? "page" : undefined}>{label}</Link>)}</nav>
    <MobileRecallFilter category={category} source={source} period={period} q={q} />
    <SearchForm key={`${q}:${category}:${source}:${period}`} action="/notices" className="toolbar notice-toolbar" historyKey={searchHistoryKey("recalls")} defaultQuery={q} label="Search recalls" placeholder="Search products, brands or notices"><input type="hidden" name="period" value={period} /><input type="hidden" name="category" value={category} /><select name="source" aria-label="Recall authority" defaultValue={source}><option value="all">All live sources</option><option value="fda">FDA food</option><option value="fsis">USDA meat, poultry & eggs</option><option value="cpsc">CPSC products</option><option value="demo">Demo notices</option></select><SubmitButton className="button button-secondary" pendingLabel="Searching…">Search</SubmitButton></SearchForm>
    <div className="notice-summary"><strong>{total.toLocaleString()} notice{total === 1 ? "" : "s"}</strong><span>Page {Math.min(page, pages)} of {pages}</span></div>
    <section className="notice-catalog">
      {notices.map((notice) => <article className="notice-card" key={notice.id}><div className="notice-card-meta"><span className={`source-pill ${notice.isFixture ? "source-demo" : ""}`}>{notice.isFixture ? "Demo" : notice.sourceAuthority}</span><time>{date(notice.recallDate)}</time><a className="official-notice-link" href={notice.sourceUrl} target="_blank" rel="noreferrer">Official notice <ExternalLink size={14} /></a></div><h2>{notice.headline}</h2><p>{notice.description}</p><dl><div><dt>Product</dt><dd>{notice.productName}</dd></div><div><dt>Brand / firm</dt><dd>{notice.brand || "Not specified"}</dd></div><div><dt>Category</dt><dd>{broadCategoryFor(notice)}</dd></div><div><dt>Hazard / class</dt><dd>{notice.severity || "Not specified"}</dd></div></dl><div className="notice-action"><div><AlertTriangle size={16} /><span>{notice.recommendedAction}</span></div></div></article>)}
      {!notices.length && <div className="empty-state"><AlertTriangle /><h2>No matching notices in available data</h2><p>{foodUnavailable ? "FDA food coverage is currently incomplete or unavailable. Zero results do not mean there are no food recalls." : "Try a broader date range or clear your search. Missing results do not mean a product is safe."}</p><div className="empty-actions"><Link className="button button-secondary" href="/notices?period=all">Reset filters · all dates</Link>{(category === "food" || source === "fda") && <a className="button button-secondary" href="https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts" target="_blank" rel="noreferrer">Check FDA notices <ExternalLink size={14} /></a>}</div></div>}
    </section>
    {pages > 1 && <nav className="pagination" aria-label="Notice pages"><Link aria-disabled={page <= 1} className={page <= 1 ? "disabled" : ""} href={href({ q, source, category, page: Math.max(1, page - 1), period })}><ChevronLeft size={15} />Previous</Link><span>{page} / {pages}</span><Link aria-disabled={page >= pages} className={page >= pages ? "disabled" : ""} href={href({ q, source, category, page: Math.min(pages, page + 1), period })}>Next<ChevronRight size={15} /></Link></nav>}
  </div>;
}
