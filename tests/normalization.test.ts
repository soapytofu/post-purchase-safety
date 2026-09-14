import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeBrand, normalizeLot, normalizeProductName, normalizeUpc, tokenSimilarity } from "@/domain/normalization";

describe("normalization", () => {
  it("makes package-name variants comparable", () => {
    assert.equal(normalizeProductName("Taylor Farms Romaine Lettuce 12oz"), normalizeProductName("Taylor Farms - Romaine Lettuce, 12 OZ"));
  });
  it("normalizes accents, UPCs, and lots", () => {
    assert.equal(normalizeBrand("Café Délice"), "cafe delice");
    assert.equal(normalizeUpc("12345-67890"), "001234567890");
    assert.equal(normalizeLot(" rv-24 09/a "), "RV2409A");
  });
  it("calculates deterministic token similarity", () => assert.ok(Math.abs(tokenSimilarity("organic romaine salad kit", "romaine lettuce salad kit") - 0.75) < 0.001));
});
