import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parsePurchaseCsv } from "@/lib/csv";

describe("CSV import", () => {
  it("parses quoted fields", () => {
    const result = parsePurchaseCsv('product_name,brand,purchase_date,retailer,upc,lot_number,category\n"Salad, Romaine",Green Valley,2026-09-01,Market,123,,Produce');
    assert.deepEqual(result.errors, []); assert.equal(result.rows[0].product_name, "Salad, Romaine");
  });
  it("reports missing headers", () => assert.match(parsePurchaseCsv("product_name,brand\nEggs,Farm").errors[0], /Missing required headers/));
});
