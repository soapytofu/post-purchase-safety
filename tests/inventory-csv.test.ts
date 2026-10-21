import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseInventoryCsv, MAX_INVENTORY_BYTES, MAX_INVENTORY_ROWS } from "@/lib/inventory-csv";

const now = new Date("2026-10-21T16:00:00Z");
const headers = "location_code,sku,product_name,quantity_on_hand,inventory_as_of";
const row = 'main,000123,"Toy, deluxe",12,2026-10-21T10:00:00-04:00';
const parse = (csv: string, locations = ["MAIN"]) => parseInventoryCsv(csv, locations, now);

describe("business inventory CSV validation", () => {
  it("preserves identifiers and quoted text; normalizes quantities, locations and timezones", () => {
    const result = parse(`\uFEFF${headers},gtin\r\n${row},012345678905\r\n`);
    assert.equal(result.issueCount, 0);
    assert.equal(result.rows[0].sku, "000123");
    assert.equal(result.rows[0].gtin, "012345678905");
    assert.equal(result.rows[0].location_code, "MAIN");
    assert.equal(result.rows[0].quantity_on_hand, 12);
    assert.equal(result.rows[0].inventory_as_of, "2026-10-21T14:00:00.000Z");
    assert.equal(result.rows[0].product_name, "Toy, deluxe");
    assert.equal(result.rows[0].brand, "");
  });
  it("handles multiline fields, escaped quotes and physical row numbers", () => {
    const result = parse(`${headers}\nMAIN,A,"Toy \"\"deluxe\"\"\nsecond line",0,2026-10-21T12:00:00Z\nMAIN,B,Other,-1,2026-10-21T12:00:00Z`);
    assert.match(result.rows[0].product_name, /Toy "deluxe"\nsecond line/);
    assert.equal(result.issues[0].line, 4);
    assert.equal(result.issues[0].field, "quantity_on_hand");
  });
  it("rejects malformed quotes, headers, missing/extra columns, empty and oversized files", () => {
    for (const csv of ["", headers, `${headers}\nMAIN,A,\"unclosed,1,x`, `${headers}\nMAIN,A,\"Toy\"bad,1,x`, `${headers},sku\n${row},A`, headers.replace("sku", "wrong"), `${headers}\n${row},extra`, `${headers}\nMAIN,A`]) assert.ok(parse(csv).issueCount > 0);
    assert.ok(parse("x".repeat(MAX_INVENTORY_BYTES + 1)).issueCount);
    assert.match(parse(`${headers}\n${Array.from({length: MAX_INVENTORY_ROWS + 1}, (_,i) => `MAIN,${i},Toy,1,2026-10-21T12:00:00Z`).join("\n")}`).issues[0].message,/10,000/);
  });
  it("rejects invalid quantities and preserves explicit zero", () => {
    for (const quantity of ["-1", "1.5", "1e3", "NaN", "2147483648", ""]) assert.ok(parse(`${headers}\nMAIN,A,Toy,${quantity},2026-10-21T12:00:00Z`).issues.some(issue => issue.field === "quantity_on_hand"));
    assert.equal(parse(`${headers}\nMAIN,A,Toy,0,2026-10-21T12:00:00Z`).issueCount,0);
  });
  it("validates store scope, duplicate keys, date conflicts, GTINs and future timestamps", () => {
    for (const csv of [
      `${headers}\n${row}\n${row}`,
      `${headers}\nOTHER,A,Toy,1,2026-10-21T12:00:00Z`,
      `${headers}\nMAIN,A,Toy,1,2026-02-30T12:00:00Z`,
      `${headers}\nMAIN,A,Toy,1,2026-10-21T12:00:00`,
      `${headers}\nMAIN,A,Toy,1,2026-10-22T12:00:00Z`,
      `${headers}\n${row}\nMAIN,B,Toy,1,2026-10-21T12:00:00Z`,
      `${headers},gtin\n${row},012345678906`,
      `${headers},production_date\n${row},2026-02-30`,
    ]) assert.ok(parse(csv).issueCount);
    assert.ok(parse(`${headers}\n${row}`, ["MAIN", "OTHER"]).issueCount);
    const good = parse(`${headers},lot_number\n${row},LOT1\n${row},LOT2`);
    assert.equal(good.issueCount,0);
  });
  it("bounds displayed issues without treating truncated errors as valid", () => {
    const result = parse(`${headers}\n`+Array.from({length:250},(_,i)=>`MAIN,${i},Toy,-1,2026-10-21T12:00:00Z`).join("\n"));
    assert.equal(result.issueCount,250);
    assert.equal(result.issues.length,200);
  });
});
