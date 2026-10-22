import { notFound } from "next/navigation";
import Link from "@/components/app-link";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { requireBusinessAccount } from "@/lib/auth";
import { BusinessAccessError } from "@/lib/business-data";
import { caseStatuses, listBusinessCases, type StockEvidence } from "@/lib/business-cases";
import type { NoticeSnapshot } from "@/lib/notice-history";
import { prisma } from "@/lib/prisma";

const labels = { NEEDS_REVIEW: "Needs review", CONFIRMED_AFFECTED: "Confirmed affected", NOT_AFFECTED: "Not affected" };
export default async function BusinessCases({ params, searchParams }: { params: Promise<{ organizationId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { organizationId } = await params, raw = await searchParams;
  const value = (key: string) => typeof raw[key] === "string" ? raw[key] : "";
  const base = `/business/${organizationId}/cases`;
  const identity = await requireBusinessAccount(base);
  let result;
  try { result = await listBusinessCases(prisma, identity.id, organizationId, { status: value("status"), locationId: value("location"), page: Number(value("page") || 1) }); }
  catch (error) { if (error instanceof BusinessAccessError) notFound(); throw error; }
  const href = (page: number) => `${base}?${new URLSearchParams({ status: value("status"), location: value("location"), page: String(page) })}`;
  return <div className="page business-cases"><PageHeader eyebrow={`${result.organization.name} · ${result.membership.role.toLowerCase()}`} title="Saved recall cases" description="A lasting record of stock, notice evidence and your team’s reviews. A saved candidate is not a confirmed recall match." action={<Link href={`/business/${organizationId}/recalls`}>Find recall candidates</Link>} />
    <nav className="case-links" aria-label="Business workspace"><Link href={`/business/${organizationId}`}>Workspace</Link><Link href={`/business/${organizationId}/inventory`}>Inventory</Link><Link href={`/business/${organizationId}/recalls`}>Recall inbox</Link></nav>
    <form action={base} className="toolbar business-recall-filters"><label>Review status<select name="status" defaultValue={value("status")}><option value="">All decisions</option>{caseStatuses.map(status => <option key={status} value={status}>{labels[status]}</option>)}</select></label><label>Store location<select name="location" defaultValue={value("location")}><option value="">All stores, including archived</option>{result.locations.map(location => <option key={location.id} value={location.id}>{location.name} · {location.code}{location.archivedAt ? " (archived)" : ""}</option>)}</select></label><SubmitButton className="button button-secondary" pendingLabel="Filtering…">Apply filters</SubmitButton></form>
    <p>{result.total} saved case{result.total === 1 ? "" : "s"} · Page {result.page} of {result.pages}</p>
    <section className="business-recall-list" aria-label="Saved cases">{result.cases.map(item => {
      const observation = item.observations[0];
      const stock = JSON.parse(observation.stockEvidence) as StockEvidence, notice = JSON.parse(observation.noticeRevision.payload) as NoticeSnapshot;
      const changed = observation.noticeRevision.number < item.noticeHistory.revisionCount;
      return <article className="business-recall-card" key={item.id}><div className="business-recall-card-heading"><span className={`case-status case-${item.status.toLowerCase()}`}>{labels[item.status as keyof typeof labels]}</span><span>{item.location.name} · {item.location.code}{item.location.archivedAt ? " · Archived" : ""}</span></div><h2><Link href={`${base}/${item.id}`}>{stock.productName}</Link></h2><p>{notice.headline}</p><p>{stock.quantityOnHand} units in saved stock · Notice version {observation.noticeRevision.number}{item.affectedQuantity !== null ? ` · ${item.affectedQuantity} confirmed affected` : ""}</p>{changed && <p className="inventory-stale">Notice has changed. Capture and review the latest version.</p>}{item.location.currentSnapshotId !== stock.snapshotId && <p>Historical stock: a newer import may describe a different shelf quantity.</p>}<Link className="button button-secondary" href={`${base}/${item.id}`}>Review case</Link></article>;
    })}{!result.cases.length && <div className="empty-state"><h2>No saved cases in this view</h2><p>Owners and managers can save a candidate from the recall inbox. Cases remain here when stock changes or a notice leaves the current catalog.</p><Link className="button button-primary" href={`/business/${organizationId}/recalls`}>Open recall inbox</Link>{(value("status") || value("location")) && <Link href={base}>Clear filters</Link>}</div>}</section>
    {result.pages > 1 && <nav className="pagination" aria-label="Saved case pages">{result.page > 1 && <Link href={href(result.page - 1)}>Previous</Link>}<span>{result.page} / {result.pages}</span>{result.page < result.pages && <Link href={href(result.page + 1)}>Next</Link>}</nav>}
  </div>;
}
