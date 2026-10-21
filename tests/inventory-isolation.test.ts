import { before, after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { provisionHousehold } from "@/lib/household-data";
import { acceptBusinessInvitation, changeBusinessMember, createOrganization, inviteBusinessMember, membershipFor, saveLocation, setLocationArchived } from "@/lib/business-data";
import { commitInventoryImport, getBusinessInventory, inventoryPreviewPage, previewInventoryCsv } from "@/lib/business-inventory";

describe("inventory snapshots and isolation", () => {
  const directory = mkdtempSync(join(tmpdir(), "safekeep-inventory-"));
  const hostedUrl = process.env.TEST_DATABASE_URL;
  if (hostedUrl) { const url = new URL(hostedUrl); assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname === "/safekeep_test"); }
  const url = hostedUrl ?? `file:${join(directory, "test.db")}`;
  const client = new PrismaClient({ datasourceUrl: url });
  const owner = { id: "inventory-owner", email: "inventory-owner@example.test" };
  const other = { id: "inventory-other", email: "inventory-other@example.test" };
  const manager = { id: "inventory-manager", email: "inventory-manager@example.test" };
  const staff = { id: "inventory-staff", email: "inventory-staff@example.test" };
  let org: string, otherOrg: string, main: string, second: string, foreign: string, household: string;
  const header = "location_code,sku,product_name,quantity_on_hand,inventory_as_of";
  const csv = (time: string, quantities = [4, 7]) => `${header}\nMAIN,0001,Toy,${quantities[0]},${time}\nSECOND,0002,Chair,${quantities[1]},${time}`;
  const preview = (content: string, ids?: string[], userId = owner.id) => previewInventoryCsv(client, userId, org, "stock.csv", content, ids ?? [main, second]);
  const apply = (id: string, userId = owner.id) => commitInventoryImport(client, userId, org, id);

  before(async () => {
    if (!hostedUrl) { writeFileSync(join(directory, "test.db"), ""); execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "push", "--schema", "prisma/schema.prisma", "--skip-generate"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" }); }
    for (const user of [owner, other, manager, staff]) { const scope = await provisionHousehold(client, user.id); if (user.id === owner.id) household = scope.householdId; }
    org = (await createOrganization(client, owner, "Inventory Shop")).id;
    otherOrg = (await createOrganization(client, other, "Other Shop")).id;
    main = (await saveLocation(client, owner.id, org, { code: "MAIN", name: "Main Store" })).id;
    second = (await saveLocation(client, owner.id, org, { code: "SECOND", name: "Second Store" })).id;
    foreign = (await saveLocation(client, other.id, otherOrg, { code: "MAIN", name: "Other Main" })).id;
    for (const [user, role] of [[manager, "MANAGER"], [staff, "STAFF"]] as const) await acceptBusinessInvitation(client, user, await inviteBusinessMember(client, owner.id, org, { email: user.email, role }));
    await client.purchase.create({ data: { householdId: household, productName: "Unchanged household item", brand: "Private", category: "Household", retailer: "Private", purchaseDate: new Date() } });
  });
  after(async () => { await client.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

  it("previews complete store snapshots without changing stock; rejects invalid files as a whole", async () => {
    const bad = await preview(csv("2026-10-20T10:00:00Z", [-1, 7]));
    assert.ok(bad.issueCount); assert.equal(bad.preview, undefined);
    assert.equal(await client.inventoryImport.count({ where: { organizationId: org } }), 0);
    const result = await preview(csv("2026-10-20T10:00:00Z"));
    assert.equal(result.preview!.rowCount, 2);
    assert.deepEqual(result.preview!.stores.map(store => store.units), [4, 7]);
    assert.equal((await getBusinessInventory(client, owner.id, org)).total, 0);
    assert.equal(await client.inventorySnapshot.count({ where: { organizationId: org } }), 0);
    await apply(result.preview!.id);
    const inventory = await getBusinessInventory(client, staff.id, org);
    assert.equal(inventory.total, 2);
    assert.deepEqual(inventory.totals.map(item => item._sum.quantityOnHand).sort(), [4, 7]);
    assert.equal(inventory.history.length, 0);
  });
  it("replaces only explicitly selected stores, retaining old snapshots and detecting removed rows", async () => {
    const oldMain = (await client.businessLocation.findUniqueOrThrow({ where: { id: main } })).currentSnapshotId;
    const result = await preview(`${header}\nMAIN,NEW,New toy,3,2026-10-20T11:00:00Z`, [main], manager.id);
    assert.equal(result.preview!.stores[0].removedRows, 1);
    await apply(result.preview!.id, manager.id);
    const stock = await getBusinessInventory(client, owner.id, org);
    assert.equal(stock.rows.find(row => row.locationId === main)!.sku, "NEW");
    assert.equal(stock.rows.find(row => row.locationId === second)!.quantityOnHand, 7);
    assert.equal(await client.inventoryStockRow.count({ where: { snapshotId: oldMain! } }), 1);
    assert.equal(await client.purchase.count({ where: { householdId: household } }), 1);
  });
  it("does not reactivate old/duplicate content or accept older timestamps", async () => {
    const before = (await client.businessLocation.findUniqueOrThrow({ where: { id: main } })).currentSnapshotId;
    const duplicate = await preview(csv("2026-10-20T10:00:00Z"));
    assert.equal(duplicate.preview!.status, "APPLIED");
    assert.equal((await apply(duplicate.preview!.id)).alreadyApplied, true);
    assert.equal((await client.businessLocation.findUniqueOrThrow({ where: { id: main } })).currentSnapshotId, before);
    await assert.rejects(preview(`${header}\nMAIN,OLD,Old,99,2026-10-19T10:00:00Z`, [main]), /later/);
  });
  it("rejects cross-business reads, drafts, confirmation, stores and filter IDs", async () => {
    const draft = (await preview(csv("2026-10-20T12:00:00Z"))).preview!;
    await assert.rejects(getBusinessInventory(client, other.id, org), /unavailable/);
    await assert.rejects(inventoryPreviewPage(client, other.id, otherOrg, draft.id), /unavailable/);
    await assert.rejects(commitInventoryImport(client, other.id, otherOrg, draft.id), /unavailable/);
    await assert.rejects(preview(csv("2026-10-20T12:00:00Z"), [foreign]), /unavailable/);
    await assert.rejects(getBusinessInventory(client, owner.id, org, { locationId: foreign }), /unavailable/);
    await assert.rejects(inventoryPreviewPage(client, manager.id, org, draft.id), /unavailable/);
    await assert.rejects(preview(csv("2026-10-20T12:00:00Z"), undefined, staff.id), /unavailable/);
    await assert.rejects(apply(draft.id, staff.id), /unavailable/);
    assert.equal((await getBusinessInventory(client, other.id, otherOrg)).total, 0);
  });
  it("rolls back every store if any baseline changes or location is archived after preview", async () => {
    const draft = (await preview(csv("2026-10-20T13:00:00Z"))).preview!;
    const before = (await getBusinessInventory(client, owner.id, org)).rows.map(row => row.id).sort();
    const snapshots = await client.inventorySnapshot.count({ where: { organizationId: org } });
    await setLocationArchived(client, owner.id, org, second, true);
    await assert.rejects(apply(draft.id), /archived|changed/);
    assert.equal(await client.inventorySnapshot.count({ where: { organizationId: org } }), snapshots);
    await setLocationArchived(client, owner.id, org, second, false);
    assert.deepEqual((await getBusinessInventory(client, owner.id, org)).rows.map(row => row.id).sort(), before);
    const later = (await preview(`${header}\nMAIN,NEXT,Next toy,1,2026-10-20T14:00:00Z`, [main])).preview!;
    await apply(later.id);
    await assert.rejects(apply(draft.id), /changed/);
  });
  it("makes previews immutable, expires them and rechecks revoked roles at confirmation", async () => {
    const first = (await preview(csv("2026-10-20T15:00:00Z"))).preview!;
    const secondDraft = (await preview(csv("2026-10-20T15:00:00Z"))).preview!;
    assert.notEqual(first.id, secondDraft.id);
    await client.inventoryImport.update({ where: { id: first.id }, data: { expiresAt: new Date(0) } });
    await assert.rejects(apply(first.id), /expired/);
    const draft = (await preview(csv("2026-10-20T15:00:00Z"), undefined, manager.id)).preview!;
    await changeBusinessMember(client, owner.id, org, (await membershipFor(client, manager.id, org)).id, "STAFF");
    await assert.rejects(apply(draft.id, manager.id), /unavailable/);
    await changeBusinessMember(client, owner.id, org, (await membershipFor(client, manager.id, org)).id, "MANAGER");
    await apply(secondDraft.id);
    assert.equal((await apply(secondDraft.id)).alreadyApplied, true);
  });
  it("paginates previews and current stock, keeps zero quantities and scopes searches", async () => {
    const rows = Array.from({ length: 61 }, (_, index) => `MAIN,SKU${String(index).padStart(3,"0")},Product ${index},${index},2026-10-20T16:00:00Z`).join("\n");
    const draft = (await preview(`${header}\n${rows}`, [main])).preview!;
    assert.equal(draft.rows.length, 20);
    assert.equal((await inventoryPreviewPage(client, owner.id, org, draft.id, 4)).rows.length, 1);
    await apply(draft.id);
    const page = await getBusinessInventory(client, staff.id, org, { locationId: main, page: 99 });
    assert.equal(page.page, 2); assert.equal(page.rows.length, 11);
    assert.equal((await getBusinessInventory(client, staff.id, org, { query: "SKU000" })).rows[0].quantityOnHand, 0);
    assert.equal((await getBusinessInventory(client, other.id, otherOrg, { query: "SKU000" })).total, 0);
  });
  it("blocks direct PostgreSQL API-role access to inventory data", { skip: !hostedUrl }, async () => {
    for (const role of ["anon", "authenticated"]) for (const table of ["InventoryImport", "InventorySnapshot", "InventoryStockRow"]) for (const sql of [`SELECT * FROM "${table}"`, `INSERT INTO "${table}" DEFAULT VALUES`, `UPDATE "${table}" SET "id"="id"`, `DELETE FROM "${table}"`]) await assert.rejects(client.$transaction(async tx => { await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`); return tx.$executeRawUnsafe(sql); }), /permission denied|row-level security/i);
  });
  it("imports the 10,000-row pilot limit in bounded batches", async () => {
    const content = `${header}\n` + Array.from({ length: 10_000 }, (_, index) => `MAIN,LIMIT${index},Stock ${index},1,2026-10-20T17:00:00Z`).join("\n");
    const draft = (await preview(content, [main])).preview!;
    assert.equal(draft.rowCount, 10_000);
    await apply(draft.id);
    const inventory = await getBusinessInventory(client, owner.id, org, { locationId: main });
    assert.equal(inventory.total, 10_000);
    assert.equal(inventory.totals[0]._sum.quantityOnHand, 10_000);
  });
});
