# Manual QA Checklist

1. Start from a seeded database and verify dashboard counts render without errors.
2. Open Purchases; search by brand and filter by recall status.
3. Add a purchase with required fields only; verify it appears in the ledger.
4. Add a purchase whose UPC and lot match a fixture; verify a HIGH alert appears.
5. Download/use `examples/sample-purchases.csv`, preview it, then import valid rows.
6. Upload a CSV missing a required header; verify a useful validation error appears.
7. Open Safety Alerts and filter HIGH, MEDIUM, and LOW confidence independently.
8. Inspect an alert; verify reasons, action, authority, date, severity, and source are visible.
9. Mark an alert reviewed, dismissed, returned, and discarded; verify each persists after refresh.
10. Trigger recall sync; verify the last-sync time updates and duplicate recalls are not created.
11. Resize to a narrow viewport; verify navigation, cards, tables, and forms remain usable.
12. Verify all LOW-alert language says “potential” or “may” and does not claim confirmed danger.

