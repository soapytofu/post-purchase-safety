import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { EmailUnsubscribe } from "@/components/email-preferences";

export const metadata = { title: "Email preferences | SafeKeep", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

export default async function EmailPreferencePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const token = (await searchParams).token ?? "";
  return <div className="page"><PageHeader eyebrow="Your preferences" title="Turn off recall emails" description="Confirm below to stop email alerts. Opening this page alone does not change your preferences." /><section className="form-card">{/^[a-f0-9]{64}$/.test(token) ? <EmailUnsubscribe token={token} /> : <p>This preference link is incomplete. You can turn off alerts in your account settings.</p>}<p><Link href="/settings">Open account settings</Link></p></section></div>;
}
