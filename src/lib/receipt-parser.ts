export type ReceiptLineItem = {
  id: string;
  productName: string;
  brand: string;
  category: string;
  price: string;
  selected: boolean;
};

export type ParsedReceipt = {
  merchant: string;
  purchaseDate: string;
  items: ReceiptLineItem[];
};

const nonItemPattern = /\b(sub\s*total|total|tax|tender|change|balance|amount due|payment|visa|mastercard|amex|debit|credit|cash|savings|you saved|receipt|transaction|approval|auth|card ending)\b/i;
const addressPattern = /\b(street|st\.?|road|rd\.?|avenue|ave\.?|boulevard|blvd\.?|drive|dr\.?|lane|ln\.?|highway|hwy\.?|suite)\b/i;

function isoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

function findDate(text: string): string {
  const iso = text.match(/\b(20\d{2})[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])\b/);
  if (iso) return isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3])) ?? "";
  const us = text.match(/\b(0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])[-/.](\d{2}|20\d{2})\b/);
  if (!us) return "";
  const year = us[3].length === 2 ? 2000 + Number(us[3]) : Number(us[3]);
  return isoDate(year, Number(us[1]), Number(us[2])) ?? "";
}

function categoryFor(name: string): string {
  if (/\b(milk|cheese|yogurt|cream|egg)\b/i.test(name)) return "Dairy & eggs";
  if (/\b(beef|chicken|pork|turkey|meat|sausage|ham|fish|salmon|shrimp)\b/i.test(name)) return "Meat & seafood";
  if (/\b(apples?|bananas?|lettuce|tomatoes?|produce|fruits?|vegetables?|salads?|berry|berries)\b/i.test(name)) return "Produce";
  if (/\b(cereal|bread|rice|pasta|snack|chips|cookie|sauce|soup|juice|water|coffee|tea)\b/i.test(name)) return "Packaged food";
  if (/\b(detergents?|cleaners?|bleach|soaps?|paper towels?|tissues?|trash bags?|sponges?)\b/i.test(name)) return "Household supplies";
  if (/\b(shampoo|conditioner|lotion|toothpaste|deodorant|cosmetic|makeup)\b/i.test(name)) return "Personal care";
  if (/\b(toy|game|doll|puzzle)\b/i.test(name)) return "Toys & games";
  if (/\b(shirt|shoe|sock|jacket|pants|dress)\b/i.test(name)) return "Apparel";
  return "Uncategorized";
}

function merchantFrom(lines: string[]): string {
  return lines.slice(0, 8).find((line) => {
    const letters = line.match(/[A-Za-z]/g)?.length ?? 0;
    return letters >= 3 && !nonItemPattern.test(line) && !addressPattern.test(line) && !/^\+?\d[\d\s().-]{6,}$/.test(line);
  })?.replace(/[^A-Za-z0-9&' .-]/g, "").trim().slice(0, 80) ?? "";
}

export function parseReceiptText(rawText: string): ParsedReceipt {
  const lines = rawText.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const seen = new Set<string>();
  const items: ReceiptLineItem[] = [];

  for (const line of lines) {
    const match = line.match(/^(.{2,80}?)\s+\$?(-?\d{1,5}[.,]\d{2})\s*[A-Z]?$/i);
    if (!match || nonItemPattern.test(match[1])) continue;
    const productName = match[1]
      .replace(/^\d+\s*[x@]\s*/i, "")
      .replace(/^\d{4,14}\s+/, "")
      .replace(/\s+[A-Z]?\d{4,14}$/, "")
      .replace(/[^A-Za-z0-9&'()\- /]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (productName.length < 2 || !/[A-Za-z]/.test(productName)) continue;
    const key = `${productName.toLowerCase()}|${match[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ id: `receipt-${items.length + 1}`, productName, brand: "Not specified", category: categoryFor(productName), price: match[2].replace(",", "."), selected: true });
    if (items.length === 40) break;
  }

  return { merchant: merchantFrom(lines), purchaseDate: findDate(rawText), items };
}
