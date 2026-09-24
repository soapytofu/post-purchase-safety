import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import type { NormalizedRecall } from "@/domain/types";
import type { RecallProvider, RecallProviderResult } from "./recall-provider";

const FSIS_API_ENDPOINT = "https://www.fsis.usda.gov/fsis/api/recall/v/1";
const FSIS_RSS_ENDPOINT = "https://www.fsis.usda.gov/fsis-content/rss/recalls.xml";
const CDC_FOOD_SAFETY_FEED = "https://www2c.cdc.gov/podcasts/createrss.asp?c=146";
const requestOptions = (accept: string) => ({ cache: "no-store" as const, signal: AbortSignal.timeout(25_000), headers: { Accept: accept, "User-Agent": "Mozilla/5.0 (compatible; SafeKeep/0.4; +https://github.com/soapytofu/post-purchase-safety)" } });

const fsisRecordSchema = z.object({
  field_title: z.string(),
  field_recall_url: z.string(),
  field_active_notice: z.string().nullish(),
  field_states: z.string().nullish(),
  field_closed_date: z.string().nullish(),
  field_establishment: z.string().nullish(),
  field_risk_level: z.string().nullish(),
  field_last_modified_date: z.string().nullish(),
  field_product_items: z.string().nullish(),
  field_recall_classification: z.string().nullish(),
  field_recall_date: z.string(),
  field_recall_number: z.string(),
  field_recall_reason: z.string().nullish(),
  field_recall_type: z.string().nullish(),
  field_summary: z.string().nullish(),
}).passthrough();

export type FsisRecall = z.infer<typeof fsisRecordSchema>;

function text(value?: string | null): string {
  return (value ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function strictDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`FSIS returned an invalid date: ${value}`);
  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error(`FSIS returned an impossible date: ${value}`);
  return date;
}

function httpsUrl(value: string): string {
  const url = new URL(value);
  url.protocol = "https:";
  return url.toString();
}

function extractUpcs(value: string): string[] {
  return [...new Set([...value.matchAll(/\bUPC\s*(?:#|code|number)?\s*[:#-]?\s*((?:\d[\s-]*){8,14})\b/gi)].map((match) => match[1].replace(/\D/g, "")))];
}

function extractLots(value: string): string[] {
  return [...new Set([...value.matchAll(/\b(?:lot|code)\s*(?:#|nos?\.?|numbers?)?\s*[:#-]?\s*[“\"]?([A-Z0-9][A-Z0-9-]{2,24})/gi)].map((match) => match[1]))].slice(0, 25);
}

export function normalizeFsisRecall(record: FsisRecall): NormalizedRecall {
  const productItems = text(record.field_product_items);
  const summary = text(record.field_summary);
  return {
    externalId: record.field_recall_number.trim(),
    sourceAuthority: "USDA FSIS",
    headline: text(record.field_title),
    description: summary.slice(0, 1_500) || record.field_recall_reason?.trim() || "See the official USDA FSIS notice for details.",
    brand: text(record.field_establishment) || "Not specified",
    productName: productItems.slice(0, 500) || text(record.field_title),
    category: "Meat, poultry & processed egg products",
    upcs: extractUpcs(productItems),
    lotNumbers: extractLots(productItems),
    distributionStartDate: null,
    distributionEndDate: null,
    recallDate: strictDate(record.field_recall_date),
    severity: record.field_risk_level?.trim() || record.field_recall_classification?.trim() || record.field_recall_type?.trim() || null,
    recommendedAction: "Compare the package, establishment, lot, and date information with the official FSIS notice, then follow the authority's current instructions.",
    sourceUrl: httpsUrl(record.field_recall_url),
    rawData: record,
    isFixture: false,
  };
}

type RssItem = { title?: unknown; description?: unknown; link?: unknown; guid?: unknown; pubDate?: unknown };

function xmlValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "#text" in value) return String((value as { "#text": unknown })["#text"]);
  return "";
}

function rssItems(xml: string): RssItem[] {
  const parsed = new XMLParser({ ignoreAttributes: false, processEntities: true }).parse(xml) as { rss?: { channel?: { item?: RssItem | RssItem[] } } };
  const item = parsed.rss?.channel?.item;
  return item ? (Array.isArray(item) ? item : [item]) : [];
}

function normalizeRssItem(item: RssItem): NormalizedRecall | null {
  const sourceUrl = xmlValue(item.guid) || xmlValue(item.link);
  let url: URL;
  try { url = new URL(sourceUrl); } catch { return null; }
  if (!["fsis.usda.gov", "www.fsis.usda.gov"].includes(url.hostname.toLowerCase())) return null;
  const title = text(xmlValue(item.title));
  const description = text(xmlValue(item.description));
  const publishedAt = new Date(xmlValue(item.pubDate));
  if (!title || Number.isNaN(publishedAt.getTime())) return null;
  const slug = url.pathname.split("/").filter(Boolean).at(-1);
  if (!slug) return null;
  const brand = title.split(/\s+(?:Recalls|Issues)\s+/i)[0] || "Not specified";
  const productName = title.replace(/^.*?\s+(?:Recalls|Issues)\s+/i, "").replace(/\s+Due\s+to\s+.*$/i, "");
  return {
    externalId: `RSS-${slug}`,
    sourceAuthority: "USDA FSIS",
    headline: title,
    description: description || "See the official USDA FSIS notice for details.",
    brand,
    productName: productName || title,
    category: "Meat, poultry & processed egg products",
    upcs: extractUpcs(description),
    lotNumbers: extractLots(description),
    distributionStartDate: null,
    distributionEndDate: null,
    recallDate: publishedAt,
    severity: "USDA FSIS recall or public health alert",
    recommendedAction: "Open the official FSIS notice and compare all package, establishment, lot, and date identifiers before acting.",
    sourceUrl: httpsUrl(url.toString()),
    rawData: { title, description, sourceUrl, pubDate: xmlValue(item.pubDate), via: "government-rss-relay" },
    isFixture: false,
  };
}

async function fetchText(fetchImpl: typeof fetch, url: string, accept: string): Promise<string> {
  const response = await fetchImpl(url, requestOptions(accept));
  if (!response.ok) throw new Error(`${new URL(url).hostname} returned ${response.status}`);
  return response.text();
}

export class FsisRecallProvider implements RecallProvider {
  readonly name = "usda-fsis-recalls";
  readonly managedAuthorities = ["USDA FSIS"];

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async fetchRecalls(): Promise<RecallProviderResult> {
    const failures: string[] = [];
    try {
      const response = await this.fetchImpl(FSIS_API_ENDPOINT, requestOptions("application/json"));
      if (!response.ok) throw new Error(`FSIS API returned ${response.status}`);
      const parsed = z.array(fsisRecordSchema).safeParse(await response.json());
      if (!parsed.success || !parsed.data.length) throw new Error("FSIS API returned an unexpected or empty response");
      return { records: parsed.data.map(normalizeFsisRecall), status: "SUCCEEDED", replaceSnapshot: true };
    } catch (error) {
      failures.push(error instanceof Error ? error.message : "FSIS API failed");
    }

    for (const [label, endpoint] of [["FSIS RSS", FSIS_RSS_ENDPOINT], ["CDC government relay", CDC_FOOD_SAFETY_FEED]] as const) {
      try {
        const xml = await fetchText(this.fetchImpl, endpoint, "application/rss+xml, application/xml;q=0.9");
        const records = rssItems(xml).map(normalizeRssItem).filter((record): record is NormalizedRecall => Boolean(record));
        if (!records.length) throw new Error(`${label} contained no current FSIS notices`);
        return { records, status: "PARTIAL", replaceSnapshot: false, message: `The full USDA feed is unavailable from this server. Recent USDA notices were loaded from ${label}; any prior full snapshot was preserved.` };
      } catch (error) {
        failures.push(error instanceof Error ? error.message : `${label} failed`);
      }
    }
    throw new Error(failures.join("; "));
  }
}
