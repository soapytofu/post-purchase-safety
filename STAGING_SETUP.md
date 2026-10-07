# SafeKeep staging connection

Confirmed project: `safekeep-staging` (`gyapgfgdynkpmrpaejmy`), US East.
The application tables and migration history were empty when inspected on October 6, 2026.
On October 7, the saved Session pooler connection was verified and both existing
hosted migrations were applied. All eight public tables, including Prisma's
migration history, have RLS enabled and no access grants for `anon` or
`authenticated`. Actual reads under both API roles were rejected. No accounts,
purchases, or recalls were copied into staging.

## Private settings

Use `.env.staging`, which is excluded from Git. Keep the existing `.env` and
`prisma/dev.db` unchanged: they contain the local pilot settings and ledger.
`.env.staging.example` is the shareable template and must never contain credentials.

The staging file has the project URL and publishable API key populated.
Its `DATABASE_URL` must be entered privately; never put it in this document.

1. Open the staging project in Supabase and click **Connect**.
2. Select **Session pooler** and copy the PostgreSQL URI (port 5432).
3. Replace its password placeholder with the project's database password,
   URL-encoding any special characters in the password.
4. Paste the complete URI into `DATABASE_URL` in `.env.staging`. Ensure the
   query parameters include `sslmode=require` (use `&` if there is already a `?`).
5. Save the file and tell the assistant it is ready. Do not paste it into chat.

Do not run `setup`, `db:seed`, or `db:push` on staging. Use the existing Prisma
hosted migrations so schema creation and migration history stay synchronized.
`db:hosted:deploy` also runs an idempotent access-protection script for Prisma's
internal migration-history table, which Supabase otherwise grants API access to
by default. This script does not change Prisma's migration history.
Supabase's management connection can inspect the database, but does not supply
the password needed by the app's Prisma connection.

## Next checks

- Configure Auth Site URL and allowed redirects for the test address, then
  verify email-link sign-in with two real accounts.
- Set up custom SMTP for test addresses outside the Supabase organization team.
- Separate the privileged migration connection from a least-privilege app
  connection before public launch. The current staging bootstrap connects as
  the table owner: browser access is blocked, but server-side household isolation
  still relies on the application's authorization checks.

Staging database setup is verified; real-account sign-in and the hosted app have
not yet been verified. No founder purchases are copied. Hosted settings must be loaded explicitly; Next.js and
Prisma do not automatically load a file named `.env.staging`.

The security advisor reports only informational notices about RLS tables without
policies. This is deliberate: the app does not use the browser Data API, and
those roles must remain denied. Do not add permissive policies to silence these
notices. A missing foreign-key index on `RecallMatch.recallId` is a separate
performance follow-up; unused-index notices are expected on this empty database.

The current checkout generates either a SQLite or PostgreSQL Prisma client, not
both at once. Use a separate checkout for staging, or stop the local server and
regenerate its SQLite client before returning to local mode. Do not simply
switch a running local app's database URL.

Connection reference: https://supabase.com/docs/guides/database/prisma
