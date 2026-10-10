# SafeKeep Business — design-partner pilot specification

Status: proposed; not implemented or a claim of launch readiness.

Version: 0.1 · October 10, 2026

Owner: founder; proposed decisions require validation with design partners.

## 1. Company thesis and product boundary

SafeKeep connects authoritative product-safety notices with products people own and businesses stock, explains the matching evidence, and supports documented action.

Two products share notice ingestion, identity normalization and matching infrastructure:

- **Household:** purchases/owned products, private household alerts and remedy tracking.
- **Business:** inventory exposure, assigned review/removal tasks and response documentation.

They are separate private workspaces. Business customers cannot see household purchases. Consumer participation never implies consent to share purchases with a retailer. Do not build an advertising or purchase-data resale business.

Do not describe the product as detecting defects, predicting recalls, certifying safety, or guaranteeing compliance. It monitors available notices and supports verification. “None found in checked data” is not “safe.”

This specification extends the existing consumer direction in [PRODUCT_SPEC_V2.md](../PRODUCT_SPEC_V2.md); it does not replace implemented-MVP documentation or authorize a production migration.

## 2. Initial customer hypothesis

Proposed wedge: U.S. independent baby-and-children’s retailers with a small number of locations and exportable product catalogs/inventory. Begin with one or two locations per partner. Exact company size and software ecosystem remain discovery questions.

- Buyer hypothesis: owner or operations lead.
- Daily user hypothesis: store manager or designated inventory/safety lead.
- Problem hypothesis: notices arrive through disconnected channels; matching them to local stock and recording action is manual.
- Three design partners are the target, not a claimed pipeline.

Start with CPSC-regulated toys, nursery goods and relevant home products. Exclude food/formula, drugs, medical devices and vehicle equipment/car seats from the first business pilot unless the required jurisdiction/source coverage is explicitly added and verified. A retailer with mixed stock must see which items are outside scope.

If interviews reveal insufficient pain, unreliable identifiers, or satisfactory incumbent tools, revise the wedge before committing to broad integrations.

## 3. Jobs and value proposition

1. Import a real inventory export without replacing the existing inventory system.
2. Learn which stocked items may correspond to an authoritative recall.
3. See the exact model, lot, serial/date range or barcode that needs verification.
4. Assign a person to investigate and document the outcome at each location.
5. Export a clear record of the notice, evidence, decisions and completed actions.

Example: a new toy recall produces a review case for a retailer’s matching SKU. The manager checks package/model identifiers, records the affected quantity, assigns removal, and records completion. SafeKeep does not silently declare all units of that SKU recalled.

## 4. Pilot scope

### Included

- Invite-only business onboarding; explicit organization membership and roles.
- Location management and bounded CSV inventory imports with preview.
- Source freshness and inventory-as-of information on every exposure view.
- Evidence-based inventory matching and a queue for unresolved identifiers.
- Cases, assignees, documented verification and action records.
- Opt-in operational email with delivery/acknowledgment status.
- Notice revisions, case reopening and append-only activity history.
- Organization-scoped CSV/report export and a written retention/deletion policy.
- Historical drills clearly isolated from live operational cases.

### Excluded

- Native mobile applications, billing, SSO, multinational coverage and enterprise procurement features.
- Automatic inventory edits, checkout blocks, supplier communications or customer notifications.
- POS/API integrations until partners establish which system matters.
- Recall initiation/filing, legal advice, compliance certification or emergency response.
- General-news/complaint prediction, clinical advice and product-safety scores.
- Connecting business sales records to private household users.

The household app continues as a small, separate pilot; do not build two acquisition engines simultaneously.

## 5. Workflow and screens

### A. Setup

An owner names the organization, confirms supported product scope, creates locations and invites staff. Show source limitations before inventory is imported. Membership acceptance must be explicit, expiring and bound to the intended verified identity. Never join users based on a domain/name guess.

### B. Inventory import

Required CSV columns: `location_code`, `sku`, `product_name`, `quantity_on_hand`, `inventory_as_of`.

Recommended/optional: `brand`, `gtin`, `manufacturer`, `model_number`, `lot_number`, `serial_number`, `production_date`, `supplier`, `category`.

- Identifiers are strings; preserve leading zeros and original values. Store SKUs are not GTINs.
- Validate supplied GTIN length/check digit and ISO production dates; validation does not establish that a barcode belongs to the product. Preserve unknown dates as unknown.
- Accept UTF-8 CSV, up to 5 MB and 10,000 rows per pilot import; use queued processing if request limits require it. Limits are proposed and must be load-tested.
- Quantity is a nonnegative whole number for the initial discrete-goods pilot. Reject fractional, negative and invalid values rather than guessing.
- Require ISO inventory timestamps with an explicit timezone. Flag future timestamps and reject timestamps more than five minutes ahead of server time.
- Permit missing brand/model/GTIN but expose insufficient evidence. Do not fabricate these fields.
- Preview mapped columns, valid/rejected rows, locations, changes and identifier completeness before confirmation.
- Imports are complete snapshots for explicitly selected locations, not incremental deltas. State this prominently. Missing rows disappear from current stock only after a validated replacement is confirmed.
- Reject duplicate stock keys within the file; do not silently add quantities. Stock key: location + SKU + supplied lot/serial bucket. Distinct variants must use distinct SKUs or be corrected before import.
- Do not replace a location snapshot when any row for that location is invalid. The user must correct the file; accepted/rejected behavior cannot be ambiguous.
- Same file/content re-submission is idempotent. Failed processing preserves the prior snapshot.
- Pin cases and reports to the snapshot used. Later imports never rewrite historical evidence.
- Render raw imported strings as text and neutralize spreadsheet formulas in exports.

### C. Inventory dashboard

Show unresolved cases, potentially exposed stock/locations, open tasks, latest inventory timestamps and source coverage. Never label all inventory “healthy” or use an unexplained green safety score.

Pilot inventory freshness default: 24 hours, configurable per partner with a visible rationale. Older snapshots are historical exposure estimates, not assertions about current shelf quantities. Do not silently drop alerts because inventory is stale.

### D. Case detail

Side-by-side source and inventory identifiers; source URL, publication/update timestamps, revision, matching reasons/conflicts, locations and snapshot quantities. Explicitly state missing lot/serial information and source gaps.

Separate three things:

1. **System evidence:** potential match or insufficient identifiers; never an unexplained probability.
2. **Human verification:** pending, affected identifiers confirmed, or not affected with a reason.
3. **Operational action:** unassigned, assigned, in progress, completed or reopened.

A numerical matching score is not the probability that the product is dangerous. An exact barcode can identify a product family without identifying the affected lot.

### E. Action and completion

Assign an active organization member and location. Record affected quantity, quarantined/removed quantity, timestamp, actor, source-prescribed action and a short note. Evidence attachments are optional and deferred from the first implementation; notes must not contain customer personal data.

- Reconcile quantities or explain the difference (sold, not found, transferred, already removed).
- Completion requires a verification decision and a recorded outcome; opening an email is not completion.
- Record unresolved affected units visibly. Do not mark a case fully resolved while a location or quantity remains unexplained.
- Managers can reopen a case. Corrections append an event rather than editing history invisibly.
- No-match decisions require a reason and the identifier checked.

## 6. Matching and notice requirements

The current consumer matcher is a reusable starting point, not a validated durable-goods inventory matcher. Add structured model/serial/production-date support before claiming coverage for recalls defined by those identifiers.

- Match official affected-product entries, not merely an entire notice headline.
- Exact brand + model is a review candidate; a broad name/category alone is a low-evidence review candidate, not proof of affected stock.
- UPC/model conflicts must be visible; lot/serial conflicts prevent a confirmed-affected assertion for that unit.
- Unknown identifiers remain unknown. Unknown brands must not match one another as evidence.
- Preserve the authoritative notice and normalized affected identifiers with each revision.
- New notices and material scope/action changes trigger evaluation of supported current inventory. New imports also trigger evaluation against applicable available notices.
- Material updates reopen affected cases for review without erasing earlier actions. Cosmetic changes do not spam recipients.
- A disappearing source record is not evidence that a recall ended. Closure/withdrawal needs explicit authoritative evidence.
- Retried jobs are idempotent by organization, stock reference, notice revision and event type.
- Keep one case per organization + location + stock key + authoritative notice. Evaluate revisions and snapshots as separate idempotent events within that case; do not create another open case for every import or wording change.

Do not promise a real-time SLA initially. Proposed pilot operation: hourly source checks, visible failures, and notification within 15 minutes of a successful applicable ingestion/import. Measure publication-to-ingestion and ingestion-to-alert separately; a source outage must not vanish inside the latter metric.

## 7. Private data boundaries and proposed entities

Conceptual entities, not an approved schema migration:

- `Organization`, `OrganizationMembership` and `Location`.
- `InventoryImport`, `InventorySnapshot`, `InventoryStockRow` and product identifier evidence.
- Global `NoticeRevision` and `AffectedProduct` records derived from public sources.
- Organization-private `ExposureCase`, `Verification`, `ResponseTask` and `CaseEvent`.
- Organization-private notification outbox/delivery records.

Keep household `Purchase` and business stock separate. Do not stretch the current one-household membership into business authorization. A verified user may eventually have household and business memberships, with an explicit workspace switch.

Every business read, write, export, background job and notification resolves its organization from verified membership, not a client-supplied organization ID alone. Location and assignee references must belong to that same organization. Shared public notices must contain no private inventory annotations.

### Pilot roles

| Role | Permissions |
| --- | --- |
| Owner | Manage members/settings, import inventory, perform response work, export, request deletion |
| Manager | Import inventory, assign/review/complete tasks, export operational reports; no ownership/member changes |
| Staff | Read organization cases and work assigned tasks; no imports, bulk export or member changes |

Staff access is organization-wide in the pilot; location-scoped permissions are explicitly not promised. Invitations cannot grant owner status. Ownership transfer is an explicit, separately verified operation.

Proposed retention: inventory snapshots and case evidence for 90 days during the pilot, with advance review before expiration; longer retention requires written agreement and appropriate controls. This is not a legal retention recommendation. Finalize policy, backup retention, exports and deletion behavior before accepting real partner data. Restrict founder support access, log it and obtain partner authorization.

## 8. Notifications and operational readiness

- Business owners configure operational recipients and staff accept notification preferences. Do not reuse consumer email consent for business messages.
- Separate sent/delivered/bounced/acknowledged/action-completed states.
- In-app cases remain available if email fails; show failure to the responsible manager.
- Deduplicate retries; record provider IDs and attempts without logging private inventory or tokens.
- Pilot escalation reminders: configurable, default one reminder after 24 hours; suspend on completed tasks. Do not claim emergency paging or 24/7 support.
- Validate real email, two-organization isolation, backups/restore, abuse limits and monitoring before external pilot activation.

## 9. Validation gates and metrics

Targets below are decision hypotheses, not evidence or safety guarantees.

### Discovery gate

Interview 10–15 qualified retailers. Proceed when at least three agree to a scoped pilot, one identifiable buyer per partner participates, and partners can provide permissioned redacted inventory plus examples of real recall handling. Record refusals and adequate existing solutions too.

### Data and trust gate

- Create a labeled benchmark of at least 30 distinct historical notices, including at least 10 known affected examples, unrelated controls, near-name matches, identifier conflicts and incomplete records.
- Run separate mixed-inventory drills with each partner. Synthetic fixtures test mechanics; they do not count as evidence of real-world accuracy.
- All deliberately affected, in-scope examples with sufficient identifiers must surface for review. Any miss blocks expansion until explained and corrected.
- Target at least 90% relevant results in the actionable queue, reporting numerator/denominator and uncertainty. Keep ambiguous low-evidence candidates in a separate queue and measure them; do not hide them to inflate precision.
- Review benchmark labels against official notices and with partners. Publish missing/unsupported cases and sampling limitations.
- Two organizations cannot access or mutate one another through pages, actions, exports, invitations, background jobs or guessed IDs.

### Workflow and commercial gate

Run a proposed four-week, three-partner pilot, extending if event volume is insufficient. Use historical drills rather than relying on a new recall occurring.

- Target first validated inventory import within 30 minutes, with founder assistance measured separately.
- At least two partners independently complete a drill from review through documented action.
- Track actionable false alerts, unresolved identifiers, inventory/source freshness, alert lag, acknowledgment time, completion time and founder support hours.
- Seek at least two partners willing to continue at a stated price with a named budget owner and concrete next step. A survey “yes” is weaker than a paid extension.

Test a founder-assisted pilot price hypothesis of $100–$300 per organization/month for up to two locations; this is not competitor pricing or a finalized offer. Track infrastructure, enrichment, email and support costs before choosing a sustainable price. Do not charge until scope, limitations, terms and delivery are agreed.

## 10. Go / revise / stop

- **Go:** buyers demonstrate repeated operational pain; permitted inventory is usable; drills meet trust/workflow gates; partners commit to a paid continuation.
- **Revise:** value exists but the vertical, data capture, workflow or pricing assumptions fail. Narrow scope or change the wedge.
- **Stop expanding:** customers already solve this adequately, cannot maintain usable inventory, or do not value the service enough to sustain delivery costs.

Do not interpret interview enthusiasm, total recall counts, website traffic or an attractive dashboard as product-market fit.

## 11. Reference context

- [CPSC retailer responsibilities](https://www.cpsc.gov/FAQ/Retailers-Product-Safety-and-Your-Responsibilities): background for discovery, not a substitute for legal advice.
- [FDA Enforcement Report definitions](https://www.fda.gov/safety/enforcement-reports/enforcement-report-information-and-definitions): explains why public warnings can precede enforcement-report publication; relevant to later food expansion.
- [Recall InfoLink](https://www.recallinfolink.com/): existing recall-response workflows; not proof of an underserved segment.

Related: [retailer interview guide](RETAILER_INTERVIEW_GUIDE.md) · [implementation backlog](BUSINESS_PILOT_BACKLOG.md).
