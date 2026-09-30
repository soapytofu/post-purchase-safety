import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { broadCategoryFor, categoryWhere, noticeCategories } from "@/lib/notice-category";

const notice = (overrides: Partial<Parameters<typeof broadCategoryFor>[0]> = {}) => ({ sourceAuthority: "CPSC", headline: "", productName: "", category: "Consumer product", description: "", ...overrides });

describe("notice categories", () => {
  it("offers mutually named consumer-facing categories", () => {
    assert.deepEqual(noticeCategories.map((category) => category.id), ["food", "meat", "baby-kids", "home", "electronics", "outdoor", "other"]);
  });

  it("prioritizes regulator scope for food categories", () => {
    assert.equal(broadCategoryFor(notice({ sourceAuthority: "FDA / openFDA", headline: "Battery-shaped candy" })), "Food & beverages");
    assert.equal(broadCategoryFor(notice({ sourceAuthority: "USDA FSIS", headline: "Chicken products" })), "Meat, poultry & eggs");
  });

  it("classifies common consumer products", () => {
    assert.equal(broadCategoryFor(notice({ headline: "Infant stroller recall" })), "Baby & kids");
    assert.equal(broadCategoryFor(notice({ productName: "Lithium power bank" })), "Appliances & electronics");
    assert.equal(broadCategoryFor(notice({ category: "Bicycles" })), "Outdoor & recreation");
    assert.equal(broadCategoryFor(notice({ description: "A dresser can tip over" })), "Home & furniture");
  });

  it("builds a safe empty filter for unknown category values", () => {
    assert.deepEqual(categoryWhere("unknown"), {});
  });
});
