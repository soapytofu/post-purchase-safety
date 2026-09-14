import { z } from "zod";
import type { NormalizedRecall } from "@/domain/types";
import type { RecallProvider } from "./recall-provider";

const OPENFDA_ENDPOINT = "https://api.fda.gov/food/enforcement.json";

const openFdaRecallSchema = z.object({
  recall_number: z.string(),
  event_id: z.string().optional(),
  status: z.string().optional(),
  classification: z.string().optional(),
  product_description: z.string(),
  reason_for_recall: z.string(),
  recalling_firm: z.string(),
  code_info: z.string().optional(),
  recall_initiation_date: z.string().optional(),
  report_date: z.string(),
  product_type: z.string().optional(),
  distribution_pattern: z.string().optional(),
  voluntary_mandated: z.string().optional(),
  openfda: z.object({ brand_name: z.array(z.string()).optional(), upc: z.array(z.string()).optional() }).passthrough().optional(),
}).passthrough();

const responseSchema = z.object({ results: z.array(openFdaRecallSchema) });
export type OpenFdaRecall = z.infer<typeof openFdaRecallSchema>;

function parseDate(value?: string) {
  if (!value || !/^\d{8}$/.test(value)) return null;
  const date = new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function unique(values: string[]) { return [...new Set(values.filter(Boolean))]; }

export function extractUpcs(record: OpenFdaRecall): string[] {
  const descriptionMatches = [...record.product_description.matchAll(/\b(?:UPC|GTIN|EAN)\s*(?:code|#|no\.?|number)?\s*[:#-]?\s*((?:\d[\s-]*){8,14})\b/gi)].map((match) => match[1].replace(/\D/g, ""));
  return unique([...(record.openfda?.upc ?? []).map((value) => value.replace(/\D/g, "")), ...descriptionMatches]).filter((value) => value.length >= 8 && value.length <= 14);
}

export function extractLots(codeInfo?: string): string[] {
  if (!codeInfo || /^(no|none)\s+(codes?|lots?)/i.test(codeInfo.trim())) return [];
  const candidates = [...codeInfo.matchAll(/\b(?:lots?|codes?)\s*(?:#|nos?\.?|numbers?)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{2,24})/gi)].map((match) => match[1]);
  return unique(candidates).slice(0, 25);
}

function productTitle(description: string) {
  const firstLine = description.split(/[;\n]/)[0].replace(/\s+/g, " ").trim();
  return firstLine.length > 180 ? `${firstLine.slice(0, 177)}…` : firstLine;
}

export function normalizeOpenFdaRecall(record: OpenFdaRecall): NormalizedRecall {
  const brand = record.openfda?.brand_name?.[0] ?? record.recalling_firm;
  const name = productTitle(record.product_description);
  const sourceQuery = encodeURIComponent(`recall_number:"${record.recall_number}"`);
  return {
    externalId: record.recall_number,
    sourceAuthority: "FDA / openFDA",
    headline: `${brand}: ${name}`,
    description: record.reason_for_recall,
    brand,
    productName: name,
    category: record.product_type || "Food & Beverages",
    upcs: extractUpcs(record),
    lotNumbers: extractLots(record.code_info),
    distributionStartDate: null,
    distributionEndDate: null,
    recallDate: parseDate(record.report_date) ?? parseDate(record.recall_initiation_date) ?? new Date(0),
    severity: record.classification || null,
    recommendedAction: "Check the linked FDA enforcement record, compare all package identifiers, and follow instructions from FDA or the recalling firm.",
    sourceUrl: `${OPENFDA_ENDPOINT}?search=${sourceQuery}&limit=1`,
    rawData: record,
    isFixture: false,
  };
}

export class OpenFdaRecallProvider implements RecallProvider {
  readonly name = "openfda-food-enforcement";
  readonly managedAuthorities = ["FDA / openFDA"];
  constructor(private readonly limit = 100, private readonly apiKey = process.env.FDA_API_KEY) {}

  async fetchRecalls(): Promise<NormalizedRecall[]> {
    const params = new URLSearchParams({ search: 'status:"Ongoing"', sort: "report_date:desc", limit: String(Math.min(this.limit, 1000)) });
    if (this.apiKey) params.set("api_key", this.apiKey);
    const response = await fetch(`${OPENFDA_ENDPOINT}?${params}`, { cache: "no-store", signal: AbortSignal.timeout(15_000), headers: { Accept: "application/json", "User-Agent": "SafeKeep-MVP/0.2" } });
    if (!response.ok) throw new Error(`openFDA returned ${response.status}`);
    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error("openFDA returned an unexpected response shape");
    return parsed.data.results.map(normalizeOpenFdaRecall);
  }
}
