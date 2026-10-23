import { before, after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { syncRecallProvider } from "@/lib/sync-recalls";
import { syncAllLiveProviders } from "@/lib/live-providers";
import type { NormalizedRecall } from "@/domain/types";

describe("source refresh integrity", () => {
  const directory = mkdtempSync(join(tmpdir(), "safekeep-refresh-"));
  const hostedUrl = process.env.TEST_DATABASE_URL;
  if (hostedUrl) { const url = new URL(hostedUrl); assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname === "/safekeep_test"); }
  const client = new PrismaClient({ datasourceUrl: hostedUrl ?? `file:${join(directory, "test.db")}` });
  const notice: NormalizedRecall = { sourceAuthority: "FDA / openFDA", externalId: "refresh-test", headline: "Test almond butter", description: "Contamination", brand: "Test", productName: "Almond butter", category: "Food", upcs: ["012345678905"], lotNumbers: [], recallDate: new Date("2026-10-01"), recommendedAction: "Check packaging", sourceUrl: "https://api.fda.gov/food/enforcement.json", rawData: {} };
  const provider = (records = [notice], partial = false) => ({ name: "refresh-test-provider", managedAuthorities: [notice.sourceAuthority], fetchRecalls: async () => ({ records, status: partial ? "PARTIAL" as const : "SUCCEEDED" as const, replaceSnapshot: !partial }) });
  let purchaseId: string;
  before(async () => {
    if (!hostedUrl) { writeFileSync(join(directory, "test.db"), ""); execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "push", "--schema", "prisma/schema.prisma", "--skip-generate"], { env: { ...process.env, DATABASE_URL: `file:${join(directory, "test.db")}` }, stdio: "pipe" }); }
    purchaseId = (await client.purchase.create({ data: { productName: "Almond butter", brand: "Test", category: "Food", upc: "012345678905", purchaseDate: new Date("2026-10-01"), retailer: "Test", source: "MANUAL" } })).id;
  });
  after(async () => { await client.purchase.delete({ where: { id: purchaseId } }); await client.recall.deleteMany({ where: { sourceAuthority: notice.sourceAuthority } }); await client.$disconnect(); rmSync(directory, { recursive: true, force: true }); });
  it("bulk loads notices and keeps unchanged IDs, timestamps, revisions and user decisions", async () => {
    const records = [notice, ...Array.from({ length: 205 }, (_, i) => ({ ...notice, externalId: `refresh-extra-${i}`, productName: "Garden tool", brand: "Other", upcs: [] }))];
    await syncRecallProvider(provider(records), client);
    const first = await client.recall.findUniqueOrThrow({ where: { sourceAuthority_externalId: { sourceAuthority: notice.sourceAuthority, externalId: notice.externalId } } });
    const match = await client.recallMatch.findUniqueOrThrow({ where: { purchaseId_recallId: { purchaseId, recallId: first.id } } });
    await client.recallMatch.update({ where: { id: match.id }, data: { status: "DISMISSED" } });
    await syncRecallProvider(provider(records), client);
    const again = await client.recall.findUniqueOrThrow({ where: { id: first.id } });
    assert.equal(again.updatedAt.toISOString(), first.updatedAt.toISOString());
    assert.equal((await client.recallMatch.findUniqueOrThrow({ where: { id: match.id } })).status, "DISMISSED");
    const history = await client.noticeHistory.findUniqueOrThrow({ where: { sourceAuthority_externalId: { sourceAuthority: notice.sourceAuthority, externalId: notice.externalId } } });
    assert.equal(history.revisionCount, 1);
  });
  it("rejects empty/duplicate snapshots and preserves last successful coverage", async () => {
    const before = await client.recall.count();
    for (const records of [[], [notice, notice]]) await assert.rejects(syncRecallProvider(provider(records), client));
    assert.equal(await client.recall.count(), before);
    const state = await client.syncState.findUniqueOrThrow({ where: { id: "refresh-test-provider" } });
    assert.equal(state.status, "FAILED"); assert.ok(state.lastSuccessAt);
    assert.equal(state.recordCount, 206);
  });
  it("partial refreshes preserve old coverage and unmatched purchases remain unchanged", async () => {
    const before = await client.purchase.findUniqueOrThrow({ where: { id: purchaseId } });
    await syncRecallProvider(provider([{ ...notice, externalId: "refresh-partial", upcs: [], brand: "Other", productName: "Garden tool" }], true), client);
    assert.equal((await client.syncState.findUniqueOrThrow({ where: { id: "refresh-test-provider" } })).recordCount, 207);
    assert.deepEqual(await client.purchase.findUniqueOrThrow({ where: { id: purchaseId } }), before);
    await syncRecallProvider(provider([{ ...notice, productName: "Garden tool", brand: "Other", upcs: [] }]), client);
    assert.equal(await client.recallMatch.count({ where: { purchaseId } }), 0);
  });
  it("reports partial coverage and continues to other feeds after an individual failure", async () => {
    const broken = { name: "refresh-broken-provider", fetchRecalls: async () => { throw new Error("Source unavailable"); } };
    const results = await syncAllLiveProviders([broken, provider([notice], true), provider()], client);
    assert.deepEqual(results.map(result => result.status), ["failed", "partial", "succeeded"]);
  });
});
