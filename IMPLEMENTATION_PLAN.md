# Implementation Plan

## Milestone 1 — Foundation and data

- [x] Write specification, architecture, decisions, and plan.
- [x] Scaffold Next.js, TypeScript, Tailwind, Prisma, and SQLite.
- [x] Define schema and seed realistic demo purchases and recalls.

## Milestone 2 — Domain engine

- [x] Implement deterministic normalizers and token similarity.
- [x] Implement isolated matching and confidence classification.
- [x] Add unit coverage for specified match cases.

## Milestone 3 — Safety inbox and dashboard

- [x] Add dashboard metrics and recent checks.
- [x] Show explainable alerts with authority/action/source.
- [x] Persist reviewed, dismissed, returned, and discarded states.

## Milestone 4 — Purchase capture

- [x] Add manual purchase entry.
- [x] Add CSV preview/import with row-level validation.
- [x] Rematch after writes.

## Milestone 5 — Recall ingestion

- [x] Define provider abstraction.
- [x] Implement a reliable fixture provider and sync action.
- [x] Add a live openFDA food-enforcement provider with validation, timeout, provenance, and offline fallback.

## Milestone 6 — Polish and verification

- [x] Add responsive navigation, empty/error states, and trust copy.
- [x] Add integration coverage and manual QA checklist.
- [x] Run database generation/seed, tests, lint, typecheck, and production build.

## V2 Phase 0/1 — Multi-source notice foundation

- [x] Add a searchable, paginated Notices catalog with source filtering.
- [x] Add live CPSC consumer-product recall ingestion.
- [x] Paginate openFDA through the complete configured result set.
- [x] Replace provider records transactionally and preserve the prior snapshot on failure.
- [x] Track provider attempts, successful freshness, failures, and record counts.
- [x] Validate that primary-source links use trusted HTTPS authority domains.
- [x] Keep live and demo snapshots isolated during replacement.
- [x] Replace ambiguous “no match” UI copy with “none found in checked data.”
- [x] Bind unauthenticated development and production servers to localhost by default.
- [x] Add API-first USDA FSIS ingestion with direct RSS and official CDC relay fallbacks.
- [x] Mark fallback coverage partial and preserve any prior full USDA snapshot.
- [ ] Re-test the full FSIS API from the production host and send the prepared access report if it remains blocked.
- [ ] Introduce versioned notice and affected-product entities.
