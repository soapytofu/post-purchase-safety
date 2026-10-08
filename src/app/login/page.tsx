import Link from "@/components/app-link";
import { PageHeader } from "@/components/page-header";
import { SignInForm } from "@/components/sign-in-form";
import { authConfigured, hostedDatabaseConfigured, safeReturnTo } from "@/lib/auth-config";
import { localPilotAllowed } from "@/lib/auth";

export default async function Login({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const returnTo = safeReturnTo(params.next);
  const destination = returnTo === "/add" ? "add a purchase" : returnTo === "/purchases" ? "view your purchases" : returnTo === "/alerts" ? "view your household alerts" : returnTo === "/settings" ? "manage your household settings" : "open your household overview";
  const ready = authConfigured() && (process.env.NODE_ENV !== "production" || hostedDatabaseConfigured());
  return <div className="page"><PageHeader eyebrow="Private household accounts" title="Your shelf. Your account." description="Sign in with a secure email link—no password to remember. Public recalls remain available without an account." />
    <section className="form-card" style={{ maxWidth: 560 }}>
      <h2>Sign in or create an account</h2>
      {params.next && <p className="settings-copy">Sign in to {destination}. We’ll return you there after you verify your email.</p>}
      {params.error && <p className="inline-error">This sign-in link could not be verified. Request a fresh link.</p>}
      {ready ? <SignInForm returnTo={returnTo} /> : <p className="settings-copy">Hosted accounts are not connected yet. The operator needs to configure Supabase sign-in and a PostgreSQL database before opening this app to households.</p>}
      <p className="settings-copy">Each new account starts with a private household. Receipt images are processed in your browser; only the items you confirm are saved to your account. Shared household invitations are coming later.</p>
      <Link className="button button-secondary" href="/notices">Browse public recalls</Link>
      {await localPilotAllowed() && <p><Link href="/">Continue with the local pilot ledger</Link></p>}
    </section>
  </div>;
}
