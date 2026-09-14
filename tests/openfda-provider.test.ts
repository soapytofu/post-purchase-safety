import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractLots, extractUpcs, normalizeOpenFdaRecall, type OpenFdaRecall } from "@/providers/openfda-recall-provider";

const record: OpenFdaRecall = {
  recall_number: "H-9999-2026",
  event_id: "99999",
  status: "Ongoing",
  classification: "Class II",
  product_description: "Acme Garden Salad, 12 oz; UPC 0 12345 67890 5",
  reason_for_recall: "Potential contamination",
  recalling_firm: "Acme Foods LLC",
  code_info: "Lot numbers: GS-2401 and GS-2402",
  recall_initiation_date: "20260820",
  report_date: "20260910",
  product_type: "Food",
  openfda: { brand_name: ["Acme"] },
};

describe("openFDA provider normalization", () => {
  it("extracts labeled UPCs without guessing arbitrary numbers", () => assert.deepEqual(extractUpcs(record), ["012345678905"]));
  it("extracts explicitly labeled lot identifiers", () => assert.deepEqual(extractLots(record.code_info), ["GS-2401"]));
  it("maps authority, freshness, severity, and source provenance", () => {
    const normalized = normalizeOpenFdaRecall(record);
    assert.equal(normalized.sourceAuthority, "FDA / openFDA");
    assert.equal(normalized.isFixture, false);
    assert.equal(normalized.severity, "Class II");
    assert.equal(normalized.recallDate.toISOString(), "2026-09-10T12:00:00.000Z");
    assert.match(normalized.sourceUrl, /^https:\/\/api\.fda\.gov\/food\/enforcement\.json/);
  });
});
