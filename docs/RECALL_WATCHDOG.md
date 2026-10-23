# Independent recall refresh watchdog

## Current status

Prepared and locally tested on October 23, 2026. **Not installed or activated on staging**, per the user's request. No GitHub credential has been uploaded to Supabase. Real Supabase Cron, Vault and HTTP dispatch still require an end-to-end activation test; a passing local test is not evidence of a live fallback.

The existing hourly GitHub schedule remains primary. This optional watchdog uses [Supabase Cron](https://supabase.com/docs/guides/cron) as an independent clock, checking every 10 minutes even when the laptop is asleep. It dispatches the existing refresh workflow rather than duplicating ingestion/matching logic. It protects against a missed GitHub **schedule**, not a GitHub runner/API outage or an unavailable/paused Supabase database. It provides no guarantee that all real-world recalls are covered.

## Recovery policy

- Any required source (FDA, USDA FSIS, CPSC) missing, unsuccessful, empty, future-dated, or at least 90 minutes old needs recovery. Partial coverage is never treated as success.
- Wait 20 minutes after the latest source attempt so an ongoing refresh has time to finish. This is a grace period, not a worker lock.
- At most one watchdog dispatch per hour, including rejected/timed-out requests. A short database row lock prevents duplicate dispatches from concurrent watchdog checks.
- GitHub's `staging-recall-refresh` concurrency group serializes both the hourly schedule and watchdog runs without cancelling a running refresh. The watchdog run rechecks freshness **after** entering that group; if all feeds have recovered, it exits with `feed-refresh-skipped`.
- Dispatch is disabled by default. Missing tokens fail closed. The destination is fixed to this repository, this workflow and `main`; callers cannot supply arbitrary URLs or commands.
- `accepted` means GitHub accepted the dispatch, **not** that ingestion succeeded. Verify the workflow's per-source results and `SyncState` independently. Partial or failed feeds keep the job non-green.

The migration uses a private `recall_ops` schema, invoker-rights function, RLS and explicit privilege revocation for PUBLIC/anon/authenticated/service_role. It reads `SyncState` but does not write application tables. It does not modify purchases, household accounts, inventory, matching rules or the UI. The dispatched workflow performs the same existing refresh/rematching and never sends emails.

## Install later (operator/admin)

1. Confirm staging is `gyapgfgdynkpmrpaejmy` and the GitHub workflow contains the `supabase-watchdog` dispatch choice. The existing `STAGING_DATABASE_URL` Actions secret must remain configured.
2. Apply `ops/recall-watchdog/supabase/migrations/20261023051209_recall_refresh_watchdog.sql` to **that staging project only**, using the Supabase migration tool or SQL editor in a transaction. This installs `pg_cron`/`pg_net` if needed, the private watchdog, and its timer. Dispatch remains disabled. Do not run this through Prisma's application migrations or `db:push`. Do not blindly reapply it: existing `recall_ops` objects intentionally cause an error instead of resetting operational state. No app migrations, seed or data reset is needed.
3. Create a [fine-grained GitHub token](https://github.com/settings/personal-access-tokens/new): resource owner `soapytofu`, **only** `post-purchase-safety`, repository permission **Actions: read and write** (Metadata read is automatic). No Contents write or other repository access is needed. Set an expiry and record a rotation reminder. GitHub's [dispatch endpoint](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event) requires Actions write; a read-only token cannot trigger recovery.
4. Save the token privately as `RECALL_WATCHDOG_GITHUB_TOKEN` in ignored `.env.staging`. Do not paste it into chat, command arguments, SQL source, logs, issues or commits. Use a dedicated token, not the machine's general GitHub credential. Supabase database administrators can decrypt Vault secrets; access to the database must remain restricted. `pg_net` also temporarily holds the Authorization header in its internal HTTP queue.
5. Generate the hosted Prisma client if this checkout currently uses SQLite, then explicitly authorize storage and activation:

```sh
npm run db:hosted:generate
node --env-file=.env.staging --import tsx scripts/recall-watchdog.ts --enable --store-token --apply
```

The command validates the exact staging host/project and reads workflow metadata before storing the supplied token in [Supabase Vault](https://supabase.com/docs/guides/database/vault). That read does not prove Actions write permission; the first dispatch must verify it. Token storage and enabling are atomic. The command does not immediately dispatch or alter source freshness. `--enable` without `--apply` is a dry run; default invocation is read-only status.

## Verify before calling it operational

```sh
node --env-file=.env.staging --import tsx scripts/recall-watchdog.ts --status
```

Check all of the following:

1. The named cron job is active. Within 10 minutes, `last_checked_at` advances and recent cron runs succeed. A clock run can succeed while dispatch is `http_error`, so inspect both fields.
2. While feeds are fresh, decision is `fresh` and no HTTP request is sent. When naturally overdue (or in a disposable failure-drill environment), decision becomes `dispatch_queued`. Do not fake staging freshness timestamps or disable the working primary schedule just to force a test.
3. On a following tick, `dispatch_status` becomes `accepted` with HTTP 200/204. A numeric `run_id`, when returned by GitHub, identifies `https://github.com/soapytofu/post-purchase-safety/actions/runs/<run_id>`. These runs have event `workflow_dispatch` and display `supabase-watchdog`, **not** event `schedule`.
4. Open that run and verify FDA, USDA FSIS and CPSC individually. `pending`, `accepted`, a green SQL cron run, or a skip message alone is not evidence of a successful refresh. For a skip, verify the preceding successful refresh and current timestamps/counts.
5. Confirm the app's source health is fresh and complete, and household/purchase/inventory fingerprints remain unchanged after the recovery run.

The status command emits only operational metadata and public feed counts/timestamps, never token contents or HTTP response bodies. It does not add a public admin API. `GET /api/health` remains the public feed-health signal and returns 503 after three hours without complete fresh feeds; it does not certify the watchdog clock is working. Add an independent external uptime/alert service once a public app is deployed. No new email or pager alert service is configured by this integration.

## Failure handling and rotation

- `missing_token`: save a restricted token and use the explicit storage/enable command.
- `http_error` 401/403: check token expiry, repository selection, Actions write permission and repository Actions settings. 404 can mean workflow/repository visibility is wrong; 422 can mean the workflow input/ref is unavailable. Do not log the raw response or repeatedly force dispatch.
- `transport_error` / `response_missing`: check Supabase networking/`pg_net` and GitHub status. HTTP responses are asynchronous and unlogged, so restarts can lose responses. A missing response is not a proven failure or success. Check GitHub runs before manually retrying; normal retry waits for the hourly cooldown.
- `cooldown` or `recent_attempt`: deliberately waiting; inspect the most recent dispatch/workflow and source results.
- `last_checked_at` not advancing for over 20 minutes: check the Supabase project's availability and Cron job history. A disabled/paused database cannot recover itself.
- `accepted` but feeds still stale: inspect the run for setup errors, runner availability or source failures. An accepted dispatch cannot solve those automatically.

Rotate by replacing only `RECALL_WATCHDOG_GITHUB_TOKEN` locally and repeating `--enable --store-token --apply`. It updates the named Vault secret and preserves cooldown; verify a later real dispatch, then revoke the old token in GitHub. The management command does not infer scope from a token prefix; the operator must restrict its repository/permissions when creating it.

To stop new watchdog dispatches without changing the primary GitHub schedule:

```sh
node --env-file=.env.staging --import tsx scripts/recall-watchdog.ts --disable --apply
```

This leaves its timer, history and Vault token in place, and does not cancel already queued GitHub runs. For full removal, disable first, unschedule **only** `safekeep-recall-watchdog`, then remove its named Vault secret and revoke the dedicated GitHub token. Do not drop shared extensions or delete application data. Never schedule `/api/sync` or a local refresh alongside GitHub without a separate cross-worker lock.

## Tests

`tests/refresh-policy.test.ts` covers freshness gating and shared workflow concurrency; `tests/watchdog-config.test.ts` covers exact staging targeting and explicit mutation intent. `tests/recall-watchdog.test.ts` executes the SQL in a separate disposable PostgreSQL database, with mocked Vault/HTTP/Cron boundaries: concurrency, failure cooldown, missing/partial/stale feeds, UTC handling, privilege denial and dispatch-versus-refresh success. It is included in the PostgreSQL CI job. No test connects to staging or sends an actual dispatch.
