import { notFound } from "next/navigation";
import Link from "@/components/app-link";
import { PageHeader } from "@/components/page-header";
import { SearchForm } from "@/components/search-form";
import { SubmitButton } from "@/components/submit-button";
import { requireBusinessAccount } from "@/lib/auth";
import { BusinessAccessError, membershipFor } from "@/lib/business-data";
import { BusinessMatchingError, getBusinessRecallInbox } from "@/lib/business-recalls";
import { isTrustedSourceUrl } from "@/lib/source-url";
import { prisma } from "@/lib/prisma";

const date = (value: Date) => value.toLocaleString("en-US", { timeZone: "UTC" }) + " UTC";
export default async function BusinessRecalls({ params, searchParams }: { params: Promise<{ organizationId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { organizationId } = await params;
  const raw = await searchParams;
  const text = (key: string) => typeof raw[key] === "string" ? raw[key] : "";
  const filters = { locationId: text("location") || undefined, query: text("q"), kind: ["IDENTIFIER", "TEXT"].includes(text("kind")) ? text("kind") : undefined, page: Number(text("page") || 1) };
  const base = `/business/${organizationId}/recalls` as const;
  const identity = await requireBusinessAccount(base);
  let inbox;
  try { inbox = await getBusinessRecallInbox(prisma, identity.id, organizationId, filters); }
  catch (error) {
    if (error instanceof BusinessAccessError) notFound();
    if (!(error instanceof BusinessMatchingError)) throw error;
    await membershipFor(prisma, identity.id, organizationId);
    const locations = await prisma.businessLocation.findMany({ where: { organizationId, archivedAt: null }, orderBy: { code: "asc" } });
    return <div className="page"><PageHeader eyebrow="Business recalls" title="Matching unavailable" description="No complete evaluation is available. Do not interpret this as zero affected products." action={<Link href={`/business/${organizationId}/inventory`}>Inventory</Link>} /><p role="alert" className="coverage-warning">{error.message}</p><form action={base} className="toolbar"><label>Store location<select name="location" defaultValue={filters.locationId ?? ""}><option value="">All active stores</option>{locations.map(l => <option key={l.id} value={l.id}>{l.name} · {l.code}</option>)}</select></label><button className="button button-primary">Retry matching</button></form><Link href="/notices?period=all">Check public notices</Link></div>;
  }
  const href = (page: number) => `${base}?${new URLSearchParams({ ...(filters.locationId ? { location: filters.locationId } : {}), ...(filters.query ? { q: filters.query } : {}), ...(filters.kind ? { kind: filters.kind } : {}), page: String(page) })}`;
  return <div className="page business-recall-inbox">
    <PageHeader eyebrow={`Business recalls · ${inbox.membership.role.toLowerCase()}`} title={`${inbox.organization.name} recall inbox`} description="Products and store locations that may be affected. Every candidate needs verification against the official notice." action={<Link href={`/business/${organizationId}/inventory`}>View inventory</Link>} />
    <div className="coverage-warning"><p><strong>Potential matches—not confirmed affected stock.</strong> This inbox evaluates current nonzero stock when opened or refreshed. It is not background monitoring, and no business emails are sent.</p><p>Model, serial-range and production-date restrictions are not automatically checked. Inventory timestamps are not purchase or manufacture dates. Missing results do not mean your stock is safe.</p></div>
    {!inbox.coverage.healthy && <p className="coverage-warning">Source coverage is incomplete or out of date. Continue checking official notices and supplier channels.</p>}
    <details className="coverage-details"><summary>Evaluation and source coverage</summary><p>Evaluated {inbox.evaluatedRows.toLocaleString()} in-stock rows against {inbox.evaluatedNotices.toLocaleString()} non-demo notices of all dates at {date(inbox.checkedAt)}. Algorithm: {inbox.algorithmVersion}. Results are recalculated, not saved review cases.</p><ul>{inbox.coverage.sources.map(source => <li key={source.provider}>{source.provider}: {source.status}{source.stale ? " · stale or never refreshed" : ""} · {source.lastSuccessAt ? `last successful refresh ${date(source.lastSuccessAt)}` : "no successful refresh"}</li>)}</ul></details>
    <section className="form-card"><h2>Inventory freshness</h2><div className="inventory-store-grid">{inbox.selected.map(location => {
      const snapshot = inbox.snapshots.find(s => s.locationId === location.id);
      return <article key={location.id}><h3>{location.name} · {location.code}</h3>{snapshot ? <><p>Stock as of {date(snapshot.inventoryAsOf)}</p>{inbox.checkedAt.getTime() - snapshot.inventoryAsOf.getTime() > 86_400_000 && <p className="inventory-stale">Stale: older than 24 hours. Refresh your CSV before relying on quantities.</p>}</> : <p className="inventory-stale">Not evaluated: no inventory snapshot uploaded.</p>}</article>;
    })}</div>{!inbox.selected.length && <p>Add a store and import inventory to begin. No stock has been evaluated.</p>}</section>
    <SearchForm key={`${identity.id}:${organizationId}:${filters.query}:${filters.locationId}:${filters.kind}`} action={base} historyKey={`safekeep:business-recalls:v1:${identity.id}:${organizationId}`} defaultQuery={filters.query} label="Search business recall candidates" placeholder="Search product, SKU, barcode, brand or notice" className="toolbar business-recall-filters"><select name="location" aria-label="Store location" defaultValue={filters.locationId ?? ""}><option value="">All active stores</option>{inbox.locations.map(location => <option key={location.id} value={location.id}>{location.name} · {location.code}</option>)}</select><select name="kind" aria-label="Matching evidence" defaultValue={filters.kind ?? ""}><option value="">All candidates</option><option value="IDENTIFIER">Identifier matches</option><option value="TEXT">Text candidates</option></select><SubmitButton className="button button-secondary" pendingLabel="Evaluating…">Evaluate stock</SubmitButton></SearchForm>
    <div className="business-recall-summary"><p><strong>{inbox.total.toLocaleString()} candidate pairs</strong> · {inbox.matchedRows.toLocaleString()} stock rows · {inbox.matchedLocations} stores · {inbox.possibleUnits.toLocaleString()} units to verify</p><p>Filtered totals count each stock row’s units once, even when multiple notices match. Quantities are not confirmed affected units.</p><a className="button button-secondary" href={href(1)}>Refresh evaluation</a></div>
    <section className="business-recall-list" aria-label="Potentially affected stock">
      {inbox.candidates.map(({ stock, notice, evidence }) => {
        const location = inbox.locations.find(l => l.id === stock.locationId)!;
        const snapshot = inbox.snapshots.find(s => s.id === stock.snapshotId)!;
        return <article className="business-recall-card" key={`${stock.id}:${notice.id}`}>
          <div className="business-recall-card-heading"><span className="source-pill">{evidence.kind === "IDENTIFIER" ? "Identifier match · verify scope" : "Text candidate · verify identity"}</span><span>{notice.sourceAuthority} · {notice.recallDate.toLocaleDateString("en-US", { timeZone: "UTC" })}</span></div>
          <h2>{stock.productName}</h2><p className="business-recall-stock"><strong>{location.name} · {location.code}</strong><strong>{stock.quantityOnHand.toLocaleString()} units on snapshot</strong></p>
          <p>Stock as of {date(snapshot.inventoryAsOf)}{inbox.checkedAt.getTime() - snapshot.inventoryAsOf.getTime() > 86_400_000 && <span className="inventory-stale"> · Stale—verify current shelf quantity</span>}</p>
          <dl className="business-recall-identifiers"><div><dt>SKU</dt><dd>{stock.sku}</dd></div><div><dt>Brand</dt><dd>{stock.brand || "Not provided"}</dd></div><div><dt>GTIN</dt><dd>{stock.gtin || "Not provided"}</dd></div><div><dt>Lot</dt><dd>{stock.lotNumber || "Not provided"}</dd></div><div><dt>Model / serial</dt><dd>{stock.modelNumber || "Unknown"} / {stock.serialNumber || "Unknown"}</dd></div></dl>
          <h3>{notice.headline}</h3><ul className="business-recall-evidence">{evidence.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
          {!!evidence.conflicts.length && <div className="coverage-warning"><strong>Conflicting evidence—verification required</strong><ul>{evidence.conflicts.map(reason => <li key={reason}>{reason}</li>)}</ul></div>}
          <p><strong>Issuing authority’s action:</strong> {notice.recommendedAction || "Read the official notice for instructions."}</p>
          {isTrustedSourceUrl(notice.sourceUrl, notice.sourceAuthority) ? <a className="button button-primary" href={notice.sourceUrl} target="_blank" rel="noreferrer">Read official notice</a> : <p className="inventory-stale">Official link unavailable or unverified. Locate this notice through the issuing authority.</p>}
          <details><summary>Compare notice details & limitations</summary><p>{notice.description}</p><dl><div><dt>Notice product / brand</dt><dd>{notice.productName} / {notice.brand || "Not specified"}</dd></div><div><dt>Listed UPCs / GTINs</dt><dd>{notice.upcs.join(", ") || "Not supplied"}</dd></div><div><dt>Listed lots</dt><dd>{notice.lotNumbers.join(", ") || "Not supplied"}</dd></div><div><dt>Severity / class</dt><dd>{notice.severity || "Not supplied"}</dd></div><div><dt>Notice last synchronized change</dt><dd>{date(notice.updatedAt)}</dd></div></dl><ul>{evidence.limitations.map(item => <li key={item}>{item}</li>)}</ul></details>
        </article>;
      })}
      {!inbox.candidates.length && <div className="empty-state"><h2>{inbox.evaluatedRows ? "No candidates found in this view" : "No in-stock rows evaluated"}</h2><p>{inbox.evaluatedRows ? "Try clearing filters. Missing identifiers, unsupported model/serial restrictions, stale inventory and incomplete recall sources can hide affected products. This is not an all-clear." : "Upload current inventory with positive quantities. Zero-stock rows, historical snapshots and archived stores are excluded."}</p><Link className="button button-secondary" href={base}>Clear inbox filters</Link> <Link href="/notices?period=all">Browse official notices</Link></div>}
    </section>
    {inbox.pages > 1 && <nav className="pagination" aria-label="Business recall pages"><Link href={href(Math.max(1, inbox.page - 1))} aria-disabled={inbox.page === 1} className={inbox.page === 1 ? "disabled" : ""}>Previous</Link><span>{inbox.page} / {inbox.pages}</span><Link href={href(Math.min(inbox.pages, inbox.page + 1))} aria-disabled={inbox.page === inbox.pages} className={inbox.page === inbox.pages ? "disabled" : ""}>Next</Link></nav>}
  </div>;
}
