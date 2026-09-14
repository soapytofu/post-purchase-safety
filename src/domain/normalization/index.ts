const SIZE_PATTERN = /\b\d+(?:\.\d+)?\s*(?:fl\s*)?(?:oz|ounce|ounces|lb|lbs|pound|pounds|g|kg|ml|l|ct|count|pack)\b/gi;
const STOP_WORDS = new Set(["the", "and", "with", "of", "a", "an", "brand"]);

export function normalizeText(value?: string | null): string {
  if (!value) return "";
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(SIZE_PATTERN, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export const normalizeBrand = normalizeText;
export const normalizeProductName = normalizeText;

export function normalizeUpc(value?: string | null): string {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  if (!digits || digits.length > 14) return digits;
  return digits.length <= 12 ? digits.padStart(12, "0") : digits;
}

export function normalizeLot(value?: string | null): string {
  return value ? value.toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
}

export function nameTokens(value: string): Set<string> {
  return new Set(normalizeProductName(value).split(" ").filter((token) => token.length > 1 && !STOP_WORDS.has(token)));
}

export function tokenSimilarity(left: string, right: string): number {
  const a = nameTokens(left);
  const b = nameTokens(right);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  return (2 * intersection) / (a.size + b.size);
}
