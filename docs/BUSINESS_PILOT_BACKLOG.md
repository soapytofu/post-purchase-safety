# SafeKeep Business — staged implementation backlog

October 10, 2026 · Proposed; no business features are implemented by this document.

Source of scope: [pilot specification](BUSINESS_PILOT_SPEC.md). Discovery method: [retailer interview guide](RETAILER_INTERVIEW_GUIDE.md).

## Current foundation and boundaries

Existing code provides household-scoped purchases, public notices, provider health, receipt/manual/CSV capture, deterministic matching and an opt-in email integration. Business membership, stock snapshots, durable-product model/serial matching, immutable notice revisions and response cases are new work.

The latest review added search/category consistency, receipt identifier review and safer UI behavior. It did not establish production source completeness, real email delivery, enterprise security or a business pilot. Existing launch checklists remain applicable; historical unchecked items should be independently re-verified rather than presumed completed.

Keep household routes and data intact. Build in small vertical slices with focused commits and regression tests. No production migration, external email, partner outreach, paid-service purchase or real-data enrollment follows automatically from this backlog.

## Milestone 0 — validate the wedge

**D0.1 — Discovery log.** Conduct 10–15 interviews with permission. Summarize actual examples, adequate alternatives, usable identifiers, buyers and objections. No customer personal data in research artifacts.

**D0.2 — Partner/data agreement.** Obtain three scoped design-partner commitments and approved redacted exports. Agree retention, support and pilot terms before accepting real data.

**D0.3 — Benchmark plan.** Select historical official notices and label affected/control examples. Distinguish synthetic test fixtures from permissioned real inventory. Agree how ambiguous cases will be adjudicated.

Exit: founder records go/revise/stop against the discovery gate. Engineering prototypes may use synthetic fixtures before this exit; avoid speculative POS integrations.

## Milestone 1 — isolated business workspace

**B1.1 — Organization authorization.** Introduce separate organization/membership/location domain records and server-side authorization. Do not change household ownership or make household membership confer business access.

Acceptance:

- A verified account can retain its household and explicitly enter its authorized business workspace.
- Guessed organization/location IDs and a forged client workspace are rejected.
- Owner/manager/staff permissions are enforced on the server, not just hidden in UI.
- Two-organization tests cover reads, writes, guessed IDs and exports.

**B1.2 — Invitations and navigation.** Owner invitations use hashed, expiring, single-use tokens, explicit acceptance and verified intended identity. Reject revoked/expired/reused invitations. Prevent invite-based privilege escalation. Clearly label business versus household context; switching never copies private data.

**B1.3 — Location setup.** Owner manages stable location codes; managers read existing locations. Reject cross-organization references and deletion of locations needed by unresolved/historical cases without an explicit retention-safe process.

Exit: independent tenancy/role review and migration tests on isolated local/staging databases. Never test an isolation attack with unrelated real accounts/data.

## Milestone 2 — dependable inventory import

**B2.1 — Pure CSV validation.** Implement the spec’s columns, limits, identifier preservation, quantities, timestamps and duplicate rules. Test leading zeros, quoted cells, malformed headers, over-limit files and spreadsheet-formula exports.

**B2.2 — Preview and confirmation.** Show every error with row/field references, selected locations, replacements and completeness. Confirm full-snapshot semantics. Do not silently drop invalid rows or missing identifiers.

**B2.3 — Atomic snapshots.** Persist immutable imports/snapshots and activate validated replacements atomically. Retry idempotently; failed/canceled imports retain prior stock. Existing cases retain historical row/snapshot references.

**B2.4 — Inventory screen.** Search by SKU/barcode/model, filter by location, show supported/out-of-scope rows, inventory-as-of and stale indicators. Test desktop, 390px and 320px layouts and keyboard access.

Exit: synthetic and approved redacted exports produce expected counts; repeated import never doubles stock. Two-organization import/export isolation passes.

## Milestone 3 — versioned evidence and exposure cases

**B3.1 — Notice revisions.** Preserve prior notice contents, affected-product identifiers and ingestion provenance. Implement material-change detection and explicit official closure handling. Missing feed records do not close cases.

**B3.2 — Durable-product matching.** Add verified model, serial/production-range evidence and conflict handling. Maintain existing household matching behavior under regression tests; do not indiscriminately lower its confidence thresholds.

Acceptance:

- Name-only/unknown-brand records remain ambiguous; no automatic “confirmed affected” label.
- Barcode match with missing/conflicting lot/model/serial scope asks for verification.
- Known affected examples surface; identifier conflicts and unrelated controls are handled as labeled in the benchmark.
- Results store algorithm version, input snapshot, notice revision and human-readable reasons.

**B3.3 — Evaluation jobs.** New inventory, new notices and material revisions enqueue scoped, bounded, retryable evaluation. Deduplicate case creation. A job cannot write another organization’s cases; deletion/revocation during a job is handled safely.

**B3.4 — Exposure inbox/detail.** Distinguish actionable review from insufficient-evidence candidates; show source/stock comparisons, revision changes, timestamps, stale stock and source gaps. No green “all safe” state or unlabeled demo cases.

Exit: benchmark report includes denominators, missed candidates, false alerts and unresolved labels; meet trust gate before a live partner workflow.

## Milestone 4 — response workflow

**B4.1 — Verification and tasks.** Separate human verification from operational action state. Assign active same-organization members. Require reasons for not-affected decisions; reject unauthorized staff changes and stale concurrent updates.

**B4.2 — Completion and reopening.** Record affected/removed quantities and explained differences per location. Incomplete locations/quantities keep a case unresolved. Material notice changes reopen review without erasing completed work.

**B4.3 — Activity/reporting.** Append actor/timestamp/reason events and export snapshot-pinned reports with source links and limitations. Protect against history edits and cross-organization report leakage. Exports distinguish an operational record from regulatory certification.

Exit: two partners can independently complete a historical drill. Tests cover concurrent completion, reassignment, inactive users, changed inventory and notice updates after closure.

## Milestone 5 — operational pilot launch gate

**B5.1 — Business email/outbox.** Add organization-scoped recipients/preferences and revision-aware deduplication. Revalidate membership/recipient authorization before delivery. Use an email sandbox first; real sending requires verified provider/sender configuration and explicit pilot enrollment. Retry without duplicate messages; show bounces/failure and separate acknowledgment from completion.

**B5.2 — Abuse and monitoring.** Enforce import/job/request limits, redacted logs, provider/job failure alerts and visible source outages. Separate source publication lag from internal processing lag.

**B5.3 — Retention and restore.** Implement the agreed deletion/retention policy across imports, cases, notification jobs and backups. Restore to a separate environment and verify organization boundaries. Do not promise retention that the hosting setup cannot support.

**B5.4 — Acceptance rehearsal.** Run real staging sign-in with two consented accounts/organizations; test browser/mobile, email delivery, revoked roles, expired links, failed imports, stale inventory, feed outage and recovery. Document failures rather than labeling the app public-launch ready.

Exit: founder signs a launch checklist; partners receive limitations and support expectations. No launch based only on unit tests or mocked email/OCR.

## Milestone 6 — four-week pilot and commercial decision

- Week 1: onboard, establish export cadence and run the first drill; record founder assistance.
- Week 2: observe independent review/action; investigate mismatches and missed steps.
- Week 3: repeat a changed-notice or multi-location drill and discuss buying criteria with the budget owner.
- Week 4: review outcome/cost metrics, ask for a paid continuation and choose go/revise/stop.

Extend if the evidence is insufficient. No-recall weeks are not proof of product failure or success; drills test response while ordinary weeks test inventory maintenance and operational burden.

## Implementation discipline

- One behavior or tightly coupled vertical slice per commit; keep generated artifacts/secrets/partner files out of Git.
- Preserve existing consumer data and unrelated changes; use explicit additive migrations with rollback/restore plans.
- Tests must exercise server authorization, not merely UI visibility. Run database suites with the matching generated database client and isolated fixtures.
- Gate external integrations on observed partner needs. Avoid a general product graph, mobile rewrite, marketplace, billing stack or AI risk prediction during this pilot.
- Record scope changes and disconfirming evidence. A request from one partner is not automatically a reusable product requirement.

**First engineering slice after scope confirmation:** business organization authorization and workspace navigation, using synthetic fixtures and two-organization isolation tests. Inventory import follows only after this boundary is verified.
