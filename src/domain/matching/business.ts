import { nameTokens, normalizeBrand, normalizeLot, normalizeProductName, tokenSimilarity } from "@/domain/normalization";

export const BUSINESS_MATCH_VERSION = "business-candidates-v1";
export type BusinessStock = { productName: string; brand: string; gtin: string; lotNumber: string };
export type BusinessNotice = { id: string; productName: string; brand: string; upcs: string[]; lotNumbers: string[] };
export type BusinessEvidence = { kind: "IDENTIFIER" | "TEXT"; reasons: string[]; conflicts: string[]; limitations: string[] };

// Compare GTIN-8/12/13/14 at a common width. Never interpret a store SKU as GTIN.
export function businessGtin(value: string) {
  const digits = value.replace(/[\s-]/g, "");
  return /^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(digits) ? digits.padStart(14, "0") : "";
}

export function matchBusinessStock(stock: BusinessStock, notice: BusinessNotice): BusinessEvidence | null {
  const gtin = businessGtin(stock.gtin);
  const noticeGtins = notice.upcs.map(businessGtin).filter(Boolean);
  const exactIdentifier = !!gtin && noticeGtins.includes(gtin);
  const brand = normalizeBrand(stock.brand);
  const noticeBrand = normalizeBrand(notice.brand);
  const brandMatch = !!brand && brand === noticeBrand;
  const stockTokens = nameTokens(stock.productName);
  const noticeTokens = nameTokens(notice.productName);
  const overlap = [...stockTokens].filter(token => noticeTokens.has(token)).length;
  const similarity = tokenSimilarity(stock.productName, notice.productName);
  const exactName = !!normalizeProductName(stock.productName) && normalizeProductName(stock.productName) === normalizeProductName(notice.productName);
  // Name-only candidates require multiple shared terms; a shared lot, brand,
  // category or generic single-word name alone is never product evidence.
  const textCandidate = overlap >= 2 && (brandMatch ? similarity >= 0.5 : exactName || similarity >= 0.8);
  if (!exactIdentifier && !textCandidate) return null;
  const reasons = exactIdentifier ? ["UPC/GTIN matches a listed product identifier"] : [exactName ? "Product name matches after normalization" : "Product name shares multiple specific terms"];
  if (brandMatch) reasons.push("Brand matches");
  const conflicts: string[] = [];
  const limitations = ["Candidate only—not confirmed affected. Verify the full official notice, packaging and supplier information.", "Model, serial ranges and production-date restrictions are not automatically verified."];
  if (gtin && noticeGtins.length && !exactIdentifier) conflicts.push("UPC/GTIN differs from the identifiers listed in this notice; verify whether the list is exhaustive.");
  if (brand && noticeBrand && !brandMatch) conflicts.push("Brand differs from the notice.");
  if (!brand || !noticeBrand) limitations.push("Brand is missing or unspecified on the stock row or notice.");
  if (!gtin || !noticeGtins.length) limitations.push("A comparable product identifier is missing on the stock row or notice.");
  const lot = normalizeLot(stock.lotNumber);
  const lots = notice.lotNumbers.map(normalizeLot).filter(Boolean);
  if (lot && lots.length) {
    if (lots.includes(lot)) reasons.push("Lot matches a listed affected lot");
    else conflicts.push("Lot differs from the listed lots; do not treat this candidate as confirmed affected.");
  } else limitations.push("Affected lot scope has not been verified.");
  // Inventory-as-of is not a purchase, manufacture or distribution date.
  return { kind: exactIdentifier ? "IDENTIFIER" : "TEXT", reasons, conflicts, limitations };
}

export function businessNoticeIndex(notices: BusinessNotice[]) {
  const gtins = new Map<string, Set<number>>();
  const tokens = new Map<string, Set<number>>();
  const add = (map: Map<string, Set<number>>, key: string, index: number) => {
    if (!key) return;
    const values = map.get(key) ?? new Set<number>(); values.add(index); map.set(key, values);
  };
  notices.forEach((notice, index) => {
    notice.upcs.forEach(value => add(gtins, businessGtin(value), index));
    nameTokens(notice.productName).forEach(token => add(tokens, token, index));
  });
  return (stock: BusinessStock) => {
    const candidates = new Set(gtins.get(businessGtin(stock.gtin)) ?? []);
    const overlaps = new Map<number, number>();
    nameTokens(stock.productName).forEach(token => tokens.get(token)?.forEach(index => overlaps.set(index, (overlaps.get(index) ?? 0) + 1)));
    overlaps.forEach((count, index) => { if (count >= 2) candidates.add(index); });
    return [...candidates].map(index => notices[index]);
  };
}
