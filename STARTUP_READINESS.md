# SafeKeep startup-readiness plan

## Recommendation

Pursue SafeKeep as a focused private beta, not yet as a broad consumer launch. The strongest wedge is “a safety inbox for products your household actually owns,” beginning with households that have young children, caregivers, or unusually high recall sensitivity. The durable advantage is the owned-product identity graph and verified remedy history—not a generic recall-news feed.

The current application is suitable for founder use and a single-household pilot. A hosted multi-user product must not launch until identity, tenancy, durable storage, backups, and notification consent are implemented.

## What is now pilot-ready

- live FDA, USDA FSIS, and CPSC source ingestion with visible coverage status;
- browsing across food and consumer-product categories without purchase data;
- receipt photo, camera, PDF, CSV, and manual purchase capture;
- conservative, explainable matching;
- remedy and acknowledgment tracking;
- portable purchase-history export and local deletion;
- unattended sync and health endpoints for an operator-controlled deployment;
- a fail-closed network boundary that blocks household routes on non-loopback hosts;
- explicit handling of partial feeds and retained prior snapshots.

## Product wedge

Start with one promise:

> Record or scan what your household buys, then receive an explainable alert when an authoritative notice may affect it.

Do not position SafeKeep as a complete safety oracle. “No match” must always mean only that no match was found in the sources and identifiers checked.

## First 90 days

### Weeks 1–3 — private founder pilot

- Run the app daily with real household receipts.
- Review every inferred match and false positive.
- Record OCR correction rate, capture completion rate, source freshness, and time-to-remedy.
- Improve the top five receipt-description and product-identity failure patterns.
- Re-test USDA access from the intended production host.

Exit gate: at least 100 genuine purchases, reliable daily refresh, no unexplained high-confidence match, and a complete export/delete exercise.

### Weeks 4–7 — trusted household beta

- Select a managed PostgreSQL and authentication provider.
- Introduce explicit household tenancy on every private record.
- Encrypt backups and document recovery.
- Add verified email, granular notification consent, unsubscribe, delivery history, and rate limiting.
- Invite 10–15 known households; provide a direct feedback channel.

Exit gate: no cross-household access in automated tests, restore-from-backup rehearsal completed, and at least 70% of testers capture a second receipt within two weeks.

### Weeks 8–12 — narrow public beta

- Expand to 25–50 households in the initial parent/caregiver segment.
- Add product editing, merge/deduplication, household members, and notification quiet hours.
- Version notices so materially changed remedy or affected-product information can re-alert.
- Publish a plain-language privacy policy, terms, source-coverage page, and incident-response contact.
- Conduct accessibility and security review before opening self-service sign-up.

Exit gate: source freshness meets target for four weeks, high-confidence precision is manually validated, notification complaint rate is acceptable, and remedy completion is measurably higher than notice-open rate alone.

## Metrics that matter

Avoid optimizing raw account creation. Track:

- activation: first real product saved and checked;
- capture completion and OCR correction rate;
- weekly households with at least one monitored item;
- authoritative source freshness and failed-sync duration;
- potential matches per 1,000 tracked items by confidence;
- manually confirmed precision for HIGH and MEDIUM matches;
- alert open, authority-link open, and remedy completion rates;
- time from authority publication to user notification;
- export and deletion success;
- 30-day household retention.

## Business model hypothesis

Keep core household safety monitoring free during validation. Test paid value only after match quality is proven:

- household or family plan for multiple members, homes, and longer durable-product monitoring;
- caregiver or small-organization plan for childcare and property portfolios;
- retailer or manufacturer infrastructure that routes verified notices without exposing household purchase histories;
- privacy-preserving product-registration and remedy-completion tooling.

Do not monetize purchase histories through advertising or data resale; that would undermine the product’s trust advantage.

## Production architecture gate

Before public hosting:

1. Replace the single SQLite privacy boundary with authenticated household tenancy in managed PostgreSQL.
2. Add row-level authorization tests for every private read and write.
3. Separate global notices from private purchases and notification delivery data.
4. Add migrations, encrypted backups, restore drills, structured logs, error monitoring, and source-sync alerts.
5. Store receipt images only with explicit consent and a deletion/retention policy; the current browser-only image processing is the safer default.
6. Add rate limits and CSRF/origin protections around mutations and scheduled endpoints.
7. Version source notices and preserve field-level provenance.

## Go/no-go principle

Continue investing if real households repeatedly capture products and complete remedies because of SafeKeep. Stop or reposition if users only browse recall news, refuse to maintain an owned-product ledger, or matching cannot reach trustworthy precision with realistically available identifiers.
