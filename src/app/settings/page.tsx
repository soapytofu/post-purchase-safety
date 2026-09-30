import { Activity, Database, LockKeyhole, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { PrivacyControls } from "@/components/privacy-controls";
import { prisma } from "@/lib/prisma";

const dateTime = (value: Date | null) => value ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(value) : "Never";

export default async function Settings({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const [purchaseCount, recallCount, matchCount, states] = await Promise.all([prisma.purchase.count(), prisma.recall.count({ where: { isFixture: false } }), prisma.recallMatch.count(), prisma.syncState.findMany({ where: { provider: { not: "demo-fixtures" } }, orderBy: { provider: "asc" } })]);
  return <div className="page">
    <PageHeader eyebrow="Privacy & operations" title="Your SafeKeep data" description="See what is stored, export a portable copy, remove your purchase history, and inspect source freshness." />
    {params.cleared && <div className="flash">Your purchase history and its inferred matches were deleted from this device.</div>}
    <section className="settings-metrics"><article><Database size={19} /><span><strong>{purchaseCount}</strong> tracked purchases</span></article><article><ShieldCheck size={19} /><span><strong>{recallCount}</strong> live notices</span></article><article><Activity size={19} /><span><strong>{matchCount}</strong> saved match decisions</span></article></section>
    <div className="settings-grid">
      <section className="form-card"><div className="form-card-heading"><span><LockKeyhole size={20} /></span><div><h2>Privacy controls</h2><p>Your receipt images are processed in the browser and are not retained.</p></div></div><p className="settings-copy">The local pilot stores confirmed purchase fields in its SQLite database. Export creates a JSON file containing your purchases and match decisions. Deleting purchase history leaves the public recall library intact.</p><PrivacyControls purchaseCount={purchaseCount} /></section>
      <section className="form-card"><div className="form-card-heading"><span><Activity size={20} /></span><div><h2>Source operations</h2><p>Machine-readable provider health for pilot monitoring.</p></div></div><div className="source-status-list">{states.map((state) => <div key={state.id}><span className={`status-dot ${state.status === "FAILED" ? "dot-high" : state.status === "PARTIAL" ? "dot-medium" : "dot-low"}`} /><div><strong>{state.provider}</strong><span>{state.status.toLowerCase()} · {state.recordCount} records · last success {dateTime(state.lastSuccessAt)}</span></div></div>)}{!states.length && <p className="settings-copy">No live provider has been synchronized yet.</p>}</div><a className="sample-link" href="/api/health" target="_blank" rel="noreferrer">Open machine-readable health status</a></section>
    </div>
    <section className="pilot-boundary"><strong>Before a public multi-user launch</strong><p>Add authenticated accounts and household tenancy, move SQLite to managed PostgreSQL with encrypted backups, complete a privacy and accessibility review, and connect opt-in notifications. The current build is appropriate for a private single-household pilot.</p></section>
  </div>;
}
