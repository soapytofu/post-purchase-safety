import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { provisionHousehold } from "../src/lib/household-data";
import { dispatchRecallEmails, enqueueRecallEmails, notificationKey, saveEmailPreference, unsubscribeEmailAlerts } from "../src/lib/email-notifications";
import { buildRecallEmail, EmailSendError, sendRecallEmail } from "../src/lib/recall-email";
import { notificationDeliveryConfigured } from "../src/lib/email-config";

describe("opt-in household recall email queue", () => {
  const directory = mkdtempSync(join(tmpdir(), "safekeep-email-"));
  const url = `file:${join(directory, "test.db")}`;
  const client = new PrismaClient({ datasourceUrl: url });
  const previousUrl = process.env.APP_URL;
  let aliceHousehold: string, bobHousehold: string;
  before(async () => {
    process.env.APP_URL = "https://safekeep.example";
    writeFileSync(join(directory, "test.db"), "");
    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "push", "--schema", "prisma/schema.prisma", "--skip-generate"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
    aliceHousehold = (await provisionHousehold(client, "alice")).householdId;
    bobHousehold = (await provisionHousehold(client, "bob")).householdId;
    for (const [id, householdId] of [["alice-purchase", aliceHousehold], ["bob-purchase", bobHousehold], ["legacy-purchase", null]] as const) {
      await client.purchase.create({ data: { id, householdId, productName: "Test <Lamp>", brand: "Brand", category: "Household", retailer: "Test store", purchaseDate: new Date() } });
    }
    for (const [externalId, isFixture, confidence] of [["live", false, "HIGH"], ["demo", true, "HIGH"], ["low", false, "LOW"]] as const) {
      const recall = await client.recall.create({ data: { externalId, isFixture, sourceAuthority: "CPSC", headline: "Test recall <script>", description: "Test only", brand: "Brand", productName: "Test lamp", category: "Household", recallDate: new Date(), recommendedAction: "Compare model numbers", sourceUrl: "https://www.cpsc.gov/Recalls" } });
      for (const purchaseId of ["alice-purchase", "bob-purchase", "legacy-purchase"]) await client.recallMatch.create({ data: { purchaseId, recallId: recall.id, confidence, score: 1 } });
    }
  });
  beforeEach(async () => {
    await client.emailNotification.deleteMany();
    await client.appUser.updateMany({ data: { emailAlertsEnabled: false, notificationEmail: null, unsubscribeToken: null } });
    await client.recallMatch.updateMany({ data: { status: "UNREVIEWED" } });
    await saveEmailPreference(client, "alice", "alice@example.test", true);
  });
  after(async () => {
    await client.$disconnect();
    rmSync(directory, { recursive: true, force: true });
    if (previousUrl === undefined) delete process.env.APP_URL; else process.env.APP_URL = previousUrl;
  });

  it("queues only opted-in household live medium/high matches and suppresses duplicates", async () => {
    assert.equal(await enqueueRecallEmails(client), 1);
    assert.equal(await enqueueRecallEmails(client), 0);
    const job = await client.emailNotification.findFirstOrThrow({ include: { match: true } });
    assert.equal(job.userId, "alice"); assert.equal(job.match?.purchaseId, "alice-purchase");
    assert.equal(await enqueueRecallEmails(client, null), 0);
    await saveEmailPreference(client, "bob", "bob@example.test", true);
    assert.equal(await enqueueRecallEmails(client, bobHousehold), 1);
    assert.equal(await client.emailNotification.count(), 2);
  });

  it("canceling consent stops queued delivery and unsubscribe is idempotent", async () => {
    await enqueueRecallEmails(client);
    const user = await client.appUser.findUniqueOrThrow({ where: { id: "alice" } });
    await unsubscribeEmailAlerts(user.unsubscribeToken!, client);
    await unsubscribeEmailAlerts(user.unsubscribeToken!, client);
    assert.equal((await client.appUser.findUniqueOrThrow({ where: { id: "alice" } })).emailAlertsEnabled, false);
    assert.equal(await client.emailNotification.count({ where: { status: "CANCELED" } }), 1);
    let sends = 0;
    await dispatchRecallEmails(client, async () => { sends++; return "fake"; }, async () => true);
    assert.equal(sends, 0);
  });

  it("rechecks verified recipients and household ownership before sending", async () => {
    await enqueueRecallEmails(client);
    const result = await dispatchRecallEmails(client, async () => { throw new Error("Must not send"); }, async () => false);
    assert.equal(result.canceled, 1);
    assert.equal(await client.emailNotification.count({ where: { status: "SENT" } }), 0);
  });

  it("accepts one email once with a stable idempotency key and escaped product data", async () => {
    await enqueueRecallEmails(client);
    const result = await dispatchRecallEmails(client, async (recipient, content, key) => {
      assert.equal(recipient, "alice@example.test");
      assert.match(content.html, /&lt;script&gt;/); assert.doesNotMatch(content.html, /<script>/);
      assert.match(content.text, /inferred match/); assert.match(key, /^recall-[a-f0-9]{64}$/);
      return "fake-provider-id";
    }, async () => true);
    assert.equal(result.accepted, 1);
    assert.equal((await dispatchRecallEmails(client, async () => { throw new Error("Duplicate"); }, async () => true)).accepted, 0);
  });

  it("backs off transient failures but does not retry beyond the provider dedupe window", async () => {
    await enqueueRecallEmails(client);
    const now = new Date();
    await dispatchRecallEmails(client, async () => { throw new EmailSendError(true, "HTTP 429"); }, async () => true, now);
    const pending = await client.emailNotification.findFirstOrThrow();
    assert.equal(pending.status, "PENDING"); assert.ok(pending.nextAttemptAt > now);
    let sends = 0;
    await dispatchRecallEmails(client, async () => { sends++; return "fake"; }, async () => true, new Date(now.getTime() + 21 * 60 * 60_000));
    assert.equal(sends, 0);
    assert.equal((await client.emailNotification.findFirstOrThrow()).status, "FAILED");
  });

  it("cancels jobs whose match no longer belongs to the recipient household", async () => {
    await enqueueRecallEmails(client);
    const foreignMatch = await client.recallMatch.findFirstOrThrow({ where: { purchaseId: "bob-purchase", confidence: "HIGH", recall: { isFixture: false } } });
    await client.emailNotification.updateMany({ data: { matchId: foreignMatch.id } });
    const result = await dispatchRecallEmails(client, async () => { throw new Error("Cross-household email"); }, async () => true);
    assert.equal(result.canceled, 1);
  });

  it("renders human-readable notification details and verified-source links", async () => {
    const match = await client.recallMatch.findFirstOrThrow({ include: { purchase: true, recall: true } });
    const message = buildRecallEmail(match, "https://safekeep.example", "a".repeat(64));
    assert.match(message.text, /not hazard severity/);
    assert.equal(new URL(message.unsubscribeUrl).pathname, "/email-preferences");
    assert.notEqual(notificationKey("alice", "purchase", "CPSC", "notice"), notificationKey("bob", "purchase", "CPSC", "notice"));
  });
});

it("real delivery is disabled without explicit configuration", async () => {
  assert.equal(notificationDeliveryConfigured(), false);
  assert.deepEqual(await dispatchRecallEmails(), { configured: false, accepted: 0, failed: 0, canceled: 0 });
});

it("email sender uses a stable key and one-click unsubscribe headers", async () => {
  const previousFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "https://api.resend.com/emails");
      assert.equal((options?.headers as Record<string, string>)["Idempotency-Key"], "stable-key");
      const payload = JSON.parse(options!.body as string);
      assert.equal(payload.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
      assert.match(payload.headers["List-Unsubscribe"], /\/api\/notifications\/unsubscribe\?token=/);
      return Response.json({ id: "fake-provider-id" });
    };
    const result = await sendRecallEmail("alice@example.test", { subject: "Test", text: "Test", html: "<p>Test</p>", unsubscribeUrl: `https://safekeep.example/email-preferences?token=${"a".repeat(64)}` }, "stable-key");
    assert.equal(result, "fake-provider-id");
  } finally { globalThis.fetch = previousFetch; }
});
