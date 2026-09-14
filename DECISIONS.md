# Decision Log

## D-001 — Reliable fixtures before a live provider

The MVP uses realistic but fictionalized FDA/CPSC-style fixtures behind `RecallProvider`. This keeps the three-minute demo deterministic and avoids presenting stale copied records as live authoritative notices. Source links point to authority recall portals and every fixture is labeled demo data.

## D-002 — Server-rendered local application

Next.js App Router and server actions minimize client state and keep database access server-only. Authentication is omitted for the specified single local user.

## D-003 — SQLite-compatible JSON fields

Lists and raw provider payloads are serialized into string columns. Repository helpers own parsing so the rest of the application works with typed arrays.

## D-004 — Conservative confidence guardrails

Scores alone do not produce HIGH confidence: a precise identifier match is mandatory. Explicit identifier/date conflicts reduce scores and are shown in explanations. This prioritizes trust and low alert fatigue.

## D-005 — No CSV parsing dependency

The import parser supports quoted RFC-4180-style cells and the documented header set in a small isolated module. This is sufficient for the MVP and keeps browser/server behavior predictable.

## D-006 — Fixture source URLs

Because fixture details are fictionalized, links go to official authority recall search portals rather than pretending a specific official notice exists.

