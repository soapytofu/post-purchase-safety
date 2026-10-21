import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { provisionHousehold, purchaseScope } from "@/lib/household-data";
import { acceptBusinessInvitation, changeBusinessMember, createOrganization, exportBusinessLocations, getBusinessWorkspace, inviteBusinessMember, listOrganizations, membershipFor, revokeBusinessInvitation, saveLocation, setLocationArchived } from "@/lib/business-data";

describe("business accounts, locations and real-database isolation", () => {
  const directory = mkdtempSync(join(tmpdir(), "safekeep-business-"));
  const hostedUrl = process.env.TEST_DATABASE_URL;
  if (hostedUrl) {
    const target = new URL(hostedUrl);
    assert.ok(["localhost", "127.0.0.1"].includes(target.hostname) && target.pathname === "/safekeep_test", "Business tests require a dedicated local safekeep_test database.");
  }
  const url = hostedUrl ?? `file:${join(directory, "test.db")}`;
  const client = new PrismaClient({ datasourceUrl: url });
  const alice = { id: "business-alice", email: "alice@example.test" };
  const bob = { id: "business-bob", email: "bob@example.test" };
  const manager = { id: "business-manager", email: "manager@example.test" };
  const staff = { id: "business-staff", email: "staff@example.test" };
  let a: string, b: string, aliceLocation: string, bobLocation: string, aliceHousehold: string;

  before(async () => {
    if (!hostedUrl) {
      writeFileSync(join(directory, "test.db"), "");
      execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "push", "--schema", "prisma/schema.prisma", "--skip-generate"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
    }
    for (const identity of [alice, bob, manager, staff]) {
      const scope = await provisionHousehold(client, identity.id);
      if (identity.id === alice.id) aliceHousehold = scope.householdId;
    }
    a = (await createOrganization(client, alice, "Alice Kids")).id;
    b = (await createOrganization(client, bob, "Bob Toys")).id;
    aliceLocation = (await saveLocation(client, alice.id, a, { code: "MAIN", name: "Alice Main" })).id;
    bobLocation = (await saveLocation(client, bob.id, b, { code: "MAIN", name: "Bob Main" })).id;
    await acceptBusinessInvitation(client, manager, await inviteBusinessMember(client, alice.id, a, { email: manager.email, role: "MANAGER" }));
    await acceptBusinessInvitation(client, staff, await inviteBusinessMember(client, alice.id, a, { email: staff.email, role: "STAFF" }));
    await client.purchase.create({ data: { id: "business-private-purchase", householdId: aliceHousehold, productName: "Private household product", brand: "Private", category: "Household", retailer: "Private store", purchaseDate: new Date() } });
  });
  after(async () => { await client.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

  it("requires explicit business membership; household owners gain no cross-business access", async () => {
    assert.equal((await getBusinessWorkspace(client, alice.id, a)).organization.name, "Alice Kids");
    for (const id of [bob.id, "forged-user", ""]) {
      await assert.rejects(getBusinessWorkspace(client, id, a), /unavailable/);
      await assert.rejects(exportBusinessLocations(client, id, a), /unavailable/);
    }
    assert.deepEqual((await listOrganizations(client, bob.id)).map(item => item.organizationId), [b]);
    await assert.rejects(getBusinessWorkspace(client, alice.id, "guessed-org"), /unavailable/);
  });

  it("returns only organization locations and does not export households, members or invite secrets", async () => {
    const data = await exportBusinessLocations(client, manager.id, a);
    assert.deepEqual(data.locations.map(item => item.name), ["Alice Main"]);
    assert.equal(JSON.stringify(data).includes("Private household"), false);
    assert.equal(JSON.stringify(data).includes("example.test"), false);
    assert.equal((await getBusinessWorkspace(client, staff.id, a)).members.length, 0);
    assert.equal((await getBusinessWorkspace(client, manager.id, a)).invitations.length, 0);
    assert.equal((await client.purchase.findMany({ where: purchaseScope({ householdId: aliceHousehold }) })).length, 1);
  });

  it("enforces the owner/manager/staff location and export matrix on the server", async () => {
    for (const identity of [manager, staff, bob]) {
      await assert.rejects(saveLocation(client, identity.id, a, { code: "DENIED", name: "Denied" }), /unavailable/);
      await assert.rejects(setLocationArchived(client, identity.id, a, aliceLocation, true), /unavailable/);
      await assert.rejects(inviteBusinessMember(client, identity.id, a, { email: "other@example.test", role: "STAFF" }), /unavailable/);
    }
    await assert.rejects(exportBusinessLocations(client, staff.id, a), /unavailable/);
    await assert.rejects(saveLocation(client, alice.id, a, { code: "MAIN", name: "Attempted cross-org edit" }, bobLocation), /unavailable/);
    await assert.rejects(setLocationArchived(client, alice.id, a, bobLocation, true), /unavailable/);
    assert.equal((await client.businessLocation.findUniqueOrThrow({ where: { id: bobLocation } })).name, "Bob Main");
  });

  it("normalizes codes per business, preserves stable codes, and archives instead of deleting", async () => {
    await saveLocation(client, alice.id, a, { code: " main ", name: "Renamed store", address: "123 Test Street" }, aliceLocation);
    await assert.rejects(saveLocation(client, alice.id, a, { code: "MAIN", name: "Duplicate" }));
    await assert.rejects(saveLocation(client, alice.id, a, { code: "CHANGED", name: "New code" }, aliceLocation), /unavailable/);
    await setLocationArchived(client, alice.id, a, aliceLocation, true);
    assert.ok((await client.businessLocation.findUniqueOrThrow({ where: { id: aliceLocation } })).archivedAt);
    await assert.rejects(saveLocation(client, alice.id, a, { code: "MAIN", name: "Reused code" }));
    await setLocationArchived(client, alice.id, a, aliceLocation, false);
    assert.equal((await client.businessLocation.findUniqueOrThrow({ where: { id: aliceLocation } })).archivedAt, null);
  });

  it("does not allow invitation-based owner escalation, cross-organization revocation or owner removal", async () => {
    await assert.rejects(inviteBusinessMember(client, alice.id, a, { email: "new@example.test", role: "OWNER" }));
    const owner = await membershipFor(client, alice.id, a);
    await assert.rejects(changeBusinessMember(client, alice.id, a, owner.id, "REMOVE"), /unavailable/);
    const otherOwner = await membershipFor(client, bob.id, b);
    await assert.rejects(changeBusinessMember(client, alice.id, a, otherOwner.id, "STAFF"), /unavailable/);
    const token = await inviteBusinessMember(client, bob.id, b, { email: "pending@example.test", role: "STAFF" });
    const invitation = await client.businessInvitation.findFirstOrThrow({ where: { organizationId: b, email: "pending@example.test" } });
    await assert.rejects(revokeBusinessInvitation(client, alice.id, a, invitation.id), /unavailable/);
    assert.equal(invitation.revokedAt, null);
    assert.notEqual(invitation.tokenHash, token);
    assert.equal(invitation.tokenHash.length, 64);
    assert.equal(JSON.stringify(await getBusinessWorkspace(client, bob.id, b)).includes(token), false);
  });

  it("requires exact verified email, explicit acceptance, unexpired and single-use invitation", async () => {
    const token = await inviteBusinessMember(client, bob.id, b, { email: " ALICE@example.test ", role: "STAFF" });
    await assert.rejects(acceptBusinessInvitation(client, manager, token), /unavailable/);
    assert.equal((await listOrganizations(client, alice.id)).some(item => item.organizationId === b), false);
    assert.equal(await acceptBusinessInvitation(client, alice, token), b);
    await assert.rejects(acceptBusinessInvitation(client, alice, token), /unavailable/);
    assert.equal((await membershipFor(client, alice.id, b)).role, "STAFF");
    await assert.rejects(acceptBusinessInvitation(client, alice, "invalid"), /unavailable/);
    const expired = await inviteBusinessMember(client, bob.id, b, { email: manager.email, role: "MANAGER" });
    await client.businessInvitation.updateMany({ where: { organizationId: b, email: manager.email }, data: { expiresAt: new Date(0) } });
    await assert.rejects(acceptBusinessInvitation(client, manager, expired), /unavailable/);
    const revoked = await inviteBusinessMember(client, bob.id, b, { email: manager.email, role: "MANAGER" });
    const invite = await client.businessInvitation.findFirstOrThrow({ where: { organizationId: b, email: manager.email, revokedAt: null, usedAt: null } });
    await revokeBusinessInvitation(client, bob.id, b, invite.id);
    await assert.rejects(acceptBusinessInvitation(client, manager, revoked), /unavailable/);
  });

  it("applies role changes/removal immediately without changing household access", async () => {
    const membership = await membershipFor(client, manager.id, a);
    await assert.rejects(changeBusinessMember(client, staff.id, a, membership.id, "MANAGER"), /unavailable/);
    await changeBusinessMember(client, alice.id, a, membership.id, "STAFF");
    await assert.rejects(exportBusinessLocations(client, manager.id, a), /unavailable/);
    await changeBusinessMember(client, alice.id, a, membership.id, "REMOVE");
    await assert.rejects(getBusinessWorkspace(client, manager.id, a), /unavailable/);
    assert.equal((await provisionHousehold(client, alice.id)).householdId, aliceHousehold);
    assert.equal(await client.purchase.count({ where: { householdId: aliceHousehold } }), 1);
  });

  it("keeps PostgreSQL business tables inaccessible to browser-facing roles", { skip: !hostedUrl }, async () => {
    for (const role of ["anon", "authenticated"]) {
      for (const table of ["Organization", "BusinessMembership", "BusinessLocation", "BusinessInvitation"]) {
        await assert.rejects(client.$transaction(async tx => {
          await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
          return tx.$queryRawUnsafe(`SELECT * FROM "${table}"`);
        }), /permission denied|row-level security/i);
      }
    }
  });
});
