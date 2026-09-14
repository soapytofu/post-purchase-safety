import { z } from "zod";

export const csvHeaders = ["product_name", "brand", "purchase_date", "retailer", "upc", "lot_number", "category"] as const;

const rowSchema = z.object({
  product_name: z.string().min(1, "product_name is required"),
  brand: z.string().min(1, "brand is required"),
  purchase_date: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "purchase_date must be a valid date"),
  retailer: z.string().min(1, "retailer is required"),
  upc: z.string(),
  lot_number: z.string(),
  category: z.string().min(1, "category is required"),
});

export type CsvPurchase = z.infer<typeof rowSchema>;
export type CsvParseResult = { rows: CsvPurchase[]; errors: string[] };

function parseLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && quoted && line[index + 1] === '"') { current += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { values.push(current.trim()); current = ""; }
    else current += char;
  }
  values.push(current.trim());
  return values;
}

export function parsePurchaseCsv(input: string): CsvParseResult {
  const lines = input.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return { rows: [], errors: ["The CSV is empty."] };
  const headers = parseLine(lines[0]).map((header) => header.toLowerCase());
  const missing = csvHeaders.filter((header) => !headers.includes(header));
  if (missing.length) return { rows: [], errors: [`Missing required headers: ${missing.join(", ")}`] };

  const rows: CsvPurchase[] = [];
  const errors: string[] = [];
  lines.slice(1).forEach((line, index) => {
    const values = parseLine(line);
    const candidate = Object.fromEntries(headers.map((header, column) => [header, values[column] ?? ""]));
    const parsed = rowSchema.safeParse(candidate);
    if (parsed.success) rows.push(parsed.data);
    else errors.push(`Row ${index + 2}: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`);
  });
  return { rows, errors };
}
