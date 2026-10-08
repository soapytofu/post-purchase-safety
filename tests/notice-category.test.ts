import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { broadCategoryFor, categoryWhere, noticeCategories } from "@/lib/notice-category";
import { noticeContains } from "@/lib/notice-search";

const notice = (overrides: Partial<Parameters<typeof broadCategoryFor>[0]> = {}) => ({ sourceAuthority: "CPSC", headline: "", productName: "", category: "Consumer product", description: "", ...overrides });

describe("notice categories", () => {
  it("uses case-insensitive hosted search without breaking SQLite", () => {
    const previous = process.env.DATABASE_URL;
    try {
      process.env.DATABASE_URL = "postgresql://example/test";
      assert.deepEqual(noticeContains("Esjay"), { contains: "Esjay", mode: "insensitive" });
      const kids = JSON.stringify(categoryWhere("baby-kids"));
      assert.match(kids, /"mode":"insensitive"/);
      const home = categoryWhere("home").AND as unknown[];
      assert.equal(home.length, 5); // exclude baby, electronics and outdoor first
      process.env.DATABASE_URL = "file:./test.db";
      assert.deepEqual(noticeContains("Esjay"), { contains: "Esjay" });
    } finally {
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
    }
  });
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
