import { PrismaClient, PurchaseSource } from "@prisma/client";
import { FixtureRecallProvider } from "../src/providers/fixture-recall-provider";
import { matchPurchaseToRecall } from "../src/domain/matching/match";

const prisma = new PrismaClient();
const d = (value: string) => new Date(`${value}T12:00:00.000Z`);

const purchases = [
  ["Romaine Lettuce Salad Kit 12 oz", "Green Valley", "Packaged Produce", "Whole Foods", "2026-09-03", "041234567890", "RV2409A"],
  ["Large Brown Eggs Grade A", "Morning Meadow", "Dairy & Eggs", "Fresh Market", "2026-09-02", "072345678901", null],
  ["PocketCharge 10000 USB-C Power Bank", "VoltNest", "Electronics", "ElectroMart", "2026-08-21", "083456789012", "VN26Q2"],
  ["AirSweep Cordless Vacuum", "BrightHome", "Household", "Home Center", "2026-06-14", null, null],
  ["Creamy Peanut Butter 16 oz", "Pantry Oak", "Pantry", "Value Grocer", "2026-07-20", "015678901234", "PB77X"],
  ["Organic Baby Spinach", "Green Valley", "Packaged Produce", "Whole Foods", "2026-09-05", null, null],
  ["Triple Berry Frozen Blend", "North Orchard", "Frozen", "Market Basket", "2026-06-30", null, null],
  ["Moon Glow Night Light", "Little Beacon", "Household", "Kids & Co", "2026-03-18", "037890123456", "MG44"],
  ["Stainless Travel Mug 20 oz", "Trail Cup", "Kitchen", "Outdoor Supply", "2026-05-11", "048901234567", null],
  ["Classic Chicken Noodle Soup", "Hearth Table", "Pantry", "Value Grocer", "2026-07-09", "059012345678", "CN810"],
  ["Two Step Folding Stool", "Home Harbor", "Household", "Home Center", "2026-04-22", "060123456789", "HH999"],
  ["Honey Oat Granola", "Sunrise Mill", "Breakfast", "Fresh Market", "2026-09-01", "071234567890", null],
  ["Sparkling Mineral Water", "Clear Spring", "Beverages", "Corner Shop", "2026-09-08", "082345678901", null],
  ["Dishwasher Detergent Pods", "Clean Current", "Household", "Value Grocer", "2026-08-28", "093456789012", null],
  ["LED Desk Lamp", "Northline", "Electronics", "Office Works", "2026-08-12", "014567890123", null],
  ["Whole Bean Coffee", "Harbor Roasters", "Beverages", "Corner Shop", "2026-09-06", "025678901234", "HR62"],
  ["Cotton Bath Towels", "Soft Loom", "Household", "Home Center", "2026-07-17", "036789012345", null],
  ["Tomato Basil Pasta Sauce", "Garden Jar", "Pantry", "Market Basket", "2026-08-25", "047890123456", null],
  ["Wireless Computer Mouse", "KeyWorks", "Electronics", "Office Works", "2026-05-03", "058901234567", "KW19"],
  ["Cinnamon Raisin Bread", "Daily Hearth", "Bakery", "Fresh Market", "2026-09-07", "069012345678", null],
] as const;

async function main() {
  await prisma.recallMatch.deleteMany();
  await prisma.purchase.deleteMany();
  await prisma.recall.deleteMany();
  await prisma.syncState.deleteMany();

  for (const [productName, brand, category, retailer, purchaseDate, upc, lotNumber] of purchases) {
    await prisma.purchase.create({ data: { productName, brand, category, retailer, purchaseDate: d(purchaseDate), upc, lotNumber, source: PurchaseSource.DEMO } });
  }

  const provider = new FixtureRecallProvider();
  const recalls = await provider.fetchRecalls();
  for (const recall of recalls) {
    await prisma.recall.create({ data: { ...recall, upcs: JSON.stringify(recall.upcs), lotNumbers: JSON.stringify(recall.lotNumbers), rawData: JSON.stringify({ fixture: true }) } });
  }

  const [savedPurchases, savedRecalls] = await Promise.all([prisma.purchase.findMany(), prisma.recall.findMany()]);
  for (const purchase of savedPurchases) {
    for (const recall of savedRecalls) {
      const domainRecall = { ...recall, upcs: JSON.parse(recall.upcs), lotNumbers: JSON.parse(recall.lotNumbers), rawData: JSON.parse(recall.rawData) };
      const result = matchPurchaseToRecall(purchase, domainRecall);
      if (result.confidence !== "NONE") {
        await prisma.recallMatch.create({ data: { purchaseId: purchase.id, recallId: recall.id, confidence: result.confidence, score: result.score, reasons: JSON.stringify(result.reasons) } });
      }
    }
  }
  const syncedAt = new Date();
  await prisma.syncState.create({ data: { id: provider.name, provider: provider.name, syncedAt, lastAttemptAt: syncedAt, lastSuccessAt: syncedAt, status: "SUCCEEDED", recordCount: recalls.length } });
}

main().finally(() => prisma.$disconnect());
