import { isValidGtin } from "./receipt-import";

export const MAX_INVENTORY_BYTES = 5 * 1024 * 1024;
export const MAX_INVENTORY_ROWS = 10_000;
export const inventoryRequiredHeaders = ["location_code", "sku", "product_name", "quantity_on_hand", "inventory_as_of"] as const;
export const inventoryOptionalHeaders = ["brand", "gtin", "manufacturer", "model_number", "lot_number", "serial_number", "production_date", "supplier", "category"] as const;
export type InventoryRow = {
  line: number; location_code: string; sku: string; product_name: string;
  quantity_on_hand: number; inventory_as_of: string;
  brand: string; gtin: string; manufacturer: string; model_number: string;
  lot_number: string; serial_number: string; production_date: string; supplier: string; category: string;
};
export type InventoryIssue = { line: number; field: string; message: string };
export type InventoryParseResult = { rows: InventoryRow[]; issues: InventoryIssue[]; issueCount: number; headers: string[] };

// A separate, strict parser keeps household CSV behavior unchanged. Supports
// escaped quotes, quoted commas and multiline fields, with physical line numbers.
function records(input: string): { cells: string[]; line: number }[] {
  const result: { cells: string[]; line: number }[] = [];
  let cells: string[] = [], value = "", quoted = false, closed = false, line = 1, start = 1;
  const field = () => {
    cells.push(value.trim()); value = ""; closed = false;
    if (cells.length > inventoryRequiredHeaders.length + inventoryOptionalHeaders.length) throw new Error(`Line ${line}: too many columns. Use the template headers.`);
  };
  const record = () => {
    field();
    if (cells.some(cell => cell.length)) result.push({ cells, line: start });
    cells = [];
    if (result.length > MAX_INVENTORY_ROWS + 1) throw new Error(`Import up to ${MAX_INVENTORY_ROWS.toLocaleString()} data rows per file.`);
  };
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') { value += '"'; index++; }
        else { quoted = false; closed = true; }
      } else {
        if (char === "\n") line++;
        value += char;
      }
    } else if (char === ",") field();
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[index + 1] === "\n") index++;
      record(); line++; start = line;
    } else if (char === '"') {
      if (closed || value.trim()) throw new Error(`Line ${line}: unexpected quote.`);
      value = ""; quoted = true;
    } else {
      if (closed && char.trim()) throw new Error(`Line ${line}: unexpected text after a closing quote.`);
      value += char;
    }
  }
  if (quoted) throw new Error(`Line ${start}: quoted field is not closed.`);
  if (value || cells.length || closed) record();
  return result;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function inventoryStockKey(row: Pick<InventoryRow, "sku" | "lot_number" | "serial_number">) {
  return JSON.stringify([row.sku, row.lot_number, row.serial_number]);
}

export function parseInventoryCsv(input: string, allowedLocationCodes: readonly string[], now = new Date()): InventoryParseResult {
  const result: InventoryParseResult = { rows: [], issues: [], issueCount: 0, headers: [] };
  const issue = (line: number, field: string, message: string) => {
    result.issueCount++;
    if (result.issues.length < 200) result.issues.push({ line, field, message });
  };
  if (new TextEncoder().encode(input).length > MAX_INVENTORY_BYTES) { issue(1, "file", "Use a CSV file no larger than 5 MB."); return result; }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(input)) { issue(1, "file", "The file contains invalid control characters. Export a UTF-8 CSV."); return result; }
  let parsed;
  try { parsed = records(input.replace(/^\uFEFF/, "")); }
  catch (error) { issue(1, "file", error instanceof Error ? error.message : "CSV could not be read."); return result; }
  if (!parsed.length) { issue(1, "file", "The CSV is empty."); return result; }
  const headers = parsed[0].cells.map(value => value.toLowerCase());
  result.headers = headers;
  const known = new Set<string>([...inventoryRequiredHeaders, ...inventoryOptionalHeaders]);
  if (headers.length !== new Set(headers).size) issue(parsed[0].line, "headers", "Duplicate column names are not allowed.");
  for (const field of inventoryRequiredHeaders) if (!headers.includes(field)) issue(parsed[0].line, "headers", `Missing required column: ${field}.`);
  for (const field of headers) if (!known.has(field)) issue(parsed[0].line, "headers", `Unknown column: ${field.slice(0, 80) || "(blank)"}. Use the template headers.`);
  if (result.issueCount) return result;
  if (parsed.length === 1) { issue(1, "file", "The CSV has no stock rows. Use explicit zero quantities for out-of-stock items; empty snapshots are not imported."); return result; }
  const allowed = new Set(allowedLocationCodes.map(code => code.toUpperCase()));
  const keys = new Set<string>();
  const timestamps = new Map<string, string>();
  for (const { cells, line } of parsed.slice(1)) {
    if (cells.length !== headers.length) { issue(line, "columns", `Expected ${headers.length} columns, found ${cells.length}.`); continue; }
    const fields = Object.fromEntries(headers.map((header, index) => [header, cells[index]]));
    for (const name of inventoryOptionalHeaders) fields[name] ??= "";
    fields.location_code = fields.location_code.toUpperCase();
    for (const name of inventoryRequiredHeaders) if (!fields[name]) issue(line, name, "This field is required.");
    for (const [name, value] of Object.entries(fields)) {
      const max = name === "location_code" ? 20 : name === "product_name" ? 200 : 120;
      if (value.length > max) issue(line, name, `Use at most ${max} characters.`);
    }
    if (!allowed.has(fields.location_code)) issue(line, "location_code", "Location is not among the selected active stores for this business.");
    if (!/^\d+$/.test(fields.quantity_on_hand) || Number(fields.quantity_on_hand) > 2_147_483_647) issue(line, "quantity_on_hand", "Use a whole number from 0 to 2147483647; no negatives, fractions or thousands separators.");
    const timestamp = fields.inventory_as_of;
    const time = new Date(timestamp).getTime();
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp) || !validDate(timestamp.slice(0, 10)) || !Number.isFinite(time)) issue(line, "inventory_as_of", "Use an ISO timestamp with timezone, e.g. 2026-10-21T10:00:00-04:00.");
    else if (time > now.getTime() + 5 * 60_000) issue(line, "inventory_as_of", "Timestamp is more than five minutes in the future.");
    else {
      fields.inventory_as_of = new Date(time).toISOString();
      if (timestamps.has(fields.location_code) && timestamps.get(fields.location_code) !== fields.inventory_as_of) issue(line, "inventory_as_of", "All rows for a store must use the same inventory timestamp.");
      timestamps.set(fields.location_code, fields.inventory_as_of);
    }
    if (fields.gtin && !isValidGtin(fields.gtin)) issue(line, "gtin", "Check the GTIN length and check digit; store SKUs are not barcodes.");
    if (fields.production_date && !validDate(fields.production_date)) issue(line, "production_date", "Use a valid YYYY-MM-DD date or leave blank.");
    const key = JSON.stringify([fields.location_code, fields.sku, fields.lot_number, fields.serial_number]);
    if (keys.has(key)) issue(line, "sku", "Duplicate SKU/lot/serial stock key in this store; rows are not silently added together.");
    keys.add(key);
    result.rows.push({ ...fields, line, quantity_on_hand: Number(fields.quantity_on_hand) } as InventoryRow);
  }
  for (const code of allowed) if (!result.rows.some(row => row.location_code === code)) issue(1, "location_code", `Selected store ${code} has no rows. Select only stores contained in this complete snapshot.`);
  return result;
}
