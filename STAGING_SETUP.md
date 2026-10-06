# SafeKeep staging connection

Confirmed project: `safekeep-staging` (`gyapgfgdynkpmrpaejmy`), US East.
The application tables and migration history were empty when inspected on October 6, 2026.

## Private settings

Use `.env.staging`, which is excluded from Git. Keep the existing `.env` and
`prisma/dev.db` unchanged: they contain the local pilot settings and ledger.
`.env.staging.example` is the shareable template and must never contain credentials.

The staging file has the project URL and publishable API key populated.
Its `DATABASE_URL` is deliberately blank until you enter it privately.

1. Open the staging project in Supabase and click **Connect**.
2. Select **Session pooler** and copy the PostgreSQL URI (port 5432).
3. Replace its password placeholder with the project's database password,
   URL-encoding any special characters in the password.
4. Paste the complete URI into `DATABASE_URL` in `.env.staging`. Ensure the
   query parameters include `sslmode=require` (use `&` if there is already a `?`).
5. Save the file and tell the assistant it is ready. Do not paste it into chat.

Do not run `setup`, `db:seed`, or `db:push` on staging. Use the existing Prisma
hosted migrations so schema creation and migration history stay synchronized.
Supabase's management connection can inspect the database, but does not supply
the password needed by the app's Prisma connection.

## Next checks

- Validate the URI belongs to this project before applying migrations.
- Apply the hosted migrations and verify all application tables have RLS enabled
  and no grants to browser-facing `anon`/`authenticated` roles.
- Run security advisors and verify the actual Prisma connection.
- Configure Auth Site URL and allowed redirects for the test address, then
  verify email-link sign-in with two real accounts.
- Set up custom SMTP for test addresses outside the Supabase organization team.

Staging configuration is prepared, not yet connected or deployed. No founder
purchases are copied. Hosted settings must be loaded explicitly; Next.js and
Prisma do not automatically load a file named `.env.staging`.

The current checkout generates either a SQLite or PostgreSQL Prisma client, not
both at once. Use a separate checkout for staging, or stop the local server and
regenerate its SQLite client before returning to local mode. Do not simply
switch a running local app's database URL.

Connection reference: https://supabase.com/docs/guides/database/prisma
