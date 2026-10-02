# SafeKeep multi-user launch

## Implemented foundation

- Supabase email-link sign-in, callback verification, session refresh and sign-out.
- Server-verified user identity plus database membership on every private page/action/export.
- One household per account for this milestone; owner membership is provisioned atomically on first verified sign-in.
- Household-scoped purchases, dashboard counts, alert reads/updates, JSON export and deletion. Public recalls remain global.
- Existing SQLite purchases retain null ownership and are accessible only in loopback local development. No new account can claim them automatically.
- Hosted PostgreSQL schema and migration history; RLS/no API policies and revoked browser-role grants block direct Supabase Data API access. Prisma server ownership still requires application-level tenant filters.
- Local-only demo seeding and manual sync. Hosted imports use the bearer-protected `/api/sync` endpoint.
- Real-database isolation regression tests and GitHub quality checks, including a separate PostgreSQL service job that exercises migrations and blocked API roles.

This is a multi-user **foundation**, not a public-launch certification. Hosted email delivery and database migration need a real staging environment and have not been validated against your account yet.

Production builds use Next’s supported webpack engine because the local execution environment blocks Turbopack’s worker port binding. This is a build-engine choice, not a skipped compilation check.

## Connect staging (operator checklist)

1. Create a Supabase staging project. Keep production separate. Enable email authentication; configure the Auth Site URL and allowed redirect URL to your exact HTTPS site, including `/auth/callback`. Configure SMTP, provider rate limits and abuse controls before inviting external users.
2. Configure secrets in the hosting provider (not in Git or chat):
   - `AUTH_MODE=supabase`
   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (never a service-role key here).
   - `APP_URL=https://your-site.example`
   - `DATABASE_URL`: server-only PostgreSQL connection string, TLS enabled. Use a connection suitable for Prisma and your hosting runtime. For migrations, use the direct/session connection, not transaction pooling.
   - `SYNC_SECRET`: randomly generated, at least 24 characters.
   - Optional `FDA_API_KEY`.
3. With staging connection credentials available only to the operator, run `npm run db:hosted:prepare` then `npm run db:hosted:deploy`. This initial migration is for a **new empty application database**, not an existing populated schema. Never run local `setup`, `db:push` or `db:seed` on hosted data.
4. Build with `npm run build:hosted` so Prisma generates the PostgreSQL client. Your platform must bind its web server to its required interface/port (the default local `start` binds loopback intentionally). Use `next start --hostname 0.0.0.0 --port <platform port>` for a container host.
5. For cross-device email links, customize the Supabase Magic Link template to use `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}`. The default PKCE callback also works when the email is opened in the requesting browser. Never place purchase data or household IDs in links.
6. Schedule a POST to `/api/sync` with `Authorization: Bearer <SYNC_SECRET>`. Monitor `/api/health`; partial/failed/stale coverage must remain visible. Do not schedule demo fixtures.
7. Enable encrypted backups and retention. Restore into a separate staging database and verify counts and household isolation before recording a successful restore drill. Document how deletion interacts with backup retention.

Do not migrate your founder ledger automatically. Export it locally; if you want those items in a hosted account, add/import only after signing into the intended account and validating the staging workflow. This prevents accidental exposure of founder purchases.

## Required staging acceptance tests

- Two real email accounts, different browsers: each receives an empty separate household. Add distinct purchases through manual, CSV and receipt flows.
- Alice cannot read Bob’s dashboard/ledger/alerts/export; submitting Bob’s alert ID as Alice does not change it. Deleting Alice’s history leaves Bob’s rows and all public recalls unchanged.
- Signed-out and forged-cookie requests cannot read private pages/export or execute private actions. Expired, banned and deleted accounts are rejected.
- Open login links in the same browser and on another device with the token-hash template; reuse/expired links fail safely. Sign out then revisit private URLs.
- Production without auth or PostgreSQL configuration stays closed; no loopback bypass. Supabase anon/authenticated Data API roles cannot read application tables.
- Source sync with missing/wrong secrets is rejected. Partial feeds and blocked USDA data produce degraded health, never “complete coverage.”
- Both local and hosted builds pass quality gates. Real PostgreSQL migrations, provider emails, API-role isolation and backup restoration are launch gates, not replaced by SQLite tests.

## Next major milestones, in order

### 1. Verified household beta

Connect the staging project, complete the checklist above, deploy to a private beta URL, then onboard 5–10 consented households. Add invite-only admission before a wider pilot. Add expiring, hashed household invitations, explicit accept/switch UI and OWNER/MEMBER permissions; never join households by email/name guessing. Current sign-in is separate personal households, not collaborative household sharing.

### 2. Reliable alerts outside the app

Add immutable notice revisions and material-change detection before sending emails. Use an idempotent notification outbox, a retrying worker with delivery logs, explicit opt-in consent and unsubscribe. Start with high-confidence matches; avoid claiming an exact item is affected when lot/identifier data is missing. No silent background emails or receipt-image uploads.

### 3. Operable, safe public beta

Add bounded imports/queues and incremental matching, per-account and IP abuse limits, redacted error monitoring, a source-health dashboard, account deletion including auth identities, a retention policy, accessibility/mobile review and independent security testing. USDA coverage remains incomplete until a reliable authorized source can be validated.

### 4. Validate the business

Run a 25–50-household, 4–6-week pilot. Measure first successful import, weekly active households, time to review an actionable alert, match usefulness/false positives, source lag, failed imports and willingness to pay. Interview people who stop using it. Treat coverage and “none found” as limitations, not safety assurances. Add billing only after evidence of repeated value.

## Reference documentation

- Supabase SSR setup: https://supabase.com/docs/guides/auth/server-side/creating-a-client
- Supabase verified user lookup: https://supabase.com/docs/reference/javascript/auth-getuser
- Supabase redirect configuration: https://supabase.com/docs/guides/auth/redirect-urls
- PostgreSQL RLS: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
