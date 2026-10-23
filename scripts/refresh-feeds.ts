import { prisma } from "../src/lib/prisma";
import { syncAllLiveProviders } from "../src/lib/live-providers";
import { sourceHealth } from "../src/lib/source-health";

// Credentials come from the environment, never arguments or output. No schema
// changes, fixture seeding, purchase imports, or outbound emails happen here.
async function main() {
  if (!process.argv.includes("--apply")) {
    console.log("Refresh FDA, USDA FSIS, and CPSC; preserve history and rematch existing purchases. Pass --apply to run. No email delivery is performed.");
    return;
  }
  if (!process.env.DATABASE_URL) throw new Error("Database configuration missing");
  console.log(JSON.stringify({ event: "feed-refresh-started", at: new Date().toISOString() }));
  const results = await syncAllLiveProviders();
  // Public CI logs contain only provider names, counts and status. Prisma and
  // network exception strings can contain infrastructure details: omit them.
  for (const { provider, status, count } of results) console.log(JSON.stringify({ provider, status, count }));
  const health = sourceHealth(await prisma.syncState.findMany());
  console.log(JSON.stringify({ event: "feed-refresh-completed", healthy: health.healthy, sources: health.sources }));
  if (!health.healthy || results.some(result => result.status !== "succeeded")) process.exitCode = 1;
}
main().catch(() => {
  console.error("Feed refresh failed. Check database connectivity/configuration and the app's source coverage details; credentials are not logged.");
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
