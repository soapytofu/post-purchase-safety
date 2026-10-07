# Opt-in recall emails

## What is implemented

- Account Settings has explicit consent, using only the server-verified sign-in email.
- New live medium/high-confidence matches create persistent outbox jobs after
  receipt/manual/CSV import or a recall refresh. Existing eligible unreviewed
  matches are queued when a user opts in. Demo notices, local pilot purchases,
  low-confidence and handled matches do not trigger email.
- One alert per recipient/purchase/authority/notice identity. Repeated refreshes
  and retries use stable deduplication keys. Notice revisions are not a new event
  yet; revision tracking and re-alerting remain a separate milestone.
- Before sending, jobs recheck consent, match status, household membership and
  authoritative Supabase account email/confirmation/deletion/ban status.
- Sender uses Resend's HTTP API; no SDK or email credentials are shipped to browsers.
- Atomic job claims, bounded batches, backoff, and stable provider idempotency keys.
  Uncertain sends stop retrying after 20 hours (provider keys expire after 24 hours).
  FAILED jobs require operator review; do not blindly reset them and resend.
- Emails include official-source links, a private alert link, confidence caveats,
  unsubscribe confirmation, and a one-click POST unsubscribe header. GET requests
  never unsubscribe users. Turning off consent cancels pending jobs; an email
  already accepted by the provider cannot be recalled.
- Provider acceptance is recorded as SENT, not proof of inbox delivery.

## Delivery is OFF until you configure it

Do not enable delivery on a localhost URL: recipients need a deployed HTTPS app.
Supabase's Auth SMTP settings send login emails, not these recall alerts.
No Resend account, sender domain, billing plan or scheduled external job was created.

Save the following privately in the hosting provider's environment settings:

```dotenv
AUTH_MODE="supabase"
APP_URL="https://YOUR-DEPLOYED-APP"
EMAIL_ALERTS_ENABLED="true"
RESEND_API_KEY="YOUR-PRIVATE-KEY"
EMAIL_FROM="SafeKeep <alerts@YOUR-VERIFIED-DOMAIN>"
SYNC_SECRET="YOUR-RANDOM-SECRET-AT-LEAST-24-CHARACTERS"
```

Never commit the actual values or put them in NEXT_PUBLIC variables. Apply the
hosted migrations with `db:hosted:deploy`, then generate the hosted client/build.
The notification table has RLS enabled and browser/API privileges revoked.
Supabase server identity checks require the server connection to read `auth.users`;
design a narrowly scoped verification mechanism when separating the privileged
bootstrap connection from a least-privilege application role before launch.

Schedule authenticated POST requests with `Authorization: Bearer <SYNC_SECRET>`:

- `/api/sync` refreshes live sources, regenerates/queues matches, and processes up
  to 10 ready email jobs. Source freshness remains independent of delivery status.
- `/api/notifications/dispatch` queues eligible matches and drains up to 10 ready
  jobs without refetching sources. Run periodically to drain backlogs/retries.
  It returns 503 while delivery is unconfigured, 207 for send failures, otherwise 200.

Only opted-in accounts receive messages; enabling the service is not user consent.
Test with two real accounts and a controlled live-notice match before wider use.
Set up SPF/DKIM/DMARC, provider bounce/complaint suppression and webhooks,
delivery monitoring, scheduler failure alerts and an operator retry procedure
before public launch. Automated bounces/complaints are not implemented yet.

## Mobile direction

The event/outbox records are channel-independent building blocks. The current
release improves responsive web controls and native browser camera capture; it
does not implement a native mobile app or push notifications. A later mobile
release needs authenticated device registration, deep links, push-token cleanup,
per-channel consent, and platform-specific camera permissions. Keep matching,
household authorization and delivery jobs on the server; reuse those contracts.

## Tests and references

Tests use temporary SQLite databases and fake delivery; they never email people.
Hosted CI checks the actual PostgreSQL migration and browser-role restrictions.
Sources: [Resend send API](https://resend.com/docs/api-reference/emails/send-email),
[idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys),
[Supabase Auth email limits](https://supabase.com/docs/guides/auth/auth-smtp),
[camera API](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).
