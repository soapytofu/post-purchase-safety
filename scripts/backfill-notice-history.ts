import { Prisma, PrismaClient } from "@prisma/client";
import { recordNoticeBatch } from "../src/lib/notice-history";

// Load credentials through the shell's environment or Node --env-file; never
// print them. This command does not fetch providers, regenerate household
// matches, send email, or alter current inventory.
const client = new PrismaClient();
const apply = process.argv.includes("--apply");
async function main() {
  const [notices, histories] = await Promise.all([client.recall.count({ where: { isFixture: false } }), client.noticeHistory.count()]);
  console.log(`${notices} non-demo catalog notices; ${histories} observed notice histories. Mode: ${apply ? "capture baseline" : "dry run"}.`);
  if (!apply) { console.log("Pass --apply to capture current content in bounded transactions. Repeated unchanged captures do not add revisions."); return; }
  let cursor = "", processed = 0;
  while (true) {
    const ids = await client.recall.findMany({ where: { isFixture: false, id: { gt: cursor } }, select: { id: true }, orderBy: { id: "asc" }, take: 100 });
    if (!ids.length) break;
    await client.$transaction(async tx => {
      if (/^postgres(?:ql)?:/.test(process.env.DATABASE_URL ?? "")) await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Recall" WHERE "id" IN (${Prisma.join(ids.map(item => item.id))}) ORDER BY "id" FOR UPDATE`);
      const records = await tx.recall.findMany({ where: { id: { in: ids.map(item => item.id) }, isFixture: false }, orderBy: { id: "asc" } });
      await recordNoticeBatch(tx, records, "BASELINE");
    }, { timeout: 30_000 });
    processed += ids.length; cursor = ids.at(-1)!.id;
    console.log(`Captured/checked ${processed} notices.`);
  }
  console.log("Baseline capture complete. Earlier versions before this capture cannot be reconstructed.");
}
main().catch(error => { console.error(error instanceof Error ? error.message : "History capture failed."); process.exitCode = 1; }).finally(() => client.$disconnect());
