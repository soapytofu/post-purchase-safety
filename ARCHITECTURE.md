# Architecture

## MVP structure

SafeKeep is a single Next.js application using React Server Components, server actions, TypeScript, Tailwind CSS, Prisma, and SQLite.

```text
Browser
  │ forms, filters, status actions
  ▼
Next.js app router
  ├── dashboard / purchases / alerts / add-import
  ├── server actions
  └── view-model queries
            │
            ▼
      domain services
  ├── normalization (pure)
  ├── matching engine (pure)
  ├── CSV parsing
  └── recall sync orchestration
       │                 │
       ▼                 ▼
 Prisma repository   RecallProvider
       │                 │
       ▼                 ▼
 local SQLite       Fixture provider
                    (FDA/CPSC adapters later)
```

The matching engine has no UI or database dependency. Provider payloads are normalized at the boundary. Server actions orchestrate persistence and revalidation; route components remain presentation-focused.

## Recall providers

`RecallProvider.fetchRecalls()` returns normalized records. The MVP uses deterministic, clearly marked fixtures because availability and shape changes in public APIs should not weaken a local demo. A future FDA/openFDA adapter can be added without changing matching or UI code. Provider sync upserts by `(sourceAuthority, externalId)` and then regenerates inferred matches.

## Privacy boundary

The SQLite file is the MVP privacy boundary. Purchase records never leave the machine. A production evolution should prefer on-device matching, tokenized identifiers for limited remote comparison, retailer-side matching, and minimal centralized purchase storage.

## Future provenance graph

The normalized `Purchase` and `Recall` records are intentionally leaves of a future provenance graph:

```text
Supplier → Distributor → Retailer / Restaurant → Product / Meal → Purchase → Consumer
```

Future entities and typed edges could add restaurant ingredient provenance, batch/lot lineage, POS and loyalty imports, GS1 Digital Link identifiers, and targeted routing. The same notice abstraction can later cover informal safety alerts, warranties, firmware defects, and maintenance notices. None of this graph infrastructure belongs in v1.

## Production considerations

A production system needs authenticated tenancy, encrypted storage, provider cursoring and retries, notice version history, observability, accessibility audits, jurisdiction-aware retention, and human-reviewed match calibration. Those are deliberately deferred until the core routing thesis is validated.

