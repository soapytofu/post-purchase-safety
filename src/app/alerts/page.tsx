import { ExternalLink, MapPin, ShieldAlert } from "lucide-react";
import { MatchStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { ConfidenceBadge } from "@/components/confidence-badge";
import { updateMatchStatus } from "@/app/actions";
import type { Confidence } from "@/domain/types";

const date = (value: Date) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(value);

export default async function Alerts({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams; const confidence = params.confidence as Confidence | undefined;
  const matches = await prisma.recallMatch.findMany({ where: confidence && confidence !== "NONE" ? { confidence } : {}, include: { purchase: true, recall: true }, orderBy: [{ status: "asc" }, { confidence: "asc" }, { createdAt: "desc" }] });
  return <div className="page"><PageHeader eyebrow="Safety inbox" title="Potential recall matches" description="Each card separates authoritative notice details from SafeKeep’s inferred match. Check the source before acting." />
    <div className="filter-pills">{["ALL", "HIGH", "MEDIUM", "LOW"].map((item) => <a className={(!confidence && item === "ALL") || confidence === item ? "active" : ""} href={item === "ALL" ? "/alerts" : `/alerts?confidence=${item}`} key={item}>{item === "ALL" ? "All matches" : item}</a>)}</div>
    <div className="alerts-stack">{matches.map((match) => { const reasons = JSON.parse(match.reasons) as string[]; return <article className={`alert-card alert-${match.confidence.toLowerCase()}`} id={match.id} key={match.id}>
      <div className="alert-card-top"><div className="alert-symbol"><ShieldAlert size={22} /></div><div className="alert-title"><span className="kicker">Potential recall match</span><h2>{match.purchase.productName}</h2><p><MapPin size={14} /> Purchased {date(match.purchase.purchaseDate)} at {match.purchase.retailer}</p></div><ConfidenceBadge confidence={match.confidence} /></div>
      <div className="alert-body"><div><p className="section-label">Why this matched</p><ul className="reason-list">{reasons.map((reason) => { const conflict = reason.includes("does not") || reason.includes("outside"); return <li className={conflict ? "reason-conflict" : ""} key={reason}><span>{conflict ? "!" : "✓"}</span>{reason}</li>; })}</ul><p className="inference-note">SafeKeep confidence score: {Math.round(match.score * 100)}%. This is an inference, not confirmation that your exact item is recalled.</p></div><div className="notice-details"><p className="section-label">Authority notice · {match.recall.isFixture ? "Demo fixture" : "Live record"}</p><h3>{match.recall.headline}</h3><p>{match.recall.description}</p><dl><div><dt>Authority</dt><dd>{match.recall.sourceAuthority}</dd></div><div><dt>Issued</dt><dd>{date(match.recall.recallDate)}</dd></div><div><dt>Classification</dt><dd>{match.recall.severity || "Not listed"}</dd></div></dl><div className="recommended"><strong>Recommended action</strong><p>{match.recall.recommendedAction}</p></div><a href={match.recall.sourceUrl} target="_blank" rel="noreferrer">Check authoritative recall portal <ExternalLink size={14} /></a></div></div>
      <form action={updateMatchStatus} className="status-form"><input type="hidden" name="id" value={match.id} /><label>What did you do?<select name="status" defaultValue={match.status}>{Object.values(MatchStatus).map((status) => <option value={status} key={status}>{status.charAt(0) + status.slice(1).toLowerCase()}</option>)}</select></label><button className="button button-secondary" type="submit">Save status</button></form>
    </article>; })}{!matches.length && <div className="empty-state">No potential matches in this confidence level.</div>}</div>
  </div>;
}
