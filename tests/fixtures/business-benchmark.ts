import type { BusinessNotice, BusinessStock } from "../../src/domain/matching/business";

// Authored synthetic examples, not actual recalls or a representative customer
// dataset. Relevance labels describe product identity, never a safety decision.
export type BenchmarkCase = { id: string; label: "relevant" | "unrelated" | "uncertain"; stock: BusinessStock; notice: BusinessNotice; baseline: "IDENTIFIER" | "TEXT" | null; note: string; conflict?: string };
const stock: BusinessStock = { productName: "Organic almond butter", brand: "Orchard", gtin: "012345678905", lotNumber: "A1" };
const notice: BusinessNotice = { id: "synthetic", productName: "Organic almond butter", brand: "Orchard", upcs: ["012345678905"], lotNumbers: ["A1"] };
const example = (id: string, label: BenchmarkCase["label"], baseline: BenchmarkCase["baseline"], stockChanges: Partial<BusinessStock>, noticeChanges: Partial<BusinessNotice>, note: string, conflict?: string): BenchmarkCase => ({ id, label, baseline, stock: { ...stock, ...stockChanges }, notice: { ...notice, ...noticeChanges, id }, note, conflict });

export const businessBenchmark: BenchmarkCase[] = [
  example("exact-identifier", "relevant", "IDENTIFIER", {}, {}, "Same product and listed lot; human verification still required."),
  example("missing-brand", "relevant", "IDENTIFIER", { brand: "" }, {}, "Barcode establishes candidate identity without an inferred brand."),
  example("padded-gtin", "relevant", "IDENTIFIER", {}, { upcs: ["00012345678905"] }, "UPC-A and zero-padded GTIN-14 represent the same identifier."),
  example("formatted-identifier", "relevant", "IDENTIFIER", { gtin: "0 12345-67890 5" }, {}, "Whitespace and hyphen formatting is equivalent."),
  example("opaque-stock-name", "relevant", "IDENTIFIER", { productName: "SKU item 7" }, {}, "Exact identifier works when the stock description is abbreviated."),
  example("identifier-lot-conflict", "relevant", "IDENTIFIER", { lotNumber: "B2" }, {}, "Same product but a different lot; do not confirm affected stock.", "Lot differs"),
  example("identifier-brand-conflict", "uncertain", "IDENTIFIER", { brand: "Other company" }, {}, "Conflicting brand requires investigation even with the same barcode.", "Brand differs"),
  example("missing-lot", "relevant", "IDENTIFIER", { lotNumber: "" }, {}, "Product found but affected lot scope remains unknown."),
  example("same-name-no-identifiers", "relevant", "TEXT", { gtin: "" }, { upcs: [] }, "Same full product description and explicit brand."),
  example("name-case-punctuation", "relevant", "TEXT", { gtin: "", productName: "ORGANIC, ALMOND BUTTER!" }, {}, "Normalization preserves identity evidence."),
  example("pack-size-suffix", "relevant", "TEXT", { gtin: "" }, { productName: "Organic almond butter 16 oz" }, "Same brand and product with package-size suffix; verify size manually."),
  example("name-only-no-brand", "uncertain", "TEXT", { gtin: "", brand: "" }, { brand: "" }, "Identical description without brand or barcode is only a candidate."),
  example("name-identifier-conflict", "uncertain", "TEXT", { gtin: "123456789012" }, {}, "Same name but different barcode; verify whether the notice list is exhaustive.", "UPC/GTIN differs"),
  example("unrelated-chair", "unrelated", null, { gtin: "", productName: "Wooden dining chair" }, {}, "Unrelated product category despite same store brand."),
  example("brand-only", "unrelated", null, { gtin: "", productName: "Orange juice" }, {}, "Brand alone is insufficient."),
  example("shared-lot-only", "unrelated", null, { gtin: "", brand: "Different", productName: "Electric kettle" }, {}, "Lot codes are not globally unique product identifiers."),
  example("single-generic-word", "unrelated", null, { gtin: "", productName: "Butter", brand: "Different" }, {}, "One shared generic token is insufficient."),
  example("blank-stock", "uncertain", null, { gtin: "", brand: "", productName: "", lotNumber: "" }, {}, "Insufficient stock evidence cannot establish an all-clear."),
  example("invalid-barcode", "unrelated", null, { gtin: "123", productName: "Garden hose" }, { upcs: ["123"] }, "Malformed short identifiers must not match."),
  example("known-miss-abbreviation", "relevant", null, { gtin: "", productName: "ORG ALM BTR" }, {}, "Known miss: synthetic abbreviated store description refers to the same product."),
  example("known-miss-single-word", "relevant", null, { gtin: "", productName: "Toaster", brand: "Northstar" }, { upcs: [], productName: "Toaster", brand: "Northstar", lotNumbers: [] }, "Known miss: conservative two-token rule misses a genuine one-word product."),
  example("known-false-positive-generic-name", "unrelated", "TEXT", { gtin: "", productName: "Stainless steel water bottle", brand: "Northstar" }, { upcs: [], productName: "Stainless steel water bottle", brand: "Southstar", lotNumbers: [] }, "Known false positive: two distinct fictional brands sell products with the same generic description.", "Brand differs"),
  example("lot-formatting", "relevant", "IDENTIFIER", { lotNumber: "A-1" }, {}, "Normalized lot punctuation matches, without independently proving recall scope."),
  example("lot-range-manual", "relevant", "IDENTIFIER", { lotNumber: "A150" }, { lotNumbers: ["A100–A200"] }, "Known scope limitation: ranges are not interpreted; this illustrative in-range lot still gets a conflict.", "Lot differs"),
];
