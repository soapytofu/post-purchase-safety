import { z } from "zod";

export function isValidGtin(value: string): boolean {
  if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(value)) return false;
  const digits = [...value].map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - sum % 10) % 10 === check;
}

export const receiptSchema = z.object({
  merchant: z.string().trim().min(1).max(120),
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const date = new Date(`${value}T12:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }),
  items: z.array(z.object({
    productName: z.string().trim().min(1).max(200),
    brand: z.string().trim().max(120).transform(value => value || "Not specified"),
    category: z.string().trim().min(1).max(120),
    upc: z.string().trim().refine(value => !value || isValidGtin(value), "Check the barcode digits").optional().transform(value => value || null),
    lotNumber: z.string().trim().max(80).optional().transform(value => value || null),
  })).min(1).max(50),
});
