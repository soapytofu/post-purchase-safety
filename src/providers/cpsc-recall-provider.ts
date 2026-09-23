import { z } from "zod";
import type { NormalizedRecall } from "@/domain/types";
import type { RecallProvider } from "./recall-provider";

const CPSC_ENDPOINT = "https://www.saferproducts.gov/RestWebServices/Recall";

const namedItem = z.object({ Name: z.string().nullish() }).passthrough();
const cpscRecallSchema = z.object({
  RecallID: z.union([z.number(), z.string()]),
  RecallNumber: z.string().nullish(),
  RecallDate: z.string(),
  LastPublishDate: z.string().nullish(),
  Description: z.string().nullish(),
  URL: z.string().url(),
  Title: z.string(),
  ConsumerContact: z.string().nullish(),
  Products: z.array(z.object({ Name: z.string().nullish(), Description: z.string().nullish(), Model: z.string().nullish(), Type: z.string().nullish() }).passthrough()).default([]),
  ProductUPCs: z.array(z.object({ UPC: z.string().nullish() }).passthrough()).default([]),
  Hazards: z.array(namedItem).default([]),
  Remedies: z.array(namedItem).default([]),
  RemedyOptions: z.array(z.object({ Option: z.string().nullish() }).passthrough()).default([]),
  Manufacturers: z.array(namedItem).default([]),
  Importers: z.array(namedItem).default([]),
  Distributors: z.array(namedItem).default([]),
}).passthrough();

const responseSchema = z.array(cpscRecallSchema);
export type CpscRecall = z.infer<typeof cpscRecallSchema>;

function strictDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}:\d{2})?$/.exec(value);
  if (!match) throw new Error(`CPSC returned an invalid date: ${value}`);
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== `${match[1]}-${match[2]}-${match[3]}`) {
    throw new Error(`CPSC returned an impossible date: ${value}`);
  }
  return date;
}

function values(items: Array<{ Name?: string | null }>): string[] {
  return items.map((item) => item.Name?.trim() ?? "").filter(Boolean);
}

function unique(valuesToDeduplicate: string[]): string[] {
  return [...new Set(valuesToDeduplicate)];
}

export function normalizeCpscRecall(record: CpscRecall): NormalizedRecall {
  const products = record.Products.map((product) => product.Name?.trim() ?? "").filter(Boolean);
  const firms = values([...record.Manufacturers, ...record.Importers, ...record.Distributors]);
  const hazards = values(record.Hazards);
  const remedies = values(record.Remedies);
  const options = record.RemedyOptions.map((item) => item.Option?.trim() ?? "").filter(Boolean);
  const upcs = unique(record.ProductUPCs.map((item) => item.UPC?.replace(/\D/g, "") ?? "").filter((value) => value.length >= 8 && value.length <= 14));
  return {
    externalId: record.RecallNumber?.trim() || String(record.RecallID),
    sourceAuthority: "CPSC",
    headline: record.Title.trim(),
    description: record.Description?.trim() || hazards.join(" ") || "See the official CPSC notice for affected product details.",
    brand: firms[0] || record.Title.split(/\s+Recalls\s+/i)[0].trim(),
    productName: products[0] || record.Title,
    category: record.Products[0]?.Type?.trim() || "Consumer product",
    upcs,
    lotNumbers: [],
    distributionStartDate: null,
    distributionEndDate: null,
    recallDate: strictDate(record.RecallDate),
    severity: hazards[0] || "Consumer product recall",
    recommendedAction: remedies.join(" ") || (options.length ? `Remedy: ${options.join(" or ")}. Review the official CPSC notice for instructions.` : "Review the official CPSC notice for remedy instructions."),
    sourceUrl: record.URL,
    rawData: record,
    isFixture: false,
  };
}

export class CpscRecallProvider implements RecallProvider {
  readonly name = "cpsc-recalls";
  readonly managedAuthorities = ["CPSC"];

  constructor(private readonly yearsOfHistory = 2, private readonly now = () => new Date()) {}

  async fetchRecalls(): Promise<NormalizedRecall[]> {
    const start = new Date(this.now());
    start.setUTCFullYear(start.getUTCFullYear() - this.yearsOfHistory);
    const params = new URLSearchParams({ format: "json", RecallDateStart: start.toISOString().slice(0, 10) });
    const response = await fetch(`${CPSC_ENDPOINT}?${params}`, { cache: "no-store", signal: AbortSignal.timeout(30_000), headers: { Accept: "application/json", "User-Agent": "SafeKeep/0.3 (consumer safety monitor)" } });
    if (!response.ok) throw new Error(`CPSC returned ${response.status}`);
    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error("CPSC returned an unexpected response shape");
    return parsed.data.map(normalizeCpscRecall);
  }
}
