import { Activity, Bell, Database, LockKeyhole, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { PrivacyControls } from "@/components/privacy-controls";
import { prisma } from "@/lib/prisma";
import { requireHousehold } from "@/lib/auth";
import { purchaseScope, matchScope } from "@/lib/household-data";
import { signOut } from "@/app/auth/actions";
import { EmailPreferences } from "@/components/email-preferences";
import { notificationDeliveryConfigured } from "@/lib/email-config";

const dateTime = (value: Date | null) => value ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(value) : "Never";

export default async function Settings({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const scope = await requireHousehold();
  const preferences = scope.userId ? await prisma.appUser.findUnique({ where: { id: scope.userId }, select: { emailAlertsEnabled: true, notificationEmail: true } }) : null;
  const [purchaseCount, recallCount, matchCount, states] = await Promise.all([prisma.purchase.count({ where: purchaseScope(scope) }), prisma.recall.count({ where: { isFixture: false } }), prisma.recallMatch.count({ where: matchScope(scope) }), prisma.syncState.findMany({ where: { provider: { not: "demo-fixtures" } }, orderBy: { provider: "asc" } })]);
  return <div className="page">
    <PageHeader eyebrow="Privacy & operations" title="Your SafeKeep data" description="See what is stored, export a portable copy, remove your purchase history, and inspect source freshness." />
    {params.cleared && <div className="flash">Your household’s purchase history and inferred matches were deleted. Other households were not affected.</div>}
    {!scope.local && <section className="trust-strip"><LockKeyhole size={18} /><span>Signed in · household owner. Your purchases are isolated from other accounts.</span><form action={signOut}><button className="button button-secondary">Sign out</button></form></section>}
    <section className="settings-metrics"><article><Database size={19} /><span><strong>{purchaseCount}</strong> tracked purchases</span></article><article><ShieldCheck size={19} /><span><strong>{recallCount}</strong> live notices</span></article><article><Activity size={19} /><span><strong>{matchCount}</strong> saved match decisions</span></article></section>
    <div className="settings-grid">
      <section className="form-card"><div className="form-card-heading"><span><Bell size={20} /></span><div><h2>Recall email alerts</h2><p>Only relevant matches to your household, with your permission.</p></div></div>{scope.local ? <p className="settings-copy">Email alerts require a verified account. Local pilot purchases are never emailed.</p> : <EmailPreferences enabled={preferences?.emailAlertsEnabled ?? false} email={preferences?.notificationEmail ?? null} deliveryReady={notificationDeliveryConfigured()} />}</section>
      <section className="form-card"><div className="form-card-heading"><span><LockKeyhole size={20} /></span><div><h2>Privacy controls</h2><p>Your receipt images are processed in the browser and are not retained.</p></div></div><p className="settings-copy">{scope.local ? "The local pilot stores confirmed purchase fields on this computer." : "Confirmed purchase fields are stored in your private household account."} Export includes only your household’s purchases and match decisions. Deleting purchase history leaves the public recall library intact. Backups may retain deleted records until their retention period expires.</p><PrivacyControls purchaseCount={purchaseCount} /></section>
      <section className="form-card"><div className="form-card-heading"><span><Activity size={20} /></span><div><h2>Source operations</h2><p>Machine-readable provider health for pilot monitoring.</p></div></div><div className="source-status-list">{states.map((state) => <div key={state.id}><span className={`status-dot ${state.status === "FAILED" ? "dot-high" : state.status === "PARTIAL" ? "dot-medium" : "dot-low"}`} /><div><strong>{state.provider}</strong><span>{state.status.toLowerCase()} · {state.recordCount} records · last success {dateTime(state.lastSuccessAt)}</span></div></div>)}{!states.length && <p className="settings-copy">No live provider has been synchronized yet.</p>}</div><a className="sample-link" href="/api/health" target="_blank" rel="noreferrer">Open machine-readable health status</a></section>
    </div>
    <section className="pilot-boundary"><strong>Private beta foundation</strong><p>Account isolation and opt-in email preferences are implemented. Email delivery still needs a verified sender, credentials and scheduled processing. Household invitations, backup restore drills, delivery/bounce monitoring, and independent security and accessibility review remain launch gates.</p></section>
  </div>;
}
