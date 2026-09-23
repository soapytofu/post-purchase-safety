# SafeKeep Product Specification — Multi-Source Consumer Safety Network

**Status:** Proposed v2 product direction  
**Audience:** Product, engineering, design, data, operations, and early pilot partners  
**Relationship to `SPEC.md`:** `SPEC.md` remains the source of truth for the implemented MVP. This document specifies the next product generation and is not a claim that the described functionality already exists.

---

## 1. Executive summary

SafeKeep is a privacy-conscious post-purchase safety network. It creates a lightweight record of products a person or household actually owns, continuously compares those records with authoritative recalls and safety notices, and routes relevant, explainable notices to the affected owner.

The product serves two related but technically different domains:

1. **Food and consumables:** packaged food, beverages, supplements, pet food, meat, poultry, and egg products. Matching often depends on GTIN/UPC, lot or batch, best-by/use-by dates, purchase date, and distribution geography.
2. **Durable consumer products:** appliances, electronics, batteries, furniture, toys, baby products, tools, and other household goods. Matching often depends on brand, model, serial number, production date, retailer, and long ownership periods.

The central product challenge is not obtaining a list of recalls. Government data is fragmented but generally available. The challenge is producing a trustworthy connection between a notice and a specific product instance without overstating certainty.

SafeKeep must therefore optimize for:

- complete and fresh source coverage;
- precise product identity capture;
- category-specific matching;
- explicit conflict and uncertainty handling;
- clear source provenance;
- actionable remedy tracking;
- privacy-preserving data architecture.

SafeKeep must never imply that “no match found” means “safe.” It reports only what was checked, when it was checked, which sources were covered, and what evidence supports or contradicts a potential match.

---

## 2. Product thesis

### 2.1 Problem

Consumers usually encounter recalls through regulator websites, news articles, retailer emails, manufacturer announcements, or social media. These channels broadcast notices broadly but rarely maintain a durable, cross-retailer connection between:

- the product notice;
- the exact affected identifiers;
- the consumer's purchase or owned product;
- the remedy the consumer completed.

Retailers may notify loyalty-program customers, manufacturers may notify registered owners, and vehicle owners commonly receive direct notices. Coverage is inconsistent outside those closed systems, especially for second-hand goods, gifts, marketplace purchases, paper receipts, and purchases spread across multiple retailers.

### 2.2 Core value proposition

> Record a product once. SafeKeep monitors trusted sources, explains any potential match, and helps the owner verify and complete the remedy.

### 2.3 Strategic insight

Recall feeds are inputs, not the product moat. Durable value comes from:

- purchase and ownership capture across retailers;
- product identity resolution across inconsistent identifiers;
- lot/model/serial extraction from packaging and labels;
- source normalization and version history;
- conservative, auditable matching;
- remedy completion workflows;
- privacy and user trust.

---

## 3. Product principles

1. **Trust before coverage.** Missing a weak match is preferable to issuing an alarming unsupported claim.
2. **Evidence, not opaque probability.** Confidence labels describe evidence quality; percentages must not imply calibrated risk probabilities.
3. **Authority and inference remain separate.** The source says what was recalled. SafeKeep says why an owned product may or may not correspond.
4. **Absence of evidence is not evidence of safety.** Every negative state identifies checked sources, freshness, and identifier limitations.
5. **Different products require different matching rules.** Food lots and durable-product model numbers cannot share one undifferentiated scoring scheme.
6. **The consumer stays in control.** Users review extracted information before saving and decide whether to enable notifications or integrations.
7. **Purchase history is sensitive.** Do not sell it, use it for advertising, or expose it to data providers.
8. **Remedy completion is part of safety.** Notification alone is not success; return, repair, replacement, refund, disposal, or monitoring must be trackable.
9. **Source limitations are product information.** Coverage gaps, stale feeds, and provider errors must be visible rather than silently hidden.

---

## 4. Goals and non-goals

### 4.1 v2 goals

- Cover authoritative U.S. food and consumer-product recall sources.
- Build a canonical, versioned safety-notice repository.
- Capture products through barcode/2D-code scanning, label OCR, receipt import, and manual entry.
- Represent product identity at family, SKU, batch/lot, and serial-instance levels.
- Provide category-specific, deterministic matching with minimum-evidence gates.
- Let users browse all synchronized notices, not only matched notices.
- Send opt-in notifications for new or materially changed actionable matches.
- Show purchased and recalled identifiers side by side.
- Track verification and remedy outcomes.
- Provide product edit, delete, export, merge, and retention controls.
- Measure real-world matching precision and source coverage during a pilot.

### 4.2 Explicit non-goals for v2

- Declaring a product definitively safe.
- Diagnosing illness or giving medical advice.
- Predicting future recalls using adverse-event or news data.
- Automatically contacting manufacturers or submitting claims without user review.
- Restaurant ingredient and supplier-chain traceability.
- Payment-card or bank-transaction ingestion.
- Selling or advertising against purchase history.
- International regulatory coverage beyond a documented pilot jurisdiction.
- Using general news articles as equivalent to authoritative recall notices.
- Replacing regulator, manufacturer, retailer, clinician, or emergency guidance.

---

## 5. Target users and jobs to be done

### 5.1 Primary initial user

A safety-conscious U.S. household that owns a mix of packaged food and durable goods, especially households with young children, older adults, allergies, or other reasons to care about timely product notices.

### 5.2 Secondary users

- caregivers managing products across multiple homes;
- parents tracking baby products, toys, and car seats;
- people furnishing a home or managing rental properties;
- small childcare organizations or community groups;
- users managing products purchased second-hand or received as gifts.

### 5.3 Core jobs

- “Tell me whether something I own may be included in a newly published recall.”
- “Show me exactly which identifiers I need to check.”
- “Help me understand whether the match is strong, incomplete, or contradicted.”
- “Tell me what the authority or recalling firm says I should do.”
- “Remember whether I returned, repaired, replaced, discarded, or kept monitoring it.”
- “Let me correct, export, or remove my product history.”

---

## 6. Product taxonomy and identity model

### 6.1 Identity levels

SafeKeep must distinguish four levels:

| Level | Meaning | Examples |
| --- | --- | --- |
| Product family | Broad product line | “Acme Air Fryer” |
| Trade item / SKU | Specific sellable configuration | 6-quart black model, GTIN `00012345678905` |
| Batch / lot | Production group | Lot `ABC123`, best-by `2026-11-15` |
| Serialized instance | One physical unit | Serial `SN4K92...`, VIN |

Matching must not silently collapse these levels. A family-level name match cannot substitute for a contradictory SKU, lot, model, or serial identifier.

### 6.2 Canonical identifiers

All GTIN variants must normalize to a canonical 14-digit representation while retaining the original scanned value:

- UPC-A / GTIN-12;
- EAN-13 / GTIN-13;
- GTIN-14;
- UPC-E after validated expansion;
- GS1 Digital Link GTIN.

Check digits must be validated. Invalid identifiers remain visible but are excluded from exact-identifier evidence until corrected.

Additional identifier types:

- brand owner and normalized brand aliases;
- manufacturer and recalling firm;
- retailer SKU and receipt description;
- product model and model family;
- lot/batch/date code;
- serial number;
- production, pack, sell-by, best-by, use-by, and expiration dates;
- GS1 consumer product variant;
- NDC/UDI/VIN only when the supported product category requires them.

### 6.3 Food-specific identity

Food identity should prioritize:

1. canonical GTIN;
2. brand and exact product variant;
3. package size/count;
4. lot/batch code;
5. printed date type and value;
6. establishment number where relevant to USDA-regulated products;
7. purchase date and retailer;
8. distribution geography.

A food purchase may represent multiple units. The record must support quantity, consumed/discarded state, and an optional “likely no longer owned” date.

### 6.4 Durable-product identity

Durable goods should prioritize:

1. exact model number;
2. serial number or affected serial range;
3. UPC/GTIN;
4. manufacturing date or date-code range;
5. brand/manufacturer;
6. product description and variant attributes;
7. retailer and purchase window;
8. product photograph and label photograph for user verification.

Durable products remain monitored until explicitly removed, transferred, discarded, or marked no longer owned.

### 6.5 GS1 Digital Link

When a 2D code contains GS1 Application Identifiers, SafeKeep should parse and preserve the full compound identity. Relevant qualifiers include GTIN (AI 01), batch/lot (AI 10), expiration date (AI 17), serial number (AI 21), and consumer product variant (AI 22). This can provide substantially stronger evidence than a one-dimensional UPC alone.

---

## 7. Source and data strategy

### 7.1 Source hierarchy

Every ingested item must have a source tier:

| Tier | Source type | Product treatment |
| --- | --- | --- |
| A | Government regulator or official recall database | Eligible to generate safety alerts |
| B | Manufacturer or retailer official notice | Eligible after identity, provenance, and notice validation |
| C | Reputable secondary reporting | Creates an unverified safety signal, never an authoritative recall alert |
| D | Social/user report | Research queue only; never automatically shown as a recall |

### 7.2 Initial authoritative source matrix

| Provider | Scope | Important fields | Expected use | Known limitations |
| --- | --- | --- | --- | --- |
| FDA Recalls, Market Withdrawals & Safety Alerts | Selected public-facing FDA announcements across food, drugs, supplements, pet food, and other regulated products | brand, product description, reason, company, date, linked announcement | Fast consumer-facing notice and remedy content | Not every FDA-monitored recall receives a public announcement |
| openFDA Food Enforcement | Classified food enforcement records | recall number, product description, firm, classification, code information, dates, distribution, status | Completeness and lifecycle reconciliation | Updated on an enforcement cadence; not every record is an urgent public warning; fields are semi-structured |
| USDA FSIS Recall API | Meat, poultry, processed egg products, and public-health alerts | establishment, products, labels, classification, distribution, announcement, dates | Authoritative USDA-regulated food coverage | Provider-specific identifiers and HTML-rich fields require normalization |
| CPSC Recall API | Durable consumer products | recall number, product, description, model, UPC, hazard, remedy, retailer, manufacturer, images, contact, date | Primary durable-product source | Model/UPC population varies; remedy information can change after publication |
| NHTSA Recall API | Vehicles and vehicle equipment | make, model, model year, campaign, component, consequence, remedy | Later vertical or partner integration | Vehicle identity and owner-notice ecosystem differ substantially from household goods |

### 7.3 Source expansion after initial launch

- manufacturer recall and safety-notice pages;
- retailer recall pages and verified customer-notification partnerships;
- FDA device and drug recall datasets where the user experience and compliance posture are appropriate;
- warranty, firmware, and product-maintenance notices as a distinct notice type;
- international authorities only behind jurisdiction-specific configuration.

### 7.4 News and web monitoring

General news must be isolated from authoritative recalls.

A news article can create a `SafetySignal` with:

- publisher and canonical URL;
- publication and observed timestamps;
- named products/brands/companies;
- extracted alleged hazard;
- citations to any regulator, manufacturer, or primary document;
- corroboration count;
- verification state: `UNVERIFIED`, `CORROBORATED`, `PROMOTED_TO_NOTICE`, `DISMISSED`.

News signals must not:

- produce HIGH-confidence recall alerts;
- be described as formal recalls without a primary source;
- copy full copyrighted article text;
- bypass publisher access restrictions;
- trigger urgent language based only on entity similarity.

The operations workflow should attempt to resolve a signal to an official regulator/manufacturer notice. Users may optionally browse corroborated signals in a clearly separate “Developing safety information” surface.

### 7.5 Coverage ledger

SafeKeep must maintain a machine-readable coverage ledger:

- provider;
- jurisdiction;
- categories covered;
- earliest and latest source timestamps held;
- last sync attempt;
- last successful sync;
- source-reported update timestamp;
- pages/records expected and received;
- cursor or checkpoint;
- validation failures and quarantined records;
- whether the snapshot is complete, partial, delayed, or unavailable.

User-facing negative results must reference this ledger.

### 7.6 Ingestion correctness

Each provider implementation must support:

1. paginating or cursoring through the complete configured scope;
2. idempotent upsert by provider and external ID;
3. raw immutable payload retention or content-addressed archive;
4. normalized notice versioning;
5. schema validation and quarantine rather than silent dropping;
6. retry with exponential backoff for transient failures;
7. rate-limit handling and provider-specific budgets;
8. staged synchronization;
9. atomic promotion of a complete staged snapshot;
10. deletion/termination only when the provider explicitly reports it or a complete snapshot proves absence under documented semantics;
11. change detection for materially updated identifiers, hazard, classification, distribution, or remedy;
12. observable metrics and operator alerts.

A partial page must never be treated as a complete provider snapshot.

---

## 8. Product capture and ownership workflows

### 8.1 Capture methods

The product should support, in recommended order:

1. **Barcode or 2D-code scan:** fastest path to a validated GTIN and possible lot/serial/date qualifiers.
2. **Product-label scan:** OCR-assisted capture of model, serial, lot, date code, size, and establishment number.
3. **Receipt photo/import:** extracts retailer, purchase date, line-item description, quantity, and price; asks the user to resolve ambiguous products.
4. **Electronic receipt forwarding/import:** opt-in and scoped; never request unrestricted inbox access for the initial product.
5. **CSV import:** strict schema plus error recovery and duplicate review.
6. **Manual entry:** permits unknown fields and clearly shows what evidence is missing.
7. **Retailer or loyalty integration:** partner-driven later phase with explicit consent and revocation.

### 8.2 Capture confirmation

All automated extraction must enter a review screen showing:

- captured image or receipt snippet;
- extracted value;
- extraction confidence;
- source of the value;
- validation state;
- editable correction;
- fields still needed for high-quality matching.

Do not silently turn OCR output into exact-match evidence.

### 8.3 Food capture flow

1. Scan UPC or GS1 2D code.
2. Resolve or enter brand, variant, size, and category.
3. Prompt for lot and date only when useful and show where they are commonly printed.
4. Record purchase date, retailer, quantity, and optional state/region.
5. Assign ownership horizon based on food type, with user override.
6. Run matching and report source coverage/freshness.

The app should permit a receipt-first workflow for speed, then send a local reminder to capture lot/date details for products that cannot be precisely monitored without them.

### 8.4 Durable-product capture flow

1. Scan barcode or product label.
2. Resolve brand, product type, exact model, variant, and UPC.
3. Prompt for serial/date code where relevant.
4. Record purchase date, retailer, condition, and whether purchased new/used/gifted.
5. Store optional product/label photos.
6. Monitor indefinitely until ownership ends.

### 8.5 Purchase management

Users must be able to:

- edit any field and see why it affects match quality;
- add identifiers later;
- merge likely duplicates;
- split a multi-quantity purchase into different disposition states;
- mark consumed, transferred, returned, discarded, lost, or no longer owned;
- delete one record;
- bulk-delete by date/category/source;
- export all data in a documented portable format;
- undo recent imports;
- review an import before it becomes active.

---

## 9. Notice catalog

SafeKeep requires a dedicated `/notices` experience independent of the user's matches.

### 9.1 Catalog capabilities

- Search product, brand, company, model, UPC/GTIN, lot, recall number, hazard, and retailer.
- Filter by authority, source tier, category, jurisdiction, publication date, severity/classification, lifecycle status, and live/demo state.
- Show last source update and SafeKeep ingestion time.
- Distinguish announcement date, recall initiation date, regulator publication date, and last update.
- Display notice version history and material changes.
- Display affected identifiers, distribution, images, remedy, consumer contact, and primary source.
- Allow a user to add the recalled product to their ledger for verification.

### 9.2 Notice lifecycle

Normalized lifecycle values:

- `PUBLISHED`
- `ACTIVE`
- `UPDATED`
- `EXPANDED`
- `REMEDY_CHANGED`
- `TERMINATED`
- `ARCHIVED`
- `UNKNOWN`

Provider-specific states must be preserved alongside normalized states. Terminated does not mean the product is now safe to use; UI copy must follow the authority's meaning.

---

## 10. Matching system

### 10.1 Output states

Replace the current probability-like model with evidence states:

| State | Meaning | User-facing treatment |
| --- | --- | --- |
| `EXACT` | Exact product identifier plus required affected qualifier(s), with no conflict | Urgent potential match; verify notice and act |
| `STRONG` | Exact SKU/model or highly specific product identity, but a required lot/serial/date is unavailable | Potential match; inspect package/product |
| `REVIEW` | Meaningful product-name/model evidence but insufficient identifiers | Review quietly; no confirmed-recall language |
| `CONFLICT` | Product resembles notice but one or more explicit identifiers exclude or contradict it | Show conflict and explain why it is probably not the affected instance; do not count as actionable by default |
| `NO_MATCH` | No qualifying evidence among checked notices | “No potential match found in checked sources” |
| `NOT_CHECKED` | Sources stale/unavailable or record lacks minimum product identity | Prompt for identifiers or retry |

An internal numeric evidence score may support ordering, but it must be labeled “evidence score,” not “confidence percentage,” unless empirically calibrated.

### 10.2 Universal minimum-evidence gates

No alert may be created solely from brand, category, retailer, geography, or date overlap.

At least one must be present:

- exact canonical product identifier;
- exact normalized model;
- exact lot/serial with compatible product identity;
- strong product-name/variant similarity including at least one discriminating token.

Generic tokens such as “salad,” “battery,” “toy,” “bread,” “charger,” or category labels cannot be discriminating evidence alone.

### 10.3 Food matching rules

Candidate retrieval:

- canonical GTIN overlap;
- brand + discriminating product-name tokens;
- establishment number where applicable;
- retailer/private-label mapping;
- category only as a blocking expansion, never final evidence.

Evidence evaluation:

- exact GTIN is strong product evidence;
- exact affected lot/date is required for `EXACT` when the notice lists lots/dates;
- missing lot/date caps the result at `STRONG`;
- explicit lot/date mismatch produces `CONFLICT` even with exact GTIN, unless the notice explicitly states broader coverage;
- package-size mismatch is a conflict when size identifies an affected variant;
- purchase outside plausible distribution/shelf-life windows lowers or blocks actionability;
- geography can support or contradict but cannot create a match by itself.

### 10.4 Durable-product matching rules

Candidate retrieval:

- exact model number or explicitly enumerated model range;
- UPC/GTIN overlap;
- brand + product line + discriminating attributes;
- serial range or manufacture-date range.

Evidence evaluation:

- exact affected model plus compatible serial/date produces `EXACT`;
- exact model with missing serial/date produces `STRONG` if the notice requires inspection;
- serial or manufacture-date exclusion produces `CONFLICT`;
- UPC alone may identify a SKU but not a recalled production subset;
- product photographs may aid user verification but do not independently produce exact evidence.

### 10.5 Entity resolution

Resolution should be staged:

1. normalize and validate structured identifiers;
2. apply brand/manufacturer alias graph;
3. normalize units, counts, model punctuation, and common receipt abbreviations;
4. retrieve candidates with exact and token indexes;
5. apply vertical-specific deterministic rules;
6. optionally use an ML/LLM extraction or ranking model only as non-authoritative assistance;
7. apply minimum-evidence and conflict gates;
8. write an immutable match evaluation containing rule version and evidence.

LLM output must never override an explicit identifier conflict.

### 10.6 Explainability contract

Every match view must show:

- the user's product and identifiers;
- the authority's affected product and identifiers;
- exact agreements;
- missing identifiers;
- explicit conflicts;
- date and geography checks;
- source, publication date, last update, and lifecycle status;
- the matching-rule version;
- what the user should inspect next.

---

## 11. Alerts and remedy workflow

### 11.1 Inbox defaults

- Default to unresolved, actionable matches.
- Sort `EXACT`, then `STRONG`, then `REVIEW`; within each group sort by authority severity and newest material update.
- Hide `CONFLICT` from the default urgent inbox but retain it in history.
- Provide source, category, and status filters.
- Clearly mark demo data and exclude it from production counts.

### 11.2 Alert lifecycle

Suggested states:

- `NEW`
- `OPENED`
- `IDENTIFIERS_NEEDED`
- `VERIFIED_AFFECTED`
- `VERIFIED_NOT_AFFECTED`
- `ACTION_PLANNED`
- `RETURNED`
- `REFUNDED`
- `REPAIRED`
- `REPLACED`
- `DISCARDED`
- `TRANSFERRED_NOTICE`
- `DISMISSED`
- `REOPENED`

State changes must be timestamped and auditable. A material notice update can reopen a previously resolved alert when the affected scope or remedy changes.

### 11.3 Remedy support

Display authoritative remedy instructions verbatim only within copyright and source-use limits; otherwise provide a faithful short summary and primary link.

Support:

- consumer-contact details;
- remedy deadline if provided;
- proof requirements such as receipt, serial, label, or destruction photograph;
- notes and optional local attachments;
- reminders;
- outcome and completion date;
- refund/replacement value where the user chooses to record it.

SafeKeep must not claim a remedy is guaranteed.

---

## 12. Notifications and freshness

### 12.1 Notification eligibility

Notifications are opt-in and may be sent when:

- a new `EXACT` or `STRONG` match is created;
- a notice expands to cover a previously excluded product;
- severity or remedy materially changes;
- an authority publishes an urgent update;
- the user requested a reminder to inspect identifiers or complete a remedy.

`REVIEW`, `CONFLICT`, news signals, and demo matches do not trigger urgent push/SMS by default.

### 12.2 Channels

Phased channels:

1. in-app inbox and badge;
2. email;
3. web/mobile push;
4. SMS only for explicit high-urgency opt-in.

Every notification includes the product, evidence state, source authority, action summary, and deep link. Avoid revealing sensitive product information on lock screens unless the user enables detailed previews.

### 12.3 Freshness states

Global and provider-level states:

- `CURRENT`
- `DELAYED`
- `PARTIAL`
- `FAILED`
- `NEVER_SYNCED`

Show last attempt separately from last success. A failed refresh must not overwrite the previous successful snapshot.

---

## 13. Detailed data model

### 13.1 `Household`

```text
id
name
jurisdictionCountry
jurisdictionRegion
createdAt
updatedAt
```

### 13.2 `OwnedProduct`

```text
id
householdId
domain                 FOOD | DURABLE | VEHICLE | OTHER
ownershipStatus
productName
brand
manufacturer
category
variant
packageSizeValue
packageSizeUnit
quantity
retailer
purchaseDate
purchaseRegion
condition              NEW | USED | GIFT | UNKNOWN
source
sourceReference
consumedOrEndDate
createdAt
updatedAt
```

### 13.3 `ProductIdentifier`

```text
id
ownedProductId
type                   GTIN | UPC | EAN | MODEL | SERIAL | LOT | DATE_CODE |
                       ESTABLISHMENT | RETAILER_SKU | NDC | UDI | VIN | OTHER
rawValue
normalizedValue
qualifierType
validationStatus       VALID | INVALID | UNVERIFIED
captureMethod          SCAN | OCR | RECEIPT | IMPORT | MANUAL | PARTNER
extractionConfidence
createdAt
```

### 13.4 `ProductDate`

```text
id
ownedProductId
type                   PRODUCTION | PACK | SELL_BY | BEST_BY | USE_BY |
                       EXPIRATION | PURCHASE
dateValue
rawValue
precision              DAY | MONTH | YEAR | RANGE | UNKNOWN
```

### 13.5 `SourceProvider`

```text
id
name
authority
tier
jurisdiction
categories
termsUrl
enabled
createdAt
updatedAt
```

### 13.6 `ProviderSyncRun`

```text
id
providerId
startedAt
completedAt
status                 RUNNING | SUCCEEDED | PARTIAL | FAILED
cursorStart
cursorEnd
expectedRecords
receivedRecords
acceptedRecords
quarantinedRecords
errorCode
errorSummary
snapshotId
```

### 13.7 `SafetyNotice`

```text
id
providerId
externalId
noticeType             RECALL | SAFETY_ALERT | MARKET_WITHDRAWAL |
                       PUBLIC_HEALTH_ALERT | WARRANTY | FIRMWARE | MAINTENANCE
sourceTier
authority
jurisdiction
headline
fullProductDescription
hazardSummary
classification
normalizedLifecycle
providerLifecycle
publicationDate
recallInitiationDate
lastSourceUpdate
distributionText
recommendedActionSummary
consumerContact
sourceUrl
isDemo
currentVersionId
createdAt
updatedAt
```

### 13.8 `SafetyNoticeVersion`

```text
id
safetyNoticeId
versionNumber
contentHash
rawPayloadReference
normalizedPayload
changeTypes
observedAt
sourceUpdatedAt
```

### 13.9 `AffectedProduct`

```text
id
safetyNoticeVersionId
productName
brand
manufacturer
category
variant
packageSize
distributionText
```

### 13.10 `AffectedIdentifier`

```text
id
affectedProductId
type
rawValue
normalizedValue
rangeStart
rangeEnd
inclusionMode          INCLUDE | EXCLUDE | INSPECT
```

### 13.11 `MatchEvaluation`

```text
id
ownedProductId
safetyNoticeVersionId
state                  EXACT | STRONG | REVIEW | CONFLICT | NO_MATCH | NOT_CHECKED
evidenceScore
ruleVersion
agreements
missingEvidence
conflicts
explanation
evaluatedAt
supersedesId
```

### 13.12 `Alert`

```text
id
ownedProductId
safetyNoticeId
currentMatchEvaluationId
status
firstCreatedAt
lastMaterialChangeAt
openedAt
resolvedAt
resolutionNotes
```

### 13.13 `AlertEvent`

```text
id
alertId
eventType
fromStatus
toStatus
metadata
createdAt
```

### 13.14 `SafetySignal`

```text
id
sourceUrl
publisher
publishedAt
observedAt
headline
summary
entities
primarySourceLinks
verificationState
contentHash
```

---

## 14. Core product surfaces

### 14.1 Dashboard

Show:

- products actively monitored;
- actionable unresolved matches;
- products needing identifiers;
- new/changed notices since last visit;
- source coverage and freshness;
- live versus demo data;
- recent remedy progress.

Do not label a product “clear.” Preferred language:

> No potential match found in 4 checked authoritative sources as of Sep 23, 2026. Lot number not provided.

### 14.2 My Products

- search/filter by domain, ownership, identifier completeness, source, and alert state;
- edit and delete;
- merge duplicates;
- show monitoring quality: `Precise`, `Product-level only`, `Needs lot`, `Needs model`, `Not checked`;
- expose last evaluation time and source coverage.

### 14.3 Safety Inbox

- unresolved by default;
- exact evidence first;
- side-by-side comparison;
- clear next inspection step;
- remedy action and history;
- source and update provenance;
- demo excluded by default in production mode.

### 14.4 Notices

- browse all live authoritative notices;
- filter food versus durable goods;
- inspect source coverage even when no owned product matches;
- save or compare a notice against a product.

### 14.5 Add / Scan / Import

- scan-first mobile experience;
- receipt and label review;
- identifier validation;
- duplicate detection;
- strict CSV parsing with row-level errors, valid-row import, downloadable error file, and undo.

### 14.6 Settings and privacy

- provider coverage;
- sync status;
- notification preferences;
- data export/delete;
- retention settings;
- connected sources and revocation;
- plain-language explanation of which data leaves the device.

---

## 15. Privacy and security requirements

### 15.1 Default architecture

- Bind local development and single-device deployments to localhost.
- Encrypt production data in transit and at rest.
- Separate identity/contact information from detailed purchase records where practical.
- Never send the purchase ledger to regulator APIs; ingest public notices centrally or locally and match inside the trusted boundary.
- Minimize logs; product names, receipt text, identifiers, and images must not appear in standard application logs.
- Strip image metadata unless explicitly needed.
- Define retention for raw receipts and OCR images separately from normalized products.

### 15.2 User control

- explicit consent for receipt forwarding, retailer connections, notifications, and household sharing;
- granular disconnect and deletion;
- complete export;
- documented account deletion SLA in hosted deployments;
- no advertising profiles;
- no sale of identifiable or pseudonymous purchase history;
- no model training on private purchase data without a separate, explicit opt-in.

### 15.3 Security baseline

- authentication and household authorization before any network-accessible deployment;
- CSRF protection and origin validation for mutations;
- rate limiting and abuse controls;
- encrypted secret management;
- dependency and container scanning;
- audit trail for sensitive mutations;
- signed or checksum-verified provider snapshots where available;
- security review before enabling email inbox or retailer integrations.

---

## 16. Accessibility and inclusive design

Target WCAG 2.2 AA.

Required:

- semantic labels for every input and filter;
- keyboard-complete navigation;
- visible focus indicators;
- `aria-current` navigation state;
- skip link;
- status updates announced with appropriate live regions;
- no information conveyed only by color;
- readable default text sizes;
- reduced-motion support;
- table captions, scoped headers, and mobile alternatives;
- plain-language hazard and uncertainty explanations;
- localization-ready dates, units, and content;
- Spanish-language notices preserved when provided by the authority, with source language explicit.

---

## 17. Operations and internal tooling

An operator console is required before public launch.

Capabilities:

- provider health and freshness;
- staged snapshot inspection;
- quarantined-record review;
- normalized-versus-raw comparison;
- notice merge/split and duplicate resolution;
- identifier correction with provenance;
- news-signal verification;
- match investigation;
- rule-version rollout and rollback;
- user-reported false-positive/false-negative triage without unnecessary access to household data;
- incident banner and provider-disable control.

All manual changes must be auditable and must not overwrite raw source history.

---

## 18. Non-functional requirements

### 18.1 Reliability

- Previous successful snapshots remain active when a sync fails.
- Provider promotion is transactional.
- Sync jobs are idempotent and safe under concurrency.
- Material notice updates are never lost.
- Notification delivery is retryable and deduplicated.

### 18.2 Performance

- Product add/update acknowledgement: under 1 second before background rematching.
- Typical product evaluation: under 5 seconds end to end.
- Dashboard initial response: under 2 seconds at pilot scale.
- Notice and product lists are paginated.
- Matching is incremental for new/changed products and notice versions.
- Full re-evaluation runs as a background job with progress reporting.

### 18.3 Observability

- provider freshness and completeness;
- parse/quarantine rate;
- match counts by state/source/category;
- notification success/failure;
- rematch queue latency;
- application error rate;
- no sensitive product payloads in metric dimensions.

### 18.4 Data portability

- versioned JSON export containing products, identifiers, alerts, and history;
- CSV export for common product fields;
- original media export where retained;
- documented schema and import path.

---

## 19. Quality and evaluation strategy

### 19.1 Labeled evaluation corpus

Create a reviewed dataset containing:

- exact affected products;
- same SKU but wrong lot/date;
- same brand and category but different product;
- renamed/repackaged variants;
- private-label equivalents;
- ambiguous receipt lines;
- identifier formatting variants;
- incomplete records;
- durable model families and serial ranges;
- notices expanded or corrected over time.

Every case records expected state and rationale. Do not tune solely against demo fixtures.

### 19.2 Required quality measures

- actionable-match precision;
- known-positive recall coverage;
- conflict-detection accuracy;
- identifier extraction precision/recall;
- provider record coverage and freshness;
- time from authority publication to normalized availability;
- user verification rate;
- false-positive reports;
- remedy initiation and completion;
- percentage of owned products with sufficient identifiers.

### 19.3 Launch quality gates

Before notifying real users:

- no brand/category/date-only alerts;
- zero known explicit-identifier conflicts labeled `EXACT`;
- complete pagination for enabled provider scopes;
- atomic snapshot promotion tested under injected failures;
- provider freshness visible in every negative result;
- actionable-match precision meets the pilot threshold established from labeled review;
- all notification content links to a primary source;
- privacy and security review completed.

The team must set numerical precision/coverage thresholds from a representative labeled corpus rather than inventing them from fixture performance.

---

## 20. Analytics and product metrics

Privacy-preserving product metrics should answer:

- Are users able to register products with useful identifiers?
- Do users return to add products or only visit once?
- Are alerts verified and acted on?
- Which capture methods produce the best identity data?
- Where do users abandon capture?
- Which providers and categories generate useful matches?

Suggested metrics:

- products registered per active household;
- identifier completeness by domain;
- scan-to-confirm completion rate;
- time to register a product;
- actionable matches per 1,000 monitored products;
- percentage of alerts verified affected/not affected;
- remedy completion rate and time;
- 30/90-day household retention;
- notification opt-in and unsubscribe rate;
- source freshness SLA attainment.

Telemetry must use coarse event metadata by default. Product names, identifiers, receipt contents, images, and notice-match details require explicit product-level justification and privacy review.

---

## 21. Delivery plan

### Phase 0 — Trust and correctness foundation

Deliver:

- replace “safe/clear/no match” semantics;
- minimum-evidence and conflict states;
- canonical GTIN-14 normalization;
- strict date parsing;
- validated URL filters;
- local-only binding for unauthenticated mode;
- transactional provider sync;
- full openFDA pagination without destructive partial snapshots;
- source-aware alert counts and statuses.

Exit criteria:

- previously identified review defects are covered by regression tests;
- injected sync failure preserves the active snapshot;
- negative states show coverage and freshness.

### Phase 1 — Notice foundation

Deliver:

- versioned notice schema;
- provider/sync-run/coverage ledger;
- Notices catalog;
- raw/normalized provenance;
- complete FDA food announcement plus enforcement reconciliation;
- USDA FSIS adapter;
- CPSC adapter;
- live/demo separation.

Exit criteria:

- complete configured source pagination;
- provider health visible;
- operators can reconcile and inspect notice changes;
- users can browse both food and durable notices.

### Phase 2 — High-quality product capture

Deliver:

- product and label barcode scanning;
- GS1 Digital Link parsing;
- OCR-assisted lot/model/serial/date extraction;
- review-before-save;
- strict CSV import with duplicate handling and undo;
- product edit/delete/export;
- food/durable ownership lifecycle.

Exit criteria:

- representative users can add an item in under the target time;
- identifier validation and extraction metrics are recorded;
- duplicates and corrections are recoverable.

### Phase 3 — Vertical matching engines

Deliver:

- food-specific rules;
- durable-product rules;
- evidence states and side-by-side comparison;
- incremental rematching;
- labeled evaluation corpus and rule-version tracking;
- source/geography/time evidence.

Exit criteria:

- launch gates in Section 19.3 pass;
- every actionable alert includes inspectable evidence and primary provenance.

### Phase 4 — Alerts and remedy completion

Deliver:

- unresolved-first inbox;
- material-update reopening;
- email and push opt-in;
- reminders;
- remedy tracking and history;
- user feedback for false matches and missing notices.

Exit criteria:

- notification deduplication and retry tested;
- remedy flow is usable for refund, repair, replacement, and disposal cases;
- sensitive lock-screen content respects preferences.

### Phase 5 — Pilot and business validation

Deliver:

- focused household pilot;
- operator review process;
- weekly quality report;
- privacy/support playbooks;
- partner-facing API feasibility study.

Recommended pilot:

- 30–50 households in one initial segment;
- several hundred real registered products;
- backtest against at least two years of relevant notices;
- human review of every proposed actionable match;
- interviews on trust, registration burden, notification usefulness, and willingness to pay.

Exit criteria:

- product capture is repeated rather than one-time novelty;
- high evidence precision;
- users understand uncertainty;
- at least one plausible consumer or partner acquisition path is validated.

### Phase 6 — Partner and platform expansion

Potential capabilities:

- retailer and receipt-platform integrations;
- household sharing;
- partner API/SDK;
- property, childcare, or insurance inventory workflows;
- jurisdiction expansion;
- warranty, firmware, and maintenance notices;
- verified manufacturer/retailer notice submission.

---

## 22. Acceptance criteria by critical workflow

### 22.1 Add a packaged food item

- User scans a supported barcode.
- App validates and canonicalizes the GTIN.
- User can capture lot and printed date with OCR or manual correction.
- App explains any missing identifier needed for precise monitoring.
- Product is evaluated against current FDA/USDA sources.
- Result states checked providers, freshness, and evidence.

### 22.2 Add a durable product

- User scans a product/model label.
- App extracts brand, model, serial, and date code for confirmation.
- Product remains actively monitored until ownership ends.
- A CPSC notice can match model/UPC and request serial/date inspection.

### 22.3 Receive an actionable match

- User receives an opt-in notification only for eligible evidence states.
- Alert shows exact agreements, missing values, and conflicts.
- Purchased and recalled identifiers are side by side.
- Primary source, update time, hazard, remedy, and consumer contact are visible.
- User can verify affected/not affected and track the remedy.

### 22.4 Handle a source failure

- Failed provider refresh does not remove the prior snapshot.
- App records last attempt and last success separately.
- Coverage state becomes delayed/failed.
- Negative match language identifies stale or unavailable sources.
- Operator receives diagnostic information without sensitive household data.

### 22.5 Handle a notice expansion

- New notice version is retained alongside the prior version.
- Newly included identifiers trigger targeted re-evaluation.
- Previously resolved alerts reopen only when the change affects that product.
- User sees what changed and why the alert returned.

---

## 23. Key risks and mitigations

| Risk | Consequence | Mitigation |
| --- | --- | --- |
| Sparse lot/model identifiers in source data | Low matching coverage | Combine authoritative sources, preserve full descriptions, operator extraction, request user inspection |
| Sparse identifiers in receipts | Weak ownership identity | Scan-first capture, label follow-up, retailer partnerships |
| False-positive alerts | Loss of trust and unnecessary anxiety | Minimum-evidence gates, conflict state, conservative notification eligibility |
| False negatives | Missed relevant notices | Coverage ledger, complete pagination, labeled backtests, explicit limitations |
| Provider schema or availability change | Stale or corrupt data | Validation, quarantine, staged snapshots, alerts, adapter contracts |
| Remedy changes after publication | Users follow obsolete guidance | Notice versioning and material-change notifications |
| Privacy breach | Severe user harm and reputational damage | Data minimization, encryption, local matching options, no advertising use |
| Manual registration burden | Low retention | barcode/2D/OCR capture, receipt workflows, narrow initial category |
| General news noise | Confusion and alarm fatigue | separate signal model, corroboration, no automatic recall claims |
| Rare-event consumer value | Weak willingness to pay | broader ownership/remedy value or B2B2C partnerships without diluting safety focus |

---

## 24. Open product decisions

1. Which initial wedge should lead acquisition: families with young children, food-allergy households, or household durable-goods inventory?
2. Is the initial product local-first, hosted with accounts, or hybrid encrypted sync?
3. Which user data is necessary for geographic distribution matching?
4. How long should raw receipt and product-label images be retained?
5. Should food products expire automatically from active ownership, and by what category-specific rules?
6. Which `REVIEW` matches should appear in the inbox versus only on a product detail page?
7. What partner model best funds a free consumer safety service without compromising trust?
8. What evidence threshold and human-review process are required before the first real notification pilot?
9. Should drug/device notices be excluded until medical-safety review and appropriate disclaimers exist?
10. How will user-reported false negatives be investigated without exposing unnecessary purchase history?

---

## 25. Source references informing this specification

- [FDA Recalls, Market Withdrawals, & Safety Alerts](https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts)
- [FDA Enforcement Report information and definitions](https://www.fda.gov/safety/enforcement-reports/enforcement-report-information-and-definitions)
- [openFDA APIs and data model](https://open.fda.gov/apis/)
- [openFDA authentication and rate limits](https://open.fda.gov/apis/authentication/)
- [USDA FSIS Recall API](https://www.fsis.usda.gov/science-data/developer-resources/recall-api)
- [CPSC Recall API](https://www.cpsc.gov/Data)
- [CPSC Recall API programmer documentation](https://www.cpsc.gov/s3fs-public/RecallRetrievalWebServicesProgrammersGuide20171031.pdf)
- [CPSC recall guidance and identifier checklist](https://www.cpsc.gov/Business--Manufacturing/Recall-Guidance/Recall-Checklist)
- [NHTSA datasets and APIs](https://www.nhtsa.gov/nhtsa-datasets-and-apis)
- [GS1 Digital Link URI Syntax](https://ref.gs1.org/standards/digital-link/uri-syntax/1.7.0/)
- [GS1 Global Traceability Standard](https://www.gs1.org/standards/gs1-global-traceability-standard/current-standard)

---

## 26. Definition of done for v2

SafeKeep v2 is ready for a supervised pilot when:

1. enabled authoritative sources sync completely and atomically;
2. source coverage and freshness are visible;
3. users can capture both food and durable products with validated identifiers;
4. matching uses vertical-specific evidence and explicit conflict states;
5. no actionable alert can be created from brand/category/date alone;
6. every actionable alert shows owned versus affected identifiers;
7. users can verify, resolve, and track remedies;
8. products and personal data can be edited, exported, and deleted;
9. notifications are opt-in, deduplicated, and source-linked;
10. failure-injection, provider, database, route, accessibility, and browser-flow tests pass;
11. privacy/security review is complete;
12. a labeled evaluation corpus demonstrates pilot-ready precision and documented coverage limitations.

