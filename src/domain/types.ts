export type Confidence = "HIGH" | "MEDIUM" | "LOW" | "NONE";

export type MatchablePurchase = {
  productName: string;
  brand: string;
  category: string;
  purchaseDate: Date;
  upc?: string | null;
  lotNumber?: string | null;
};

export type NormalizedRecall = {
  externalId: string;
  sourceAuthority: string;
  headline: string;
  description: string;
  brand: string;
  productName: string;
  category: string;
  upcs: string[];
  lotNumbers: string[];
  distributionStartDate?: Date | null;
  distributionEndDate?: Date | null;
  recallDate: Date;
  severity?: string | null;
  recommendedAction: string;
  sourceUrl: string;
  rawData?: Record<string, unknown>;
  isFixture?: boolean;
};

export type MatchResult = {
  score: number;
  confidence: Confidence;
  reasons: string[];
};
