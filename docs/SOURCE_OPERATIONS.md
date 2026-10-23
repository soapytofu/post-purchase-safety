# Recall source operations

## Coverage, not a safety guarantee

- FDA: all records currently marked `Ongoing` in the food enforcement API. This is not the FDA news/press-release stream, and excludes completed/terminated recalls. Enforcement reporting can lag announcements. Pagination must complete before the catalog is replaced.
- USDA FSIS: the full recall/public-health-alert JSON archive. Multi-value fields are arrays; translations share recall numbers, so English is preferred. If the archive is unavailable, union the official RSS feed and CDC government relay. That result is always **PARTIAL**, preserves prior records, and is never reported as complete.
- CPSC: the past two years of consumer-product recalls.

An empty, invalid, duplicate-ID, or failed response cannot erase the last snapshot. Source revisions remain append-only. Existing purchases are not edited; matching is recomputed with the existing consumer rules and surviving matches retain their review decisions. Removed current notices remain in notice history and saved business cases.

Requests retry transient transport failures, 408, 429, and 5xx up to three attempts. Retry-After is honored up to 30 seconds; longer requests are deferred to the next scheduled run. Permanent 4xx responses are not retried. Each source runs independently so one failure does not prevent the next source from refreshing.

## Hourly staging workflow

Staging activation was verified on October 23, 2026: the encrypted `STAGING_DATABASE_URL` repository secret was configured, and [manual cloud run 39898027775](https://github.com/soapytofu/post-purchase-safety/actions/runs/39898027775) completed successfully. GitHub refreshed 1,097 FDA records, 1,242 USDA notices, and 959 CPSC notices. Before/after fingerprints confirmed that household, purchase, and inventory data were unchanged (six purchases). The hourly trigger is enabled; this verification covered a manually dispatched cloud run, not yet a scheduled invocation. No credentials or additional `.env.staging` values were committed or uploaded with this documentation.

`.github/workflows/refresh-feeds.yml` runs at minute 17 every hour (UTC) on `main`, or manually using **Actions → Refresh staging recall feeds → Run workflow**. Concurrency permits only one workflow execution at a time. The runner refreshes directly against PostgreSQL, so it does not require a public deployment or an awake laptop.

**Activation requires an encrypted repository Actions secret named `STAGING_DATABASE_URL`.** Set it to the staging session-pooler PostgreSQL connection string from your private `.env.staging`. Do not paste it into source code, chat, an issue, a workflow file, or logs. `FDA_API_KEY` is an optional second Actions secret. The job intentionally fails when database configuration is missing; a committed schedule alone does not prove that automation is active.

The staging connection is privileged. Repository administrators and trusted `main` changes can cause jobs to use it: restrict repository write access, enable branch protection, and prefer a narrowly scoped ingestion database role before a public production launch. Database credentials are scoped only to the refresh step, not dependency installation, code generation, or pull-request jobs. This workflow never migrates, seeds, or sends emails. Matching may enqueue notifications for opted-in accounts; delivery remains a separate integration.

GitHub schedules are best-effort and may be delayed. Public repository schedules can be disabled after 60 days of inactivity. Verify a completed manual run and a later scheduled run in Actions; enable GitHub Actions failure notifications. Do not configure a second scheduler for the same database without coordinating concurrency.

## Monitoring and recovery

`GET /api/health` returns 503 when any required source is missing, partial, failed, empty, or has not completed a refresh in over three hours. A 200 means configured feeds are fresh, not that all real-world recalls are covered. Monitor this endpoint externally once a public deployment exists; GitHub job status alone cannot detect a disabled scheduler.

The CLI exits nonzero for partial or failed coverage, even when other sources succeeded. Logs show only source names, counts, statuses and timestamps. Detailed source failures appear in the app's **Source coverage and refresh details**. No connection URLs, API keys, household items or recipient data should be logged.

For a local operator run with the hosted Prisma client generated:

```sh
npm run db:hosted:generate
node --env-file=.env.staging --import tsx scripts/refresh-feeds.ts --apply
```

Without `--apply`, the CLI only explains what it would do. Do not run `db:push` or seed staging to fix refresh issues. A failed source keeps its last good catalog; fix credentials/connectivity/schema compatibility and rerun the job. Normalization changes can create notice revisions and reopen business cases for review.

The existing bearer-protected `POST /api/sync` remains available for a deployed-server scheduler and also handles configured email delivery. It returns 207 for partial/failed source coverage; schedulers must inspect the response, not treat every 2xx as full success. Choose one feed scheduler per database.

References: [FDA food enforcement API](https://open.fda.gov/apis/food/enforcement/), [FSIS Recall API](https://www.fsis.usda.gov/science-data/developer-resources/recall-api), [GitHub scheduled workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
