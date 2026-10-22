import { before, after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { provisionHousehold } from "@/lib/household-data";
import { createOrganization, saveLocation, acceptBusinessInvitation, inviteBusinessMember, setLocationArchived } from "@/lib/business-data";
import { previewInventoryCsv, commitInventoryImport } from "@/lib/business-inventory";
import { getBusinessCase, listBusinessCases, refreshBusinessCase, reviewBusinessCase, saveBusinessCase } from "@/lib/business-cases";
import { noticeContent, recordNoticeRevision } from "@/lib/notice-history";
import { syncRecallProvider } from "@/lib/sync-recalls";
import type { NormalizedRecall } from "@/domain/types";

describe("saved business recall cases and source history", () => {
  const directory = mkdtempSync(join(tmpdir(), "safekeep-cases-"));
  const hostedUrl = process.env.TEST_DATABASE_URL;
  if (hostedUrl) { const url = new URL(hostedUrl); assert.ok(["127.0.0.1", "localhost"].includes(url.hostname) && url.pathname === "/safekeep_test"); }
  const client = new PrismaClient({ datasourceUrl: hostedUrl ?? `file:${join(directory, "test.db")}` });
  const owner = { id: "case-owner", email: "case-owner@example.test" }, other = { id: "case-other", email: "case-other@example.test" }, staff = { id: "case-staff", email: "case-staff@example.test" };
  let org: string, foreign: string, location: string, stockId: string, recallId: string, caseId: string;
  const source: NormalizedRecall = { sourceAuthority: "FDA", externalId: "case-test-original", headline: "Orchard almond butter recall", description: "Test affected lot A1", productName: "Orchard almond butter", brand: "Orchard", category: "Food", upcs: ["012345678905"], lotNumbers: ["A1"], recallDate: new Date("2026-10-01"), recommendedAction: "Check packaging and contact supplier", sourceUrl: "https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts", rawData: { model: "AB", scope: "A1" } };
  const provider = (records: NormalizedRecall[]) => ({ name: "case-test-provider", managedAuthorities: ["FDA"], fetchRecalls: async () => ({ records, status: "SUCCEEDED" as const, replaceSnapshot: true }) });
  const detail = (options = {}, userId = owner.id) => getBusinessCase(client, userId, org, caseId, options);
  async function save(userId = owner.id, organizationId = org) {
    const notice = await client.recall.findUniqueOrThrow({ where: { id: recallId } });
    return saveBusinessCase(client, userId, organizationId, { stockRowId: stockId, recallId, noticeUpdatedAt: notice.updatedAt.toISOString() });
  }
  async function importStock(quantity: number, time: string) {
    const draft = await previewInventoryCsv(client, owner.id, org, "case.csv", `location_code,sku,product_name,quantity_on_hand,inventory_as_of,brand,gtin,lot_number\nMAIN,SKU0001,Orchard almond butter,${quantity},${time},Orchard,012345678905,A1`, [location]);
    await commitInventoryImport(client, owner.id, org, draft.preview!.id);
    const store = await client.businessLocation.findUniqueOrThrow({ where: { id: location } });
    return (await client.inventoryStockRow.findFirstOrThrow({ where: { organizationId: org, snapshotId: store.currentSnapshotId! } })).id;
  }
  before(async () => {
    if (!hostedUrl) { writeFileSync(join(directory, "test.db"), ""); execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "push", "--schema", "prisma/schema.prisma", "--skip-generate"], { env: { ...process.env, DATABASE_URL: `file:${join(directory, "test.db")}` }, stdio: "pipe" }); }
    for (const identity of [owner, other, staff]) await provisionHousehold(client, identity.id);
    org = (await createOrganization(client, owner, "Case test shop")).id;
    foreign = (await createOrganization(client, other, "Foreign case shop")).id;
    location = (await saveLocation(client, owner.id, org, { code: "MAIN", name: "Original name" })).id;
    await acceptBusinessInvitation(client, staff, await inviteBusinessMember(client, owner.id, org, { email: staff.email, role: "STAFF" }));
    stockId = await importStock(5, "2026-10-20T09:00:00Z");
    await syncRecallProvider(provider([source]), client);
    recallId = (await client.recall.findUniqueOrThrow({ where: { sourceAuthority_externalId: { sourceAuthority: source.sourceAuthority, externalId: source.externalId } } })).id;
  });
  after(async () => { await client.recall.deleteMany({ where: { externalId: { startsWith: "case-test-" } } }); await client.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

  it("deduplicates unchanged source content, ignores object/identifier ordering and preserves raw scope", async () => {
    const initial = await client.recall.findUniqueOrThrow({ where: { id: recallId } });
    const revision = await client.$transaction(tx => recordNoticeRevision(tx, initial, "CASE_SAVE"));
    assert.equal(revision.number, 1);
    assert.equal(noticeContent({ ...initial, updatedAt: new Date(), rawData: '{"scope":"A1","model":"AB"}' }).contentHash, revision.contentHash);
    await syncRecallProvider(provider([source]), client);
    const history = await client.noticeHistory.findUniqueOrThrow({ where: { sourceAuthority_externalId: { sourceAuthority: source.sourceAuthority, externalId: source.externalId } } });
    assert.equal(history.revisionCount, 1);
    assert.equal(JSON.parse(revision.payload).rawData.scope, "A1");
  });
  it("saves one case and one immutable observation for repeated clicks without changing household data", async () => {
    const purchases = await client.purchase.count(), matches = await client.recallMatch.count(), emails = await client.emailNotification.count();
    caseId = (await save()).caseId;
    assert.equal((await save()).alreadySaved, true);
    const result = await detail();
    assert.equal(result.stock.quantityOnHand, 5); assert.equal(result.stock.storeName, "Original name");
    assert.equal(result.events.length, 1); assert.equal(result.item.status, "NEEDS_REVIEW");
    assert.equal(await client.businessRecallCase.count({ where: { organizationId: org } }), 1);
    assert.equal(await client.purchase.count(), purchases); assert.equal(await client.recallMatch.count(), matches); assert.equal(await client.emailNotification.count(), emails);
  });
  it("permits staff reads but rejects staff writes, nonmembers and cross-organization case IDs", async () => {
    assert.equal((await detail({}, staff.id)).item.id, caseId);
    await assert.rejects(save(staff.id)); await assert.rejects(save(other.id)); await assert.rejects(save(other.id, foreign));
    await assert.rejects(getBusinessCase(client, other.id, foreign, caseId));
    await assert.rejects(detail({ observationId: "unknown-observation" }));
    assert.equal((await listBusinessCases(client, other.id, foreign)).total, 0);
  });
  it("requires evidence, a reason and valid quantities; rejects stale decisions", async () => {
    const before = await detail();
    const input = { caseId, expectedVersion: before.item.version, observationId: before.latest.id, status: "CONFIRMED_AFFECTED", note: "Packaging has the affected lot A1.", affectedQuantity: 3, evidenceReviewed: true };
    await assert.rejects(reviewBusinessCase(client, staff.id, org, input));
    await assert.rejects(reviewBusinessCase(client, owner.id, org, { ...input, evidenceReviewed: false }));
    await assert.rejects(reviewBusinessCase(client, owner.id, org, { ...input, affectedQuantity: 6 }));
    await reviewBusinessCase(client, owner.id, org, input);
    await assert.rejects(reviewBusinessCase(client, owner.id, org, input), /changed/);
    assert.equal((await detail()).item.affectedQuantity, 3);
  });
  it("captures a changed notice, reopens decided cases and retains the earlier decision/evidence", async () => {
    const before = await detail();
    await syncRecallProvider(provider([{ ...source, lotNumbers: ["B2"], recommendedAction: "Expanded notice: contact supplier immediately" }]), client);
    const changed = await detail();
    assert.equal(changed.item.status, "NEEDS_REVIEW"); assert.equal(changed.item.affectedQuantity, null);
    assert.equal(changed.latest.noticeRevision.number, 1); assert.equal(changed.item.noticeHistory.revisionCount, 2);
    assert.equal(changed.currentNoticeChanged, true); assert.ok(changed.events.some(event => event.kind === "NOTICE_CHANGED"));
    await assert.rejects(reviewBusinessCase(client, owner.id, org, { caseId, expectedVersion: changed.item.version, observationId: changed.latest.id, status: "NOT_AFFECTED", note: "Lot does not match revised scope.", evidenceReviewed: true }), /notice changed/);
    await refreshBusinessCase(client, owner.id, org, caseId, changed.item.version);
    const refreshed = await detail();
    assert.equal(refreshed.latest.noticeRevision.number, 2); assert.ok(refreshed.evidence.conflicts.some(c => c.includes("Lot differs")));
    assert.equal((await detail({ observationId: before.observation.id })).notice.lotNumbers[0], "A1");
    assert.equal((await refreshBusinessCase(client, owner.id, org, caseId, refreshed.item.version)).alreadyCurrent, true);
  });
  it("attaches replacement stock to the same case, preserving quantities and location names from earlier evidence", async () => {
    const previous = await detail();
    await saveLocation(client, owner.id, org, { code: "MAIN", name: "Renamed store" }, location);
    const oldId = stockId;
    stockId = await importStock(9, "2026-10-21T09:00:00Z");
    const notice = await client.recall.findUniqueOrThrow({ where: { id: recallId } });
    await assert.rejects(saveBusinessCase(client, owner.id, org, { stockRowId: oldId, recallId, noticeUpdatedAt: notice.updatedAt.toISOString() }), /Stock changed/);
    assert.equal((await save()).caseId, caseId);
    assert.equal((await detail()).stock.quantityOnHand, 9);
    const historic = await detail({ observationId: previous.observation.id });
    assert.equal(historic.stock.quantityOnHand, 5); assert.equal(historic.stock.storeName, "Original name");
  });
  it("preserves cases when a source drops the notice or a store is archived", async () => {
    await syncRecallProvider(provider([{ ...source, externalId: "case-test-other", productName: "Unrelated garden rake", upcs: [] }]), client);
    const missing = await detail(); assert.equal(missing.catalogMissing, true); assert.equal(missing.notice.externalId, source.externalId);
    assert.equal(missing.item.status, "NEEDS_REVIEW");
    await assert.rejects(refreshBusinessCase(client, owner.id, org, caseId, missing.item.version), /absent/);
    await setLocationArchived(client, owner.id, org, location, true);
    assert.equal((await listBusinessCases(client, owner.id, org)).total, 1);
    assert.ok((await detail()).item.location.archivedAt);
  });
  it("serializes concurrent source changes, saves and decisions without losing evidence", { skip: !hostedUrl }, async () => {
    await setLocationArchived(client, owner.id, org, location, false);
    await syncRecallProvider(provider([source]), client);
    recallId = (await client.recall.findUniqueOrThrow({ where: { sourceAuthority_externalId: { sourceAuthority: source.sourceAuthority, externalId: source.externalId } } })).id;
    await save();
    const before = await detail();
    const outcomes = await Promise.allSettled([
      syncRecallProvider(provider([{ ...source, recommendedAction: "Updated concurrent source instructions" }]), client),
      reviewBusinessCase(client, owner.id, org, { caseId, expectedVersion: before.item.version, observationId: before.latest.id, status: "NOT_AFFECTED", note: "Reviewed packaging and supplier records.", evidenceReviewed: true }),
    ]);
    assert.equal(outcomes[0].status, "fulfilled");
    if (outcomes[1].status === "rejected") assert.match(String(outcomes[1].reason), /changed/);
    const updated = await detail();
    assert.equal(updated.item.status, "NEEDS_REVIEW");
    assert.ok(updated.item.noticeHistory.revisionCount > before.item.noticeHistory.revisionCount);
    const saved = await Promise.all([save(), save()]);
    assert.equal(saved[0].caseId, saved[1].caseId);
    assert.equal(saved.filter(result => result.alreadySaved).length, 1);
    const observations = await client.businessCaseObservation.findMany({ where: { caseId }, orderBy: { sequence: "asc" } });
    assert.deepEqual(observations.map(item => item.sequence), observations.map((_, index) => index + 1));
    assert.equal((await detail()).latest.id, observations.at(-1)!.id);
  });
  it("rolls back both catalog changes and history when synchronization fails mid-transaction", async () => {
    const before = await client.noticeRevision.count();
    const catalog = await client.recall.findMany({ where: { externalId: { startsWith: "case-test-" } } });
    await assert.rejects(syncRecallProvider(provider([{ ...source, upcs: [7] as unknown as string[] }]), client));
    assert.equal(await client.noticeRevision.count(), before);
    assert.deepEqual(await client.recall.findMany({ where: { externalId: { startsWith: "case-test-" } } }), catalog);
  });
  it("protects saved history from direct API access and modifications in PostgreSQL", { skip: !hostedUrl }, async () => {
    for (const table of ["NoticeHistory", "NoticeRevision", "BusinessRecallCase", "BusinessCaseObservation", "BusinessCaseEvent"]) for (const role of ["anon", "authenticated"]) {
      await assert.rejects(client.$transaction(async tx => { await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`); return tx.$queryRawUnsafe(`SELECT * FROM "${table}" LIMIT 1`); }), /permission denied|row-level security/i);
    }
    for (const table of ["NoticeRevision", "BusinessCaseObservation", "BusinessCaseEvent"]) {
      await assert.rejects(client.$executeRawUnsafe(`UPDATE "${table}" SET id = id`), /append-only/);
      await assert.rejects(client.$executeRawUnsafe(`DELETE FROM "${table}"`), /append-only/);
    }
  });
});
