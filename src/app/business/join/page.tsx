import Link from "@/components/app-link";
import { verifiedAccount } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { BusinessJoinForm } from "@/components/business-join-form";

export const metadata = { referrer: "no-referrer" as const, robots: { index: false, follow: false } };

export default async function JoinBusiness() {
  const identity = await verifiedAccount();
  return <div className="page"><PageHeader eyebrow="SafeKeep Business" title="Join a business" description="An invitation requires the exact verified email the owner invited." /><section className="form-card business-create">
    {identity ? <><p>Signed in as {identity.email}. Verify that you expected this invitation before accepting.</p><BusinessJoinForm /></> : <><p>Sign in using the email invited by the owner, then reopen the original invitation link. The private code stays out of the sign-in URL.</p><Link className="button button-primary" href="/login?next=%2Fbusiness%2Fjoin">Sign in to accept</Link></>}
    <Link href="/business">Back to businesses</Link>
  </section></div>;
}
