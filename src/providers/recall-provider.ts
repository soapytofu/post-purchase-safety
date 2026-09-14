import type { NormalizedRecall } from "@/domain/types";

export interface RecallProvider {
  readonly name: string;
  fetchRecalls(): Promise<NormalizedRecall[]>;
}
