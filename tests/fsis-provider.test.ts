import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FsisRecallProvider, normalizeFsisRecall, type FsisRecall } from "@/providers/fsis-recall-provider";

const apiRecord: FsisRecall = {
  field_title: "Example Foods Recalls Beef Patties Due to Possible Contamination",
  field_recall_url: "http://www.fsis.usda.gov/recalls-alerts/example-foods-recalls-beef-patties",
  field_active_notice: "True",
  field_states: "Nationwide",
  field_closed_date: "",
  field_establishment: "Example Foods LLC",
  field_risk_level: "High - Class I",
  field_last_modified_date: "2026-09-22",
  field_product_items: "16-oz. packages of Example Beef Patties, UPC 0 12345 67890 5, lot BP-2609.",
  field_recall_classification: "Class I",
  field_recall_date: "2026-09-22",
  field_recall_number: "099-2026",
  field_recall_reason: "Product Contamination",
  field_recall_type: "Active Recall",
  field_summary: "<p>Example Foods is recalling selected products.</p>",
};

const relayXml = `<?xml version="1.0"?><rss version="2.0"><channel>
  <item><title>FDA Item</title><description>Not USDA</description><guid>https://www.fda.gov/safety/example</guid><pubDate>Tue, 22 Sep 2026 10:00:00 EST</pubDate></item>
  <item><title>Star Foods Recalls Raw Beef Products Due to Lack of Inspection</title><description>Packages have lot code SF-2209.</description><guid isPermaLink="true">https://www.fsis.usda.gov/recalls-alerts/star-foods-recalls-raw-beef</guid><pubDate>Tue, 22 Sep 2026 10:00:00 EST</pubDate></item>
</channel></rss>`;

describe("USDA FSIS provider", () => {
  it("normalizes full API records with identifiers and HTTPS provenance", () => {
    const normalized = normalizeFsisRecall(apiRecord);
    assert.equal(normalized.externalId, "099-2026");
    assert.equal(normalized.sourceAuthority, "USDA FSIS");
    assert.equal(normalized.brand, "Example Foods LLC");
    assert.deepEqual(normalized.upcs, ["012345678905"]);
    assert.deepEqual(normalized.lotNumbers, ["BP-2609"]);
    assert.equal(normalized.sourceUrl, "https://www.fsis.usda.gov/recalls-alerts/example-foods-recalls-beef-patties");
  });

  it("uses the government relay as a non-destructive partial fallback", async () => {
    const requests: string[] = [];
    const mockFetch = (async (input: string | URL | Request) => {
      const url = String(input);
      requests.push(url);
      if (url.includes("www2c.cdc.gov")) return new Response(relayXml, { status: 200, headers: { "content-type": "application/xml" } });
      return new Response("Access denied", { status: 403 });
    }) as typeof fetch;
    const result = await new FsisRecallProvider(mockFetch).fetchRecalls();
    assert.equal(result.status, "PARTIAL");
    assert.equal(result.replaceSnapshot, false);
    assert.equal(result.records.length, 1);
    assert.equal(result.records[0].sourceAuthority, "USDA FSIS");
    assert.match(result.records[0].sourceUrl, /^https:\/\/www\.fsis\.usda\.gov\//);
    assert.deepEqual(requests, [
      "https://www.fsis.usda.gov/fsis/api/recall/v/1",
      "https://www.fsis.usda.gov/fsis-content/rss/recalls.xml",
      "https://www2c.cdc.gov/podcasts/createrss.asp?c=146",
    ]);
  });
});
