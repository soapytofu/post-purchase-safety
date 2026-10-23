import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import type { NormalizedRecall } from "@/domain/types";
import type { RecallProvider, RecallProviderResult } from "./recall-provider";
import { fetchFeed } from "./feed-http";

const FSIS_API_ENDPOINT = "https://www.fsis.usda.gov/fsis/api/recall/v/1";
const FSIS_RSS_ENDPOINT = "https://www.fsis.usda.gov/fsis-content/rss/recalls.xml";
const CDC_FOOD_SAFETY_FEED = "https://www2c.cdc.gov/podcasts/createrss.asp?c=146";
const textOrList = z.union([z.string(), z.array(z.string())]).nullish();

const fsisRecordSchema = z.object({
  field_title: z.string(),
  field_recall_url: z.string(),
  field_active_notice: z.string().nullish(),
  field_states: textOrList,
  field_closed_date: z.string().nullish(),
  field_establishment: textOrList,
  field_risk_level: z.string().nullish(),
  field_last_modified_date: z.string().nullish(),
  field_product_items: textOrList,
  field_recall_classification: z.string().nullish(),
  field_recall_date: z.string(),
  field_recall_number: z.string().optional(),
  field_recall_number_export: z.string().optional(),
  field_recall_reason: textOrList,
  langcode: z.string().optional(),
  field_recall_type: z.string().nullish(),
  field_summary: z.string().nullish(),
}).passthrough();

export type FsisRecall = z.infer<typeof fsisRecordSchema>;

function text(value?: string | string[] | null): string {
  return (Array.isArray(value) ? value.join("; ") : value ?? "")
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
  const externalId = (record.field_recall_number || record.field_recall_number_export || "").trim();
  if (!externalId) throw new Error("FSIS record is missing its notice identifier");
  return {
    externalId,
    sourceAuthority: "USDA FSIS",
    headline: text(record.field_title),
    description: summary.slice(0, 1_500) || text(record.field_recall_reason) || "See the official USDA FSIS notice for details.",
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
  const sourceUrl = [xmlValue(item.link), xmlValue(item.guid)].find(value => /^https?:\/\/(?:www\.)?fsis\.usda\.gov\//i.test(value)) ?? "";
  let url: URL;
  try { url = new URL(sourceUrl); } catch { return null; }
  if (!["fsis.usda.gov", "www.fsis.usda.gov"].includes(url.hostname.toLowerCase())) return null;
  const title = text(xmlValue(item.title));
  const description = text(xmlValue(item.description));
  const publishedAt = new Date(xmlValue(item.pubDate));
  if (!title || Number.isNaN(publishedAt.getTime())) return null;
  const slug = url.pathname.split("/").filter(Boolean).at(-1);
  if (!slug) return null;
  // Agency-issued alerts do not identify a firm merely by naming FSIS.
  const brand = /\s+Recalls\s+/i.test(title) ? title.split(/\s+Recalls\s+/i)[0] : "Not specified";
  const productName = title.replace(/^.*?\s+(?:Recalls|Issues)\s+/i, "").replace(/\s+Due\s+to\s+.*$/i, "");
  return {
    externalId: `RSS-${slug}`,
    sourceAuthority: "USDA FSIS",
    headline: title,
    description: description || "See the official USDA FSIS notice for details.",
    brand: /^(?:USDA\s+)?FSIS$/i.test(brand) ? "Not specified" : brand,
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
  return fetchFeed(url, response => response.text(), { fetchImpl, accept });
}

export class FsisRecallProvider implements RecallProvider {
  readonly name = "usda-fsis-recalls";
  readonly managedAuthorities = ["USDA FSIS"];

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async fetchRecalls(): Promise<RecallProviderResult> {
    const failures: string[] = [];
    try {
      const parsed = z.array(fsisRecordSchema).safeParse(await fetchFeed(FSIS_API_ENDPOINT, response => response.json(), { fetchImpl: this.fetchImpl }));
      if (!parsed.success || !parsed.data.length) throw new Error("FSIS API returned an unexpected or empty response");
      // The API includes translated copies sharing the same recall number.
      // Prefer English deterministically; retain a translation if it is the only copy.
      const records = new Map<string, NormalizedRecall>();
      const ordered = [...parsed.data].sort((a, b) => Number(a.langcode === "English") - Number(b.langcode === "English"));
      for (const record of ordered) {
        const normalized = normalizeFsisRecall(record);
        records.set(normalized.externalId, normalized);
      }
      return { records: [...records.values()], status: "SUCCEEDED", replaceSnapshot: true };
    } catch (error) {
      failures.push(error instanceof Error ? error.message : "FSIS API failed");
    }

    const fallback = new Map<string, NormalizedRecall>();
    const loaded: string[] = [];
    for (const [label, endpoint] of [["FSIS RSS", FSIS_RSS_ENDPOINT], ["CDC government relay", CDC_FOOD_SAFETY_FEED]] as const) {
      try {
        const xml = await fetchText(this.fetchImpl, endpoint, "application/rss+xml, application/xml;q=0.9");
        const records = rssItems(xml).map(normalizeRssItem).filter((record): record is NormalizedRecall => Boolean(record));
        if (!records.length) throw new Error(`${label} contained no current FSIS notices`);
        for (const record of records) if (!fallback.has(record.externalId)) fallback.set(record.externalId, record);
        loaded.push(label);
      } catch (error) {
        failures.push(error instanceof Error ? error.message : `${label} failed`);
      }
    }
    if (fallback.size) return { records: [...fallback.values()], status: "PARTIAL", replaceSnapshot: false, message: `Full USDA feed unavailable (${failures[0]}). Recent notices loaded from ${loaded.join(" and ")}; prior full coverage preserved. This is not a complete archive.` };
    throw new Error(failures.join("; "));
  }
}
