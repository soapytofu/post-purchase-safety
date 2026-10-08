import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseReceiptText } from "@/lib/receipt-parser";
import { isValidGtin, receiptSchema } from "@/lib/receipt-import";
import { matchPurchaseToRecall } from "@/domain/matching/match";
import type { NormalizedRecall } from "@/domain/types";

describe("receipt parser", () => {
  it("preserves printed evidence without guessing brand or treating a SKU as a barcode", () => {
    const parsed = parseReceiptText("SHOP\n2026-09-20\n012345678905 TOMATO SOUP 3.50\nSOAP A123456 2.50");
    assert.equal(parsed.items[0].printedCode, "012345678905");
    assert.equal(parsed.items[0].rawLine, "012345678905 TOMATO SOUP 3.50");
    assert.equal(parsed.items[0].brand, "");
    assert.equal(parsed.items[0].upc, "");
    assert.equal(parsed.items[1].printedCode, "A123456");
    assert.equal(isValidGtin("012345678905"), true);
    assert.equal(isValidGtin("012345678906"), false);
    assert.equal(isValidGtin("123456"), false);
  });

  it("imports confirmed barcode/lot evidence and enables identifier matching without a brand", () => {
    const item = parseReceiptText("SHOP\n2026-09-20\n012345678905 TOMATO SOUP 3.50").items[0];
    const payload = receiptSchema.parse({ merchant: "SHOP", purchaseDate: "2026-09-20", items: [{ ...item, upc: item.printedCode, lotNumber: "L1" }] });
    assert.equal(payload.items[0].upc, "012345678905");
    assert.equal(payload.items[0].brand, "Not specified");
    const recall: NormalizedRecall = { externalId: "test", sourceAuthority: "FDA", headline: "Soup recall", description: "Test", brand: "Soup Co", productName: "TOMATO SOUP", category: "Packaged food", upcs: ["012345678905"], lotNumbers: ["L1"], recallDate: new Date("2026-09-22"), recommendedAction: "Check package", sourceUrl: "https://example.com" };
    assert.equal(matchPurchaseToRecall({ ...payload.items[0], purchaseDate: new Date("2026-09-20") }, recall).confidence, "HIGH");
    assert.equal(receiptSchema.safeParse({ ...payload, purchaseDate: "2026-02-30" }).success, false);
    assert.equal(receiptSchema.safeParse({ ...payload, items: [{ ...item, upc: "123456" }] }).success, false);
  });
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
