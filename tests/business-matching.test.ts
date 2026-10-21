import { it } from "node:test";
import assert from "node:assert/strict";
import { businessGtin, businessNoticeIndex, matchBusinessStock } from "@/domain/matching/business";

const stock = { productName: "Organic peanut butter", brand: "Acme", gtin: "012345678905", lotNumber: "A-1" };
const notice = { id: "notice", productName: "Organic peanut butter", brand: "Acme", upcs: ["00012345678905"], lotNumbers: ["A1"] };
it("compares padded identifiers without requiring a brand, and records lot evidence", () => {
  const result = matchBusinessStock({ ...stock, brand: "" }, notice)!;
  assert.equal(result.kind, "IDENTIFIER"); assert.ok(result.reasons.some(s => s.includes("Lot matches")));
  assert.ok(result.limitations.some(s => s.includes("Brand is missing")));
  assert.equal(businessGtin("012345678905"), businessGtin("00012345678905"));
  assert.equal(businessGtin("SKU-123"), "");
});
it("surfaces conflicting lot, brand and identifiers without asserting affected stock", () => {
  const result = matchBusinessStock({ ...stock, brand: "Other", gtin: "", lotNumber: "OTHER" }, notice)!;
  assert.equal(result.kind, "TEXT"); assert.equal(result.conflicts.length, 2);
  const conflict = matchBusinessStock({ ...stock, gtin: "123456789012" }, notice)!;
  assert.ok(conflict.conflicts.some(s => s.includes("UPC/GTIN differs")));
  assert.ok(conflict.limitations.some(s => s.includes("Model, serial")));
});
it("does not use brand, lot, category or one generic name token alone", () => {
  for (const name of ["Butter", "Organic", "Unrelated chair", ""]) {
    assert.equal(matchBusinessStock({ ...stock, gtin: "", productName: name }, notice), null);
  }
  assert.equal(matchBusinessStock({ ...stock, gtin: "", brand: "unknown" }, { ...notice, productName: "Organic peanut butter 16 oz" })!.kind, "TEXT");
});
it("indexes all candidates that the full matcher can produce without duplicate notice pairs", () => {
  const notices = [notice, { ...notice, id: "other", productName: "Nursery rocking chair", upcs: [] }, { ...notice, id: "identifier-only", productName: "Opaque description" }];
  const index = businessNoticeIndex(notices);
  for (const item of [stock, { ...stock, gtin: "", brand: "" }, { ...stock, productName: "Different", brand: "" }]) {
    assert.deepEqual(index(item).filter(n => matchBusinessStock(item, n)).map(n => n.id).sort(), notices.filter(n => matchBusinessStock(item, n)).map(n => n.id).sort());
  }
});
