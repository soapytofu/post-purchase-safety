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

## Business workspace activation (October 21, 2026)

The business foundation is additive and separate from household membership. Migration `202610210001_business_workspace` was applied to `safekeep-staging` on October 21, 2026 after resuming the paused project. Before/after row counts and SHA-256 fingerprints matched across all eight existing application tables, including the household and its six purchases. All four new business tables have RLS enabled and browser-role privileges revoked; direct browser-role reads were rejected. Prisma reported no schema drift. No test organizations, memberships, locations or invitations were inserted into staging. Production deployment is separate and has not been performed.

The app runs locally against staging at `http://127.0.0.1:3002`; use that exact origin for sign-in. Signed-out browser checks passed for business sign-in context, blocked exports and public recalls. Real-account business creation/invitation testing remains a manual acceptance step. Supabase's security advisor reports informational no-policy notices for the intentionally server-only tables, plus a password-leak protection warning; no authentication settings were changed. See [Supabase password-protection guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) before enabling password-based flows.

1. Confirm the intended staging project/connection and its backup/restore arrangements. Do not run local seeding or `db:push` against hosted data.
2. Run the existing hosted generate/deploy workflow with staging credentials kept private, then rebuild/restart the app. The migration adds four server-only tables, a role enum, foreign keys/indexes, RLS and revoked browser-role grants; it does not modify household/purchase rows. Validate migration status and schema drift before proceeding.
3. With two consented real accounts, open `/business`, create separate businesses and locations, and verify neither can see/export/change the other’s records. Test a guessed organization/location ID and a signed-out request. Confirm household purchases/export remain unchanged.
4. Invite a third account as staff using its exact verified email. Share the link privately; no email is sent. Test incorrect email, expiry, revocation, replay, role changes and removal. Managers may export locations, staff may not; only owners may manage team/locations.
5. Verify archive/restore and stable location codes, and check that all four tables reject direct Data API access. Do not enable inventory monitoring or advertise a live safety service: those features are not part of this milestone.

Workspace selection is explicit navigation, not a trusted client-side tenant cookie. Every private operation rechecks database membership from a server-verified identity. The local pilot bypass never grants business access. See `docs/BUSINESS_PILOT_BACKLOG.md` for staged implementation status.

### Inventory activation (October 21, 2026)

Migration `202610210002_inventory_snapshots` adds three server-only inventory tables and a nullable current-snapshot pointer to business locations. It is applied to staging. Before/after fingerprints and counts matched across all twelve existing application tables (excluding only the newly added pointer field); the existing household still has six purchases and 952 public notices remain. All three new tables were empty after deployment, RLS was enabled, and direct `anon`/`authenticated` reads were denied. Prisma reported no schema drift. No test inventory was inserted into staging.

Open `/business`, select a business, then **Open inventory**. Owners/managers select exactly the active stores represented by a complete CSV, download the template if needed, preview/validate, and explicitly confirm. Confirmation replaces current stock for those stores only; it is not an adjustment/delta import. A zero quantity is valid; every selected store must have at least one row. Staff can read current stock but cannot import or download the template.

Files must be UTF-8 CSV, up to 5 MiB and 10,000 rows, with at most 50 selected stores. Required headers: `location_code,sku,product_name,quantity_on_hand,inventory_as_of`. Optional: `brand,gtin,manufacturer,model_number,lot_number,serial_number,production_date,supplier,category`. Timestamps require a timezone and must agree within each store. Product identifiers remain strings; no brand is inferred. Any validation issue blocks the whole file; the UI lists up to 200 issues and the total count.

Previews are immutable and expire after 30 minutes. Confirmation rechecks membership, active stores and baseline snapshots under an organization-scoped transaction. Older/equal timestamps and changed baselines are rejected; duplicate/replayed content cannot reactivate historical stock. Prior snapshots remain stored. Expiry is not physical deletion: draft/history retention and cleanup still need an agreed policy and implementation. Imports run synchronously; the disposable PostgreSQL 10,000-row test passed, but production hosting timeouts/load need separate validation before making throughput commitments.

SQLite regression tests, PostgreSQL isolation/rollback tests and synthetic browser tests passed, including 320/390/1440px layouts. Complete real-account staging acceptance before enrolling a partner. On-demand inventory candidates are now available as described below; durable exposure cases, business notification delivery, stock exports, automatic refresh and retention jobs are not enabled. Stale stock is labeled after 24 hours; current inventory is not a safety assurance. Existing household routes, imports and matching remain separate.

### On-demand business recall inbox (October 21, 2026)

From a business workspace or inventory page, open **Recall inbox**. Owner, manager and staff can read organization-scoped candidates; no inbox operation changes stock or marks products affected. The new service is read-only, so no migration, staging fixture insertion or household-data rewrite is required. The consumer matcher and email outbox are untouched.

The inbox compares current positive-quantity stock in active stores with synchronized non-demo notices of all dates. Identifier candidates use canonical GTIN padding; textual candidates require multiple shared name terms. Matching brand/lot evidence and conflicting identifiers/brands/lots are displayed without treating a candidate as confirmed affected. Missing brands are not guessed. Model, serial-range and production-date restrictions are not automatically verified, and inventory timestamps are not matched to distribution windows. Compare packaging and supplier evidence with the full official notice before making an affected-stock determination.

Search, store/evidence filters, pagination, deduplicated stock-unit totals, per-store stale/missing inventory and source-health details are provided. Opening or refreshing recomputes from current data; it does not run continuously or send alerts. Saved cases, notice revisions and review history were added in the October 22 milestone below; assignments and removal quantities remain pending. Missing results are explicitly not an all-clear.

Interactive limits: 20,000 positive-stock rows, 10,000 synchronized notices and 200,000 candidate comparisons per view. Workload overflow, malformed notice identifier arrays and inconsistent snapshot references fail with an unavailable state, not partial/empty success. A queued evaluator and real partner benchmark are required for larger workloads or monitoring claims. Direct Data API permissions and RLS remain unchanged. All reads enforce membership and scoped current snapshots, with a fresh authorization check before returning results.

Verification: the complete SQLite regression run passed 99 tests (five PostgreSQL-only checks skipped); the PostgreSQL run passed all 32 household/business/inventory/inbox checks with none skipped. Synthetic browser checks passed for quantities across two stores, duplicate-notice unit totals, evidence/conflicts, filters/pagination, zero-stock snapshot replacement, staff/nonmember/signed-out access and 320/390/1440px layouts. Tests used disposable local databases and a local synthetic-auth service, not real Supabase accounts or staging fixture uploads. Complete real-account acceptance before partner enrollment.

### Saved cases and notice history (October 22, 2026)

From the recall inbox, an owner or manager chooses **Save recall case**, then **Open saved case**. The separate **Saved recall cases** list includes review-status/store filters and archived stores. Staff have read-only access. Saving does not change household purchases, consumer matches or email preferences.

Each case retains numbered evidence observations with the stock snapshot and store name as captured, source content version, matching reasons/conflicts and algorithm version. New stock for the same store/stock-key/notice attaches to the existing case when explicitly saved. The detail page links each activity event to the evidence used. Historical evidence cannot be reviewed as though it were latest evidence. Inventory older than 24 hours and stale/incomplete source coverage are visibly flagged.

Owners/managers record **Needs review**, **Confirmed affected** or **Not affected**, with a reason; a decided state requires explicit official-notice/stock verification. A confirmed quantity must be between one and the saved snapshot quantity. These are review decisions, not shelf-removal/completion records. Case notes append without changing the decision. The complete JSON export includes private notes, all observations, notice versions and activity; staff/nonmembers cannot export. Limits are 500 observations, 500 source versions, 2,000 events and 10 MiB; larger cases return an explicit error, never an incomplete report. Exports are operational records, not regulatory certification.

Source synchronization now captures earlier and updated content transactionally. Any content change conservatively reopens decided cases. A subsequent **Capture latest notice evidence** compares the latest synchronized catalog version with the last saved stock; it does not fetch the authority or import new inventory. Source disappearance never closes a case. Version checks reject stale-tab decisions; PostgreSQL triggers block updates/deletes to notice versions, observations and activity. No automatic cleanup is enabled: agree retention/deletion/restore procedures before real partner enrollment.

Migration `202610220001_saved_recall_cases` added five server-only tables and supporting constraints/indexes. It was applied to staging after local PostgreSQL verification; all fifteen existing application-table fingerprints remained unchanged. RLS is enabled and browser API-role grants are revoked. The household still has six purchases. A baseline captured 952 existing notices as 952 versions; no live source sync, household rematch or test business insertion ran against staging.

For a fresh environment, apply the normal hosted migrations first, then optionally capture existing catalog content:

```bash
# Credentials remain in your private environment file. Default is a dry run.
node --env-file=.env.staging --import tsx scripts/backfill-notice-history.ts
node --env-file=.env.staging --import tsx scripts/backfill-notice-history.ts --apply
npm run benchmark:business
```

Baseline capture processes 100 notices per transaction and is resumable/idempotent for unchanged content. It does not fetch sources, regenerate household matches, send emails or change inventory. It cannot recover historical versions from before the first observation. The 24-pair matching benchmark is explicitly synthetic; its known misses/false positives are listed in the output and do not establish real-world safety accuracy.

Acceptance: use two consented real accounts to save/review cases in separate businesses, check staff restrictions, save replacement stock to the same case, export the evidence, and verify household purchases are unchanged. Synthetic browser tests exercise this separately with loopback-only fake auth and a disposable database; they do not validate real email-link delivery. Background matching, business email, assignments, removed-unit accounting and explicit official closure remain future milestones.

The repeatable browser command is `npm run test:business-ui`. First generate the hosted Prisma client, apply migrations to a disposable local database named `safekeep_test`, install Chromium with `npx playwright install chromium`, and set `TEST_DATABASE_URL` to that loopback database. The script refuses remote or differently named databases, creates synthetic fixtures, and starts its own temporary loopback app/auth servers. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` only if using an already installed browser. Screenshots go to the ignored `.test-artifacts/business-cases` directory. The PostgreSQL CI job runs this command and uploads its synthetic screenshots. It tests rejected-draft preservation, save/review/note/export, revised notices, historical evidence, role isolation and 320/390/1440px layouts.

### Dependency review (October 22, 2026)

Updated Next.js and `eslint-config-next` to 16.4.2, with locked `sharp` 0.35.5 and `source-map-js` 1.2.2. `npm audit --omit=dev` reports zero production dependency advisories after the update. This addresses the published Next.js [image optimization](https://github.com/advisories/GHSA-2464-fhr4-w9xw), [Server Actions](https://github.com/advisories/GHSA-p3m5-59mp-jv5r) and [typed-array cache](https://github.com/advisories/GHSA-673q-mjm6-r5xr) advisories; it is not proof that every security issue has been eliminated.

Full development audit still reports five affected dependency nodes from one unpatched [`braces` advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) in the Next ESLint → fast-glob → micromatch chain. It is absent from production dependencies. No forced downgrade of the framework’s lint configuration or unreviewed package substitution was applied. Revisit when an upstream patch is available; run lint only on trusted workspaces. CI uses Node 22.14; the local machine currently has Node 22.11 and emits a development-tool engine warning, so use the documented Node 22.14+ baseline for fresh installations.

Verification for this milestone: the complete SQLite run passed 110 tests with seven PostgreSQL-only checks skipped; the PostgreSQL isolation suite passed all 44 checks. Lint/type checks and the hosted build passed. The reproducible Chrome flow additionally checked before/after notice changes, preserved rejected drafts, household manual purchase creation and separate-household visibility. These were local checks with synthetic accounts; CI is configured to repeat them, but real-account staging acceptance is still required.

## Reference documentation

- Supabase SSR setup: https://supabase.com/docs/guides/auth/server-side/creating-a-client
- Supabase verified user lookup: https://supabase.com/docs/reference/javascript/auth-getuser
- Supabase redirect configuration: https://supabase.com/docs/guides/auth/redirect-urls
- PostgreSQL RLS: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
