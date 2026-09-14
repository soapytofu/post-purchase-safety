import type { NormalizedRecall } from "@/domain/types";

export interface RecallProvider {
  readonly name: string;
  readonly managedAuthorities?: readonly string[];
  fetchRecalls(): Promise<NormalizedRecall[]>;
}
