import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeCpscRecall, type CpscRecall } from "@/providers/cpsc-recall-provider";

const record: CpscRecall = {
  RecallID: 10986,
  RecallNumber: "26-773",
  RecallDate: "2026-09-17T00:00:00",
  LastPublishDate: "2026-09-17T00:00:00",
  Description: "Selected electric grills with date codes 2510 through 2512 are affected.",
  URL: "https://cpsc.gov/Recalls/2026/example",
  Title: "Char-Broil Recalls Bistro Pro Electric Grills Due to Risk of Electric Shock",
  ConsumerContact: "Contact the recalling firm.",
  Products: [{ Name: "Bistro Pro Electric Grills", Description: "", Model: "BISTRO-PRO", Type: "Electric Grills" }],
  ProductUPCs: [{ UPC: "01234-567890" }],
  Hazards: [{ Name: "Electric shock hazard" }],
  Remedies: [{ Name: "Stop use and contact the firm for a free repair kit." }],
  RemedyOptions: [{ Option: "Repair" }],
  Manufacturers: [],
  Importers: [{ Name: "Char-Broil LLC" }],
  Distributors: [],
};

describe("CPSC provider normalization", () => {
  it("maps durable-product fields and primary-source provenance", () => {
    const normalized = normalizeCpscRecall(record);
    assert.equal(normalized.sourceAuthority, "CPSC");
    assert.equal(normalized.externalId, "26-773");
    assert.equal(normalized.productName, "Bistro Pro Electric Grills");
    assert.equal(normalized.brand, "Char-Broil LLC");
    assert.deepEqual(normalized.upcs, ["01234567890"]);
    assert.equal(normalized.recallDate.toISOString(), "2026-09-17T12:00:00.000Z");
    assert.equal(normalized.recommendedAction, "Stop use and contact the firm for a free repair kit.");
  });

  it("rejects impossible source dates", () => {
    assert.throws(() => normalizeCpscRecall({ ...record, RecallDate: "2026-02-30T00:00:00" }), /impossible date/);
  });
});
