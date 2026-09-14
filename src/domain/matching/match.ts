import { normalizeBrand, normalizeLot, normalizeProductName, normalizeText, normalizeUpc, tokenSimilarity } from "@/domain/normalization";
import type { Confidence, MatchablePurchase, MatchResult, NormalizedRecall } from "@/domain/types";

function classify(score: number, precise: boolean, strong: boolean, hasConflict: boolean): Confidence {
  if (score >= 0.8 && precise && !hasConflict) return "HIGH";
  if (score >= 0.48 && (precise || strong)) return "MEDIUM";
  if (score >= 0.25) return "LOW";
  return "NONE";
}

export function matchPurchaseToRecall(purchase: MatchablePurchase, recall: NormalizedRecall): MatchResult {
  let score = 0;
  const reasons: string[] = [];
  let exactIdentifier = false;
  let hasConflict = false;

  const purchaseUpc = normalizeUpc(purchase.upc);
  const recallUpcs = recall.upcs.map(normalizeUpc).filter(Boolean);
  if (purchaseUpc && recallUpcs.length) {
    if (recallUpcs.includes(purchaseUpc)) {
      score += 0.55;
      exactIdentifier = true;
      reasons.push("Exact product identifier (UPC/GTIN) match");
    } else {
      score -= 0.35;
      hasConflict = true;
      reasons.push("Product identifier does not match the listed UPC/GTIN");
    }
  }

  const purchaseLot = normalizeLot(purchase.lotNumber);
  const recallLots = recall.lotNumbers.map(normalizeLot).filter(Boolean);
  if (purchaseLot && recallLots.length) {
    if (recallLots.includes(purchaseLot)) {
      score += 0.25;
      exactIdentifier = true;
      reasons.push("Lot number is listed in the notice");
    } else {
      score -= 0.2;
      hasConflict = true;
      reasons.push("Lot number does not match the listed affected lots");
    }
  }

  if (normalizeBrand(purchase.brand) && normalizeBrand(purchase.brand) === normalizeBrand(recall.brand)) {
    score += 0.12;
    reasons.push("Brand matches");
  }

  const similarity = tokenSimilarity(purchase.productName, recall.productName);
  const exactName = normalizeProductName(purchase.productName) === normalizeProductName(recall.productName);
  const strongName = similarity >= 0.6;
  if (exactName) {
    score += 0.23;
    reasons.push("Product name matches exactly after normalization");
  } else if (strongName) {
    score += 0.2;
    reasons.push("Product name is a strong textual match");
  } else if (similarity >= 0.38) {
    score += 0.1;
    reasons.push("Product name has some matching details");
  }

  const purchaseTime = purchase.purchaseDate.getTime();
  const start = recall.distributionStartDate?.getTime();
  const end = recall.distributionEndDate?.getTime();
  if (start || end) {
    const within = (!start || purchaseTime >= start) && (!end || purchaseTime <= end);
    if (within) {
      score += 0.08;
      reasons.push("Purchase date falls within the affected distribution window");
    } else {
      score -= 0.15;
      reasons.push("Purchase date is outside the listed distribution window");
    }
  }

  if (normalizeText(purchase.category) && normalizeText(purchase.category) === normalizeText(recall.category)) {
    score += 0.05;
    reasons.push("Product category matches");
  }

  score = Math.max(0, Math.min(1, Number(score.toFixed(2))));
  return { score, confidence: classify(score, exactIdentifier, strongName, hasConflict), reasons };
}
