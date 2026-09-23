# SafeKeep

SafeKeep is a polished MVP for a post-purchase safety network. It keeps a private local ledger of products you bought, ingests live FDA food-enforcement records, and surfaces explainable potential matches with HIGH, MEDIUM, or LOW confidence.

It proves one simple idea: people should not have to manually connect a notice on a regulator website with an item sitting in their home.

> SafeKeep does not determine whether an item is definitively safe or recalled. It routes possible matches and preserves the authoritative source so the user can verify details.

## Architecture

```text
CSV / manual entry                       Fixture recall provider
        │                                          │
        ▼                                          ▼
 Purchase normalizer                    openFDA + fixture providers
        │                                          │
        └──────────────┐      ┌────────────────────┘
                       ▼      ▼
                deterministic matcher
                score + confidence + reasons
                         │
                         ▼
              SQLite ← Prisma → Next.js
                         │
                         ▼
            dashboard / ledger / safety inbox
```

The domain matcher is a pure TypeScript module. Recall ingestion is behind a `RecallProvider` interface, persistence is isolated through Prisma, and Next.js server actions orchestrate imports, status changes, sync, and rematching. See [ARCHITECTURE.md](./ARCHITECTURE.md) and [SPEC.md](./SPEC.md).

The proposed multi-source product direction—including food and durable-product capture, FDA/USDA/CPSC coverage, category-specific matching, notifications, remedy tracking, privacy, and pilot gates—is documented in [PRODUCT_SPEC_V2.md](./PRODUCT_SPEC_V2.md).

## Setup

Requirements: Node.js 20+ and npm.

```bash
npm install
cp .env.example .env
npm run setup
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The setup command creates `prisma/dev.db`, seeds 20 purchases and 10 notices, and generates several deliberate HIGH, MEDIUM, and LOW matches.

An openFDA API key is optional. Anonymous access uses FDA's lower public rate limits; set `FDA_API_KEY` in `.env` for regular use.

## Three-minute demo

1. Start on Dashboard, click **Sync live FDA**, and review the loaded-record count and source freshness.
2. Open Safety alerts. Expand the evidence behind a HIGH match and follow the authority portal link.
3. Change its acknowledgment status to Reviewed, Returned, Discarded, or Dismissed.
4. Open Add / import and add the Green Valley salad kit with UPC `041234567890` and lot `RV2409A`—or import `examples/sample-purchases.csv`.
5. Return to the inbox to see the newly generated match, score, and evidence.

## Matching methodology

SafeKeep compares normalized UPC/GTIN, lot, brand, product-name tokens, category, and purchase date. Precise identifiers carry the most weight. Conflicting identifiers and dates reduce the score. HIGH confidence requires an exact UPC or lot; name/category similarity alone cannot produce a high-confidence claim. Full weights and guardrails are in [SPEC.md](./SPEC.md).

Tests cover exact and mismatched UPCs, known and unknown lots, fuzzy names, unrelated products, date-window conflicts, incomplete data, normalization, CSV parsing, and the end-to-end domain flow.

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

## Privacy by design

The purchase ledger stays in a local SQLite database. The MVP has no accounts, analytics, or trackers. Live sync sends a public recall query to openFDA but never sends product purchases, identifiers, retailers, or match results. A future architecture should favor on-device matching, tokenized identifiers, retailer-side matching, and minimal centralized consumer data.

## Demo data and limitations

Seeded recall records are fictionalized demo fixtures inspired by FDA and CPSC notices. They remain labeled in code and UI. A dashboard action can replace the current live-provider snapshot with recent ongoing openFDA food enforcement records. openFDA is updated weekly and its own disclaimer says results are unvalidated; the app therefore links every live record back to its FDA JSON source and never treats a match as confirmation. The app does not yet ingest CPSC/USDA data, scrape general news, authenticate users, notify devices, reconcile duplicate imports, or model restaurant/supply-chain provenance.

## Roadmap

1. Add CPSC and USDA FSIS authoritative adapters with provider-specific status handling.
2. Add a separately labeled news safety-signal pipeline with deduplication and publisher policy controls.
3. Calibrate matching against reviewed examples and expose identifier conflict details more deeply.
4. Add encrypted multi-user storage and opt-in notification delivery.
5. Explore retailer/loyalty imports and GS1 Digital Link identifiers.

## Repository guide

- `SPEC.md` — product source of truth and scoring contract
- `PRODUCT_SPEC_V2.md` — detailed proposed product and data roadmap
- `ARCHITECTURE.md` — boundaries and future provenance design
- `DECISIONS.md` — assumptions and tradeoffs
- `IMPLEMENTATION_PLAN.md` — milestone status
- `QA.md` — manual verification checklist
- `src/domain` — pure normalization and matching
- `src/providers` — replaceable recall sources
- `prisma` — local data model and demo seed
- `tests` — unit and integration coverage
