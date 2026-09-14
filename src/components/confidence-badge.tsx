import type { Confidence } from "@/domain/types";

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return <span className={`badge badge-${confidence.toLowerCase()}`}>{confidence === "LOW" ? "Low — inspect" : `${confidence.toLowerCase()} confidence`}</span>;
}
