import { notFound } from "next/navigation";
import Link from "@/components/app-link";
import { PageHeader } from "@/components/page-header";
import { CaseForm, CaseReviewFields } from "@/components/business-case-form";
import { requireBusinessAccount } from "@/lib/auth";
import { BusinessAccessError } from "@/lib/business-data";
import { getBusinessCase } from "@/lib/business-cases";
import { changedNoticeFields, type NoticeSnapshot } from "@/lib/notice-history";
import { isTrustedSourceUrl } from "@/lib/source-url";
import { prisma } from "@/lib/prisma";

const date = (value: Date | string) => new Date(value).toLocaleString("en-US", { timeZone: "UTC" }) + " UTC";
const label = (value: string) => value.toLowerCase().replaceAll("_", " ");
export default async function BusinessCaseDetail({ params, searchParams }: { params: Promise<{ organizationId: string; caseId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { organizationId, caseId } = await params, raw = await searchParams;
  const value = (key: string) => typeof raw[key] === "string" ? raw[key] : "";
  const base = `/business/${organizationId}/cases/${caseId}`;
  const identity = await requireBusinessAccount(base);
  let result;
  try { result = await getBusinessCase(prisma, identity.id, organizationId, caseId, { observationId: value("observation") || undefined, eventPage: Number(value("activity") || 1), revisionPage: Number(value("history") || 1) }); }
  catch (error) { if (error instanceof BusinessAccessError) notFound(); throw error; }
  const { item, observation, stock, notice, evidence } = result;
  const manager = result.membership.role !== "STAFF", historical = observation.id !== result.latest.id;
  const changed = result.currentNoticeChanged || result.latest.noticeRevision.number < item.noticeHistory.revisionCount;
  const fields = <><input type="hidden" name="caseId" value={caseId} /><input type="hidden" name="expectedVersion" value={item.version} /></>;
  const pagination = (key: "activity" | "history", current: { page: number; pages: number }) => current.pages > 1 && <nav className="pagination" aria-label={`${key} pages`}>{current.page > 1 && <Link href={`${base}?${key}=${current.page - 1}#${key}`}>Previous</Link>}<span>{current.page} / {current.pages}</span>{current.page < current.pages && <Link href={`${base}?${key}=${current.page + 1}#${key}`}>Next</Link>}</nav>;
  return <div className="page business-cases"><PageHeader eyebrow={`Saved case · ${item.location.code}`} title={stock.productName} description={`Current decision: ${label(item.status)}${item.affectedQuantity !== null ? ` · ${item.affectedQuantity} confirmed affected units` : ""}. Review decisions do not record removal from shelves.`} action={<Link href={`/business/${organizationId}/cases`}>All saved cases</Link>} />
    {historical && <p className="coverage-warning">You are viewing historical evidence captured {date(observation.createdAt)}. <Link href={base}>Return to latest saved evidence</Link>.</p>}
    {changed && <p className="coverage-warning">The notice has changed since the latest saved evidence. Capture the latest notice, then verify its scope before recording a decision.</p>}
    {result.catalogMissing && <p className="coverage-warning">This notice is absent from the current catalog. Saved evidence is retained; this does not mean the recall is closed.</p>}
    {result.catalogInvalid && <p className="coverage-warning">Current notice data could not be evaluated. Saved evidence remains available; contact the operator before deciding.</p>}
    {(item.location.currentSnapshotId !== stock.snapshotId || item.location.archivedAt) && <p className="coverage-warning">This is historical stock{item.location.archivedAt ? " from an archived store" : " from an earlier import"}. Quantities below are saved evidence, not live shelf counts. Save a candidate from the current inbox to attach a newer stock snapshot.</p>}
    <div className="case-evidence-grid"><section className="business-recall-card"><h2>Saved stock</h2><p>{stock.storeName} · {stock.storeCode}</p><p><strong>{stock.quantityOnHand} units</strong> · Stock as of {date(stock.inventoryAsOf)}</p><dl className="business-recall-identifiers">{[["SKU", stock.sku], ["Brand", stock.brand], ["GTIN", stock.gtin], ["Lot", stock.lotNumber], ["Model", stock.modelNumber], ["Serial", stock.serialNumber]].map(([name, text]) => <div key={name}><dt>{name}</dt><dd>{text || "Not provided"}</dd></div>)}</dl><p>Evidence captured {date(observation.createdAt)} · {observation.algorithmVersion}</p><h3>Why this was flagged</h3><ul>{evidence.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>{!!evidence.conflicts.length && <div className="coverage-warning"><strong>Conflicting evidence</strong><ul>{evidence.conflicts.map(reason => <li key={reason}>{reason}</li>)}</ul></div>}<details><summary>Matching limitations</summary><ul>{evidence.limitations.map(reason => <li key={reason}>{reason}</li>)}</ul></details></section>
    <section className="business-recall-card"><h2>Notice version {observation.noticeRevision.number}</h2><h3>{notice.headline}</h3><p>{notice.sourceAuthority} · {date(notice.recallDate)}</p><p>{notice.description}</p><dl className="business-recall-identifiers"><div><dt>Product / brand</dt><dd>{notice.productName} / {notice.brand || "Not supplied"}</dd></div><div><dt>Listed UPCs / GTINs</dt><dd>{notice.upcs.join(", ") || "Not supplied"}</dd></div><div><dt>Listed lots</dt><dd>{notice.lotNumbers.join(", ") || "Not supplied"}</dd></div><div><dt>Severity / class</dt><dd>{notice.severity || "Not supplied"}</dd></div></dl><p><strong>Authority’s action:</strong> {notice.recommendedAction}</p>{isTrustedSourceUrl(notice.sourceUrl, notice.sourceAuthority) && <a className="button button-secondary" href={notice.sourceUrl} target="_blank" rel="noreferrer">Read official notice</a>}<p className="case-help">The official page may have changed since this saved version.</p></section></div>
    {manager && !historical && <section className="form-card"><h2>Review this case</h2>{!result.catalogMissing && <CaseForm organizationId={organizationId} operation="refresh" label="Capture latest notice evidence">{fields}<p>Checks the current catalog against the last saved stock—not a new inventory import.</p></CaseForm>}{!changed && !result.catalogInvalid ? <CaseForm organizationId={organizationId} operation="review" label="Record review" key={item.version}>{fields}<input type="hidden" name="observationId" value={result.latest.id} /><CaseReviewFields quantity={stock.quantityOnHand} initialStatus={item.status} /></CaseForm> : <p>Review is unavailable until the latest valid notice evidence is captured.</p>}</section>}
    {!manager && <p>Read-only access. Ask an owner or manager to capture new evidence or record a decision.</p>}
    <section className="form-card" id="activity"><h2>Case activity</h2><p>Earlier evidence and decisions are retained. Times are in UTC.</p><ol className="case-timeline">{result.events.map(event => {
      const payload = JSON.parse(event.payload) as Record<string, unknown>;
      return <li key={event.id}><strong>{label(event.kind)}</strong><span>{date(event.createdAt)} · {event.actorId === identity.id ? "You" : event.actorId.startsWith("system:") ? "Source update" : "Team member"}</span>{typeof payload.to === "string" && <p>Decision: {label(payload.to)}{typeof payload.affectedQuantity === "number" ? ` · ${payload.affectedQuantity} affected units` : ""}</p>}{typeof payload.note === "string" && <p className="case-note">{payload.note}</p>}{typeof payload.noticeVersion === "number" && <p>Notice version {payload.noticeVersion} requires another review. Previous decision: {label(String(payload.previousStatus))}.</p>}{typeof payload.observationId === "string" && <Link href={`${base}?observation=${encodeURIComponent(payload.observationId)}`}>View evidence used</Link>}</li>;
    })}</ol>{pagination("activity", result.activity)}</section>
    <section className="form-card" id="history"><h2>Notice history</h2><p>Versions are captured when synchronized or saved. This is our observed history—not a complete record of every authority edit.</p>{result.revisions.map((revision, index) => {
      const snapshot = JSON.parse(revision.payload) as NoticeSnapshot, previous = result.revisions[index + 1];
      const changedFields = previous ? changedNoticeFields(JSON.parse(previous.payload), snapshot) : [];
      return <details className="case-revision" key={revision.id}><summary>Version {revision.number} · observed {date(revision.observedAt)}{revision.id === observation.noticeRevisionId ? " · Evidence shown above" : ""}</summary><p>{revision.number === 1 ? "First observed version." : previous ? `Changed fields: ${changedFields.join(", ")}.` : "Earlier version is on the next history page."}</p><h3>{snapshot.headline}</h3><p>{snapshot.description}</p><p>Brand: {snapshot.brand || "Not supplied"} · Lots: {snapshot.lotNumbers.join(", ") || "Not supplied"}</p><p>Identifiers: {snapshot.upcs.join(", ") || "Not supplied"}</p><p>Authority’s action: {snapshot.recommendedAction}</p><details><summary>Full captured source data</summary><pre className="case-json">{JSON.stringify(snapshot, null, 2)}</pre></details></details>;
    })}{pagination("history", result.history)}</section>
  </div>;
}
