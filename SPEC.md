# SafeKeep MVP Product Specification

## 1. Problem

Recall information and purchase information both exist, but consumers still have to connect them manually. SafeKeep keeps a lightweight local purchase ledger, compares it with normalized authoritative safety notices, and routes relevant notices to the purchaser with transparent confidence and reasoning.

SafeKeep never decides that a product is definitively safe or unsafe. It surfaces possible matches, preserves the source notice, and asks the user to verify authoritative details.

## 2. Target user and scope

The MVP serves one local demo consumer who buys packaged grocery products and household consumer goods. Restaurant ingredient traceability, accounts, card or POS integrations, notifications, and production infrastructure are explicitly out of scope.

## 3. Core workflows

1. **Add purchase:** enter product, brand, category, retailer, date, and optional UPC and lot.
2. **Import purchases:** upload a CSV containing the documented columns in `examples/sample-purchases.csv`; preview validation errors and import valid rows.
3. **Purchase ledger:** search and filter purchases and see their current recall status.
4. **Recall ingestion:** load normalized fixture notices through a replaceable `RecallProvider` interface.
5. **Recall matching:** deterministically compare every purchase and active recall.
6. **Safety inbox:** inspect match confidence, reasons, recommended action, source, and set an acknowledgment status.
7. **Dashboard:** see tracked purchases, active matches, high-confidence matches, recent checks, and last sync time.

## 4. Data model

- `Purchase`: product identity, retailer/date context, optional UPC/lot, source, timestamps.
- `Recall`: authority and external ID, description, product identity, affected identifiers/date window, severity, action, source URL, raw payload, timestamps.
- `RecallMatch`: purchase/recall pair, confidence, numeric score, reasons, acknowledgment status, timestamps.

Enums are used for purchase source, confidence, and match status. Recall UPCs, lots, reasons, and raw provider data are stored as JSON strings because SQLite does not support scalar lists.

## 5. Matching and confidence

All values are normalized before comparison. Scores are additive and capped at 1.0:

| Evidence | Score |
| --- | ---: |
| Exact UPC/GTIN | +0.55 |
| Explicit UPC mismatch | −0.35 |
| Exact affected lot | +0.25 |
| Explicit lot mismatch | −0.20 |
| Exact normalized brand | +0.12 |
| Strong product-name token similarity (≥ 0.60) | +0.20 |
| Moderate product-name similarity (≥ 0.38) | +0.10 |
| Purchase in affected date window | +0.08 |
| Purchase outside affected date window | −0.15 |
| Exact normalized category | +0.05 |

Guardrails prevent weak accumulation from implying certainty:

- `HIGH`: score ≥ 0.80, an exact UPC or lot match, and no explicit identifier conflict.
- `MEDIUM`: score ≥ 0.48 and either an exact UPC, exact lot, or strong name match.
- `LOW`: score ≥ 0.25. This is always worded as a possibility requiring inspection.
- `NONE`: below 0.25, explicit identifier conflict without stronger evidence, or insufficient evidence.

An exact mismatch is explained. Missing identifiers are neutral. Date boundaries are inclusive. LOW matches are retained for inspection but not presented as confirmed recalls.

## 6. Normalization

Brand and product text is lowercased, Unicode-normalized, stripped of punctuation and common package-size noise, and tokenized. UPCs keep digits and are left-padded to 12 digits when feasible. Lot identifiers keep uppercase letters and digits only.

## 7. Acceptance criteria

- The app starts locally and shows seeded purchases and recall fixtures.
- Manual and CSV-created purchases generate matches immediately.
- Each visible alert explains the match and links to the source field.
- Confidence levels are visually and verbally distinct.
- Alert status persists locally.
- Matching and normalization unit tests pass.
- An integration test demonstrates purchase → recall → match → alert view model.
- The primary demo can be completed in under three minutes.

## 8. Trust and privacy requirements

- Purchase data remains in the local SQLite database.
- No analytics or third-party purchase-history transmission.
- Fixture records are labeled as demo data, and the UI distinguishes source authority from SafeKeep's inferred match.
- Copy uses “potential match” and “may be affected,” never unsupported danger claims.
