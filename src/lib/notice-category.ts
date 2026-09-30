import type { Prisma } from "@prisma/client";

export const noticeCategories = [
  { id: "food", label: "Food & beverages", description: "FDA-regulated foods, drinks, supplements, and pet food" },
  { id: "meat", label: "Meat, poultry & eggs", description: "USDA FSIS recalls and public-health alerts" },
  { id: "baby-kids", label: "Baby & kids", description: "Toys, nursery products, children’s furniture, and gear" },
  { id: "home", label: "Home & furniture", description: "Furniture, kitchenware, household goods, and fixtures" },
  { id: "electronics", label: "Appliances & electronics", description: "Batteries, chargers, appliances, and connected devices" },
  { id: "outdoor", label: "Outdoor & recreation", description: "Sports, bicycles, pools, camping, and recreation products" },
  { id: "other", label: "Other consumer products", description: "Additional CPSC-regulated products" },
] as const;

export type NoticeCategoryId = typeof noticeCategories[number]["id"];

const fieldContains = (value: string): Prisma.RecallWhereInput[] => [
  { headline: { contains: value } },
  { productName: { contains: value } },
  { category: { contains: value } },
  { description: { contains: value } },
];

const keywordWhere = (keywords: readonly string[]): Prisma.RecallWhereInput => ({ OR: keywords.flatMap(fieldContains) });

const babyKeywords = ["baby", "babies", "infant", "child", "children", "toddler", "toy", "crib", "stroller", "nursery", "high chair", "car seat", "play yard"];
const electronicsKeywords = ["battery", "charger", "power bank", "electronic", "appliance", "refrigerator", "freezer", "range", "oven", "microwave", "heater", "fan", "vacuum", "dryer"];
const outdoorKeywords = ["bicycle", "bike", "helmet", "sport", "pool", "camp", "outdoor", "atv", "scooter", "skate", "exercise", "fitness"];
const homeKeywords = ["furniture", "household", "kitchen", "chair", "table", "dresser", "cabinet", "mattress", "mug", "stool", "lamp", "candle", "cookware"];

const consumerGroups = [keywordWhere(babyKeywords), keywordWhere(electronicsKeywords), keywordWhere(outdoorKeywords), keywordWhere(homeKeywords)];

export function categoryWhere(category: string): Prisma.RecallWhereInput {
  if (category === "food") return { sourceAuthority: { contains: "FDA" } };
  if (category === "meat") return { sourceAuthority: "USDA FSIS" };
  if (category === "baby-kids") return { AND: [{ sourceAuthority: "CPSC" }, keywordWhere(babyKeywords)] };
  if (category === "electronics") return { AND: [{ sourceAuthority: "CPSC" }, keywordWhere(electronicsKeywords)] };
  if (category === "outdoor") return { AND: [{ sourceAuthority: "CPSC" }, keywordWhere(outdoorKeywords)] };
  if (category === "home") return { AND: [{ sourceAuthority: "CPSC" }, keywordWhere(homeKeywords)] };
  if (category === "other") return { AND: [{ sourceAuthority: "CPSC" }, { NOT: { OR: consumerGroups } }] };
  return {};
}

export function broadCategoryFor(notice: { sourceAuthority: string; headline: string; productName: string; category: string; description: string }): string {
  if (notice.sourceAuthority === "USDA FSIS") return "Meat, poultry & eggs";
  if (notice.sourceAuthority.includes("FDA")) return "Food & beverages";
  const text = `${notice.headline} ${notice.productName} ${notice.category} ${notice.description}`.toLowerCase();
  const matches = (keywords: readonly string[]) => keywords.some((keyword) => text.includes(keyword));
  if (matches(babyKeywords)) return "Baby & kids";
  if (matches(electronicsKeywords)) return "Appliances & electronics";
  if (matches(outdoorKeywords)) return "Outdoor & recreation";
  if (matches(homeKeywords)) return "Home & furniture";
  return "Other consumer products";
}
