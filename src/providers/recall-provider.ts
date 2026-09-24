import type { NormalizedRecall } from "@/domain/types";

export type RecallProviderResult = {
  records: NormalizedRecall[];
  status: "SUCCEEDED" | "PARTIAL";
  message?: string;
  replaceSnapshot: boolean;
};

export interface RecallProvider {
  readonly name: string;
  readonly managedAuthorities?: readonly string[];
  fetchRecalls(): Promise<NormalizedRecall[] | RecallProviderResult>;
}
