import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { matchPurchaseToRecall } from "@/domain/matching/match";
import { fixtureRecalls } from "@/providers/fixture-recall-provider";

describe("purchase → recall → match → alert", () => {
  it("produces an explainable alert view model", () => {
    const purchase = { id: "purchase-1", productName: "PocketCharge 10000 Power Bank", brand: "VoltNest", category: "Electronics", retailer: "ElectroMart", purchaseDate: new Date("2026-08-21"), upc: "083456789012", lotNumber: "VN26Q2" };
    const recall = fixtureRecalls.find((item) => item.externalId === "DEMO-CPSC-003")!;
    const result = matchPurchaseToRecall(purchase, recall);
    const alert = result.confidence === "NONE" ? null : { purchasedProduct: purchase.productName, retailer: purchase.retailer, headline: recall.headline, authority: recall.sourceAuthority, confidence: result.confidence, reasons: result.reasons, action: recall.recommendedAction, sourceUrl: recall.sourceUrl };
    assert.equal(alert?.purchasedProduct, "PocketCharge 10000 Power Bank");
    assert.equal(alert?.authority, "CPSC");
    assert.equal(alert?.confidence, "HIGH");
    assert.ok(alert?.reasons.includes("Exact product identifier (UPC/GTIN) match"));
    assert.match(alert?.sourceUrl ?? "", /^https:\/\//);
  });
});
