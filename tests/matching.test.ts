import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { matchPurchaseToRecall } from "@/domain/matching/match";
import type { MatchablePurchase, NormalizedRecall } from "@/domain/types";

const purchase: MatchablePurchase = { productName: "Romaine Lettuce Salad Kit 12 oz", brand: "Green Valley", category: "Packaged Produce", purchaseDate: new Date("2026-09-03T12:00:00Z"), upc: "041234567890", lotNumber: "RV2409A" };
const recall: NormalizedRecall = { externalId: "x", sourceAuthority: "FDA", headline: "x", description: "x", brand: "Green Valley", productName: "Romaine Lettuce Salad Kit", category: "Packaged Produce", upcs: ["041234567890"], lotNumbers: ["RV2409A"], distributionStartDate: new Date("2026-08-20"), distributionEndDate: new Date("2026-09-12"), recallDate: new Date("2026-09-13"), recommendedAction: "Return", sourceUrl: "https://example.com" };

describe("matching engine", () => {
  it("returns HIGH for exact UPC and lot", () => assert.equal(matchPurchaseToRecall(purchase, recall).confidence, "HIGH"));
  it("penalizes a UPC mismatch", () => assert.notEqual(matchPurchaseToRecall({ ...purchase, upc: "999999999999", lotNumber: null }, recall).confidence, "HIGH"));
  it("returns MEDIUM for the same product when lot is unknown", () => assert.equal(matchPurchaseToRecall({ ...purchase, upc: null, lotNumber: null, productName: recall.productName }, recall).confidence, "MEDIUM"));
  it("does not overstate a wrong lot", () => assert.notEqual(matchPurchaseToRecall({ ...purchase, upc: null, lotNumber: "WRONG" }, recall).confidence, "HIGH"));
  it("caps confidence when an exact UPC conflicts with the listed lot", () => assert.notEqual(matchPurchaseToRecall({ ...purchase, lotNumber: "WRONG" }, recall).confidence, "HIGH"));
  it("recognizes a fuzzy product name conservatively", () => assert.equal(matchPurchaseToRecall({ ...purchase, upc: null, lotNumber: null, productName: "Green Valley Romaine Salad" }, recall).confidence, "LOW"));
  it("returns NONE for unrelated products", () => assert.equal(matchPurchaseToRecall({ ...purchase, productName: "Wireless Mouse", brand: "KeyWorks", category: "Electronics", upc: null, lotNumber: null }, recall).confidence, "NONE"));
  it("penalizes dates outside the window", () => assert.ok(matchPurchaseToRecall({ ...purchase, purchaseDate: new Date("2025-01-01"), upc: null, lotNumber: null }, recall).score < 0.48));
  it("handles incomplete purchase data", () => assert.equal(matchPurchaseToRecall({ ...purchase, brand: "", category: "", upc: null, lotNumber: null }, recall).confidence, "LOW"));
});
