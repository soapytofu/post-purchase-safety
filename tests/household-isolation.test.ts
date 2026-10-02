import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { provisionHousehold, purchaseScope, matchScope, deleteHouseholdPurchases, setHouseholdMatchStatus } from "@/lib/household-data";

describe("real database household isolation", () => {
  const directory = mkdtempSync(join(tmpdir(), "safekeep-tenancy-"));
  const hostedUrl = process.env.TEST_DATABASE_URL;
  if (hostedUrl) {
    const target = new URL(hostedUrl);
    assert.ok(["localhost", "127.0.0.1"].includes(target.hostname) && target.pathname === "/safekeep_test", "PostgreSQL tests must target a dedicated local safekeep_test database.");
  }
  const url = hostedUrl ?? `file:${join(directory, "test.db")}`;
  const client = new PrismaClient({ datasourceUrl: url });
  let alice: { householdId: string }, bob: { householdId: string };
  let aliceMatch: string, bobMatch: string;

  before(async () => {
    if (!hostedUrl) {
      writeFileSync(join(directory, "test.db"), "");
      execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "push", "--schema", "prisma/schema.prisma", "--skip-generate"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
    }
    alice = await provisionHousehold(client, "verified-alice");
    bob = await provisionHousehold(client, "verified-bob");
    const recall = await client.recall.create({ data: { externalId: "test", sourceAuthority: "CPSC", headline: "Test recall", description: "Test", brand: "Brand", productName: "Product", category: "Household", recallDate: new Date(), recommendedAction: "Verify", sourceUrl: "https://www.cpsc.gov/Recalls" } });
    for (const [id, scope] of [["alice-purchase", alice], ["bob-purchase", bob], ["legacy-purchase", { householdId: null }]] as const) {
      const purchase = await client.purchase.create({ data: { id, householdId: scope.householdId, productName: id, brand: "Brand", category: "Household", retailer: "Store", purchaseDate: new Date() } });
      const match = await client.recallMatch.create({ data: { purchaseId: purchase.id, recallId: recall.id, confidence: "HIGH", score: 1 } });
      if (id === "alice-purchase") aliceMatch = match.id;
      if (id === "bob-purchase") bobMatch = match.id;
    }
  });

  after(async () => { await client.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

  it("provisions separate households and remains idempotent", async () => {
    assert.notEqual(alice.householdId, bob.householdId);
    assert.equal((await provisionHousehold(client, "verified-alice")).householdId, alice.householdId);
  });

  it("handles simultaneous first requests without making extra households", async () => {
    const results = await Promise.all(Array.from({ length: 3 }, () => provisionHousehold(client, "verified-concurrent")));
    assert.equal(new Set(results.map(result => result.householdId)).size, 1);
  });

  it("blocks direct PostgreSQL API roles", { skip: !hostedUrl }, async () => {
    for (const role of ["anon", "authenticated"]) {
      await assert.rejects(client.$transaction(async tx => {
        await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
        return tx.purchase.findMany();
      }), /permission denied|row-level security/i);
    }
  });

  it("scopes ledger/export and match queries, excluding legacy purchases", async () => {
    assert.deepEqual((await client.purchase.findMany({ where: purchaseScope(alice) })).map(p => p.id), ["alice-purchase"]);
    assert.deepEqual((await client.recallMatch.findMany({ where: matchScope(alice) })).map(m => m.id), [aliceMatch]);
    assert.deepEqual((await client.purchase.findMany({ where: purchaseScope({ householdId: null }) })).map(p => p.id), ["legacy-purchase"]);
  });

  it("rejects an alert ID from another household", async () => {
    await assert.rejects(setHouseholdMatchStatus(client, alice, bobMatch, "DISMISSED"), /not found/);
    assert.equal((await client.recallMatch.findUniqueOrThrow({ where: { id: bobMatch } })).status, "UNREVIEWED");
    await setHouseholdMatchStatus(client, alice, aliceMatch, "REVIEWED");
    assert.equal((await client.recallMatch.findUniqueOrThrow({ where: { id: aliceMatch } })).status, "REVIEWED");
  });

  it("deletes only the caller's purchases and cascades only their matches", async () => {
    assert.equal((await deleteHouseholdPurchases(client, alice)).count, 1);
    assert.equal(await client.purchase.count({ where: purchaseScope(bob) }), 1);
    assert.equal(await client.purchase.count({ where: { householdId: null } }), 1);
    assert.equal(await client.recallMatch.count({ where: { id: aliceMatch } }), 0);
    assert.equal(await client.recallMatch.count({ where: { id: bobMatch } }), 1);
    assert.equal(await client.recall.count(), 1);
  });
});

it("keeps the PostgreSQL and SQLite data models synchronized", () => {
  const canonical = readFileSync("prisma/schema.prisma", "utf8");
  const hosted = readFileSync("prisma/hosted/schema.prisma", "utf8");
  assert.equal(hosted, canonical.replace('provider = "sqlite"', 'provider = "postgresql"'));
});
