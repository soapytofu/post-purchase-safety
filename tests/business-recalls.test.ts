import { before, after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { provisionHousehold } from "@/lib/household-data";
import { acceptBusinessInvitation, changeBusinessMember, createOrganization, inviteBusinessMember, saveLocation, setLocationArchived } from "@/lib/business-data";
import { commitInventoryImport, previewInventoryCsv } from "@/lib/business-inventory";
import { getBusinessRecallInbox } from "@/lib/business-recalls";

describe("read-only business recall inbox", () => {
  const directory = mkdtempSync(join(tmpdir(), "safekeep-business-recalls-"));
  const hostedUrl = process.env.TEST_DATABASE_URL;
  if (hostedUrl) { const url = new URL(hostedUrl); assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname === "/safekeep_test"); }
  const client = new PrismaClient({ datasourceUrl: hostedUrl ?? `file:${join(directory, "test.db")}` });
  const owner = { id: "recall-business-owner", email: "recall-owner@example.test" };
  const outsider = { id: "recall-business-outsider", email: "recall-outsider@example.test" };
  const staff = { id: "recall-business-staff", email: "recall-staff@example.test" };
  let org: string, otherOrg: string, main: string, second: string, otherLocation: string, household: string;
  const header = "location_code,sku,product_name,quantity_on_hand,inventory_as_of,brand,gtin,lot_number";
  const inbox = (options = {}, userId = owner.id) => getBusinessRecallInbox(client, userId, org, options);
  async function upload(location: string, code: string, quantity: number, time: string) {
    const draft = await previewInventoryCsv(client, owner.id, org, "stock.csv", `${header}\n${code},SKU-0001,Organic peanut butter,${quantity},${time},Acme,012345678905,A1`, [location]);
    await commitInventoryImport(client, owner.id, org, draft.preview!.id);
  }
  before(async () => {
    if (!hostedUrl) {
      writeFileSync(join(directory, "test.db"), "");
      execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "push", "--schema", "prisma/schema.prisma", "--skip-generate"], { env: { ...process.env, DATABASE_URL: `file:${join(directory, "test.db")}` }, stdio: "pipe" });
    }
    for (const user of [owner, outsider, staff]) {
      const scope = await provisionHousehold(client, user.id);
      if (user.id === owner.id) household = scope.householdId;
    }
    org = (await createOrganization(client, owner, "Recall test stores")).id;
    otherOrg = (await createOrganization(client, outsider, "Unrelated stores")).id;
    main = (await saveLocation(client, owner.id, org, { code: "MAIN", name: "Main store" })).id;
    second = (await saveLocation(client, owner.id, org, { code: "SECOND", name: "Second store" })).id;
    otherLocation = (await saveLocation(client, outsider.id, otherOrg, { code: "OTHER", name: "Private store" })).id;
    await acceptBusinessInvitation(client, staff, await inviteBusinessMember(client, owner.id, org, { email: staff.email, role: "STAFF" }));
    await client.purchase.create({ data: { householdId: household, productName: "Private household item", brand: "Private", category: "Food", retailer: "Private", purchaseDate: new Date() } });
    await upload(main, "MAIN", 7, "2026-10-19T10:00:00Z");
    await upload(second, "SECOND", 3, "2026-10-19T10:00:00Z");
    await client.recall.createMany({ data: [false, true].map(isFixture => ({ externalId: `business-inbox-${isFixture}`, sourceAuthority: "FDA", headline: "Peanut butter recall", description: "Check the affected lots", productName: "Organic peanut butter", brand: "Acme", category: "Food", upcs: '["00012345678905"]', lotNumbers: '["A1"]', recallDate: new Date("2020-01-01"), recommendedAction: "Contact supplier", sourceUrl: "https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts", isFixture })) });
  });
  after(async () => { await client.$disconnect(); rmSync(directory, { recursive: true, force: true }); });
  it("matches current stock across stores, excludes fixtures, and does not modify household matches/emails", async () => {
    const before = await client.purchase.findMany({ where: { householdId: household } });
    const matches = await client.recallMatch.count(); const emails = await client.emailNotification.count();
    const result = await inbox();
    assert.equal(result.total, 2); assert.equal(result.possibleUnits, 10); assert.equal(result.matchedLocations, 2);
    assert.equal(result.evaluatedRows, 2); assert.ok(result.candidates.every(c => c.evidence.kind === "IDENTIFIER" && !c.notice.externalId.endsWith("true")));
    assert.equal(result.coverage.healthy, false);
    assert.deepEqual(await client.purchase.findMany({ where: { householdId: household } }), before);
    assert.equal(await client.recallMatch.count(), matches); assert.equal(await client.emailNotification.count(), emails);
  });
  it("enforces membership and location boundaries, allows staff reads, revokes immediately", async () => {
    assert.equal((await inbox({}, staff.id)).total, 2);
    await assert.rejects(inbox({}, outsider.id));
    await assert.rejects(inbox({ locationId: otherLocation }));
    assert.equal((await getBusinessRecallInbox(client, outsider.id, otherOrg)).total, 0);
    const membership = await client.businessMembership.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: org, userId: staff.id } } });
    await changeBusinessMember(client, owner.id, org, membership.id, "REMOVE");
    await assert.rejects(inbox({}, staff.id));
  });
  it("uses latest snapshots, excludes zero stock and archived stores without deleting history", async () => {
    await upload(main, "MAIN", 0, "2026-10-20T10:00:00Z");
    assert.equal((await inbox()).possibleUnits, 3);
    assert.equal((await inbox({ locationId: main })).total, 0);
    await setLocationArchived(client, owner.id, org, second, true);
    assert.equal((await inbox()).total, 0);
    await assert.rejects(inbox({ locationId: second }));
    await setLocationArchived(client, owner.id, org, second, false);
    assert.equal((await inbox()).possibleUnits, 3);
    assert.equal(await client.inventorySnapshot.count({ where: { organizationId: org, locationId: main } }), 2);
  });
  it("reflects new and changed notices on refresh, deduplicates units, filters and paginates", async () => {
    const source = await client.recall.findUniqueOrThrow({ where: { sourceAuthority_externalId: { sourceAuthority: "FDA", externalId: "business-inbox-false" } } });
    const { id: _id, createdAt: _created, updatedAt: _updated, ...base } = source;
    void _id; void _created; void _updated;
    await client.recall.createMany({ data: Array.from({ length: 22 }, (_, i) => ({ ...base, externalId: `business-extra-${i}` })) });
    const result = await inbox({ page: Infinity });
    assert.equal(result.total, 23); assert.equal(result.candidates.length, 20); assert.equal(result.pages, 2); assert.equal(result.possibleUnits, 3); assert.equal(result.matchedRows, 1);
    assert.equal((await inbox({ page: 999 })).candidates.length, 3);
    assert.equal((await inbox({ query: "sku-0001" })).total, 23);
    assert.equal((await inbox({ kind: "TEXT" })).total, 0);
    await client.recall.updateMany({ where: { externalId: { startsWith: "business-extra-" } }, data: { upcs: "[]", productName: "Unrelated rocking chair", brand: "Other" } });
    assert.equal((await inbox()).total, 1);
    await client.recall.update({ where: { id: source.id }, data: { upcs: "invalid" } });
    await assert.rejects(inbox(), /invalid identifier data/);
    await client.recall.update({ where: { id: source.id }, data: { upcs: '["00012345678905"]' } });
  });
  it("rejects cross-tenant snapshot pointers instead of reading foreign stock", async () => {
    const current = await client.businessLocation.findUniqueOrThrow({ where: { id: main } });
    await client.businessLocation.update({ where: { id: main }, data: { currentSnapshotId: null } });
    await client.businessLocation.update({ where: { id: otherLocation }, data: { currentSnapshotId: current.currentSnapshotId } });
    await assert.rejects(getBusinessRecallInbox(client, outsider.id, otherOrg), /invalid current snapshot/);
    await client.businessLocation.update({ where: { id: otherLocation }, data: { currentSnapshotId: null } });
    await client.businessLocation.update({ where: { id: main }, data: { currentSnapshotId: current.currentSnapshotId } });
  });
  it("fails visibly rather than silently truncating stock or the notice catalog", async () => {
    const row = await client.inventoryStockRow.findFirstOrThrow({ where: { organizationId: org, locationId: second } });
    const { id: _id, ...base } = row; void _id;
    for (let offset = 0; offset < 20_000; offset += 500) await client.inventoryStockRow.createMany({ data: Array.from({ length: 500 }, (_, i) => ({ ...base, stockKey: `limit-${offset + i}`, sku: `limit-${offset + i}` })) });
    await assert.rejects(inbox(), /exceeds 20,000/);
    await client.inventoryStockRow.deleteMany({ where: { organizationId: org, stockKey: { startsWith: "limit-" } } });
    const source = await client.recall.findUniqueOrThrow({ where: { sourceAuthority_externalId: { sourceAuthority: "FDA", externalId: "business-inbox-false" } } });
    const { id: _noticeId, createdAt: _created, updatedAt: _updated, ...notice } = source; void _noticeId; void _created; void _updated;
    for (let offset = 0; offset < 10_000; offset += 500) await client.recall.createMany({ data: Array.from({ length: 500 }, (_, i) => ({ ...notice, externalId: `limit-notice-${offset + i}` })) });
    await assert.rejects(inbox(), /catalog exceeds/);
    await client.recall.deleteMany({ where: { externalId: { startsWith: "limit-notice-" } } });
  });
});
