import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseReceiptText } from "@/lib/receipt-parser";

describe("receipt parser", () => {
  it("extracts merchant, date, and line items without treating totals as products", () => {
    const parsed = parseReceiptText(`GREEN VALLEY MARKET
123 Main Street
09/21/2026 14:30
BANANAS 2.49
WHOLE MILK 4.29
PAPER TOWELS 8.99
SUBTOTAL 15.77
TAX 0.72
TOTAL 16.49
VISA 16.49`);
    assert.equal(parsed.merchant, "GREEN VALLEY MARKET");
    assert.equal(parsed.purchaseDate, "2026-09-21");
    assert.deepEqual(parsed.items.map((item) => item.productName), ["BANANAS", "WHOLE MILK", "PAPER TOWELS"]);
    assert.deepEqual(parsed.items.map((item) => item.category), ["Produce", "Dairy & eggs", "Household supplies"]);
  });

  it("handles ISO dates, item codes, duplicate OCR lines, and comma decimals", () => {
    const parsed = parseReceiptText(`NORTH SHOP
2026-09-20
001234567890 TOMATO SOUP 3,50
001234567890 TOMATO SOUP 3,50
2 x BATH SOAP 5.00
CHANGE 1.00`);
    assert.equal(parsed.purchaseDate, "2026-09-20");
    assert.equal(parsed.items.length, 2);
    assert.equal(parsed.items[0].productName, "TOMATO SOUP");
    assert.equal(parsed.items[0].price, "3.50");
    assert.equal(parsed.items[1].category, "Household supplies");
  });

  it("returns a reviewable empty result when OCR finds no priced lines", () => {
    const parsed = parseReceiptText("CORNER STORE\nThank you for shopping");
    assert.equal(parsed.merchant, "CORNER STORE");
    assert.equal(parsed.purchaseDate, "");
    assert.deepEqual(parsed.items, []);
  });
});
