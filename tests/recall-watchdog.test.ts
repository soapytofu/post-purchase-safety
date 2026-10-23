import { before, beforeEach, after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { requiredSources } from "../src/lib/source-health";

// Real Postgres semantics; only the Supabase HTTP transport/Vault/clock are mocked.
// Never load .env.staging. Create a dedicated disposable database on loopback.
describe("private recall watchdog SQL", { skip: !process.env.TEST_DATABASE_URL, concurrency: false }, () => {
  let admin: PrismaClient;
  let db: PrismaClient;
  let database: string;
  const exec = (sql: string) => db.$executeRawUnsafe(sql);
  const check = async () => (await db.$queryRawUnsafe<Array<{ result: string }>>("select recall_ops.check_feeds() as result"))[0].result;
  const state = async () => (await db.$queryRawUnsafe<Array<{ dispatch_status: string; http_status: number; run_id: string }>>("select dispatch_status, http_status, run_id from recall_ops.watchdog"))[0];
  before(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL!);
    assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname === "/safekeep_test", "Only the disposable local test server is allowed");
    database = `safekeep_watchdog_test_${process.pid}`;
    url.pathname = "/postgres";
    admin = new PrismaClient({ datasourceUrl: url.toString() });
    await admin.$executeRawUnsafe("do $$ begin if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin; end if; end $$");
    await admin.$executeRawUnsafe(`CREATE DATABASE "${database}"`);
    url.pathname = `/${database}`;
    db = new PrismaClient({ datasourceUrl: url.toString() });
    for (const sql of [
      'create table public."SyncState" (id text primary key, provider text, status text, "recordCount" int, "lastSuccessAt" timestamp, "lastAttemptAt" timestamp)',
      "create schema net", "create schema vault", "create schema cron",
      "create table net.requests (id bigserial primary key, url text, body jsonb)",
      "create table net._http_response (id bigint primary key, status_code integer, timed_out boolean, error_msg text, content text)",
      "create table vault.decrypted_secrets (name text primary key, decrypted_secret text)",
      `create function net.http_post(url text, body jsonb, headers jsonb, timeout_milliseconds integer) returns bigint language plpgsql as $$ declare request_id bigint; begin insert into net.requests (url, body) values (url, body) returning id into request_id; return request_id; end; $$`,
      "create function cron.schedule(text, text, text) returns bigint language sql as $$ select 1::bigint $$",
    ]) await exec(sql);
    const migration = readFileSync("ops/recall-watchdog/supabase/migrations/20261023051209_recall_refresh_watchdog.sql", "utf8");
    for (const statement of migration.split("-- statement-breakpoint")) {
      if (!statement.includes("create extension")) await exec(statement);
    }
    assert.equal(await check(), "disabled");
  });
  beforeEach(async () => {
    await exec("delete from public.\"SyncState\"");
    await exec("delete from net.requests");
    await exec("delete from net._http_response");
    await exec("delete from vault.decrypted_secrets");
    await exec("update recall_ops.watchdog set enabled = true, last_dispatch_at = null, request_id = null, dispatch_status = null, http_status = null, run_id = null");
    await exec("insert into vault.decrypted_secrets values ('recall_watchdog_github_token', 'fake-test-token-not-a-real-secret')");
    for (const provider of requiredSources) await db.$executeRaw`insert into public."SyncState" values (${provider}, ${provider}, 'SUCCEEDED', 5, (now() at time zone 'UTC') - interval '1 minute', (now() at time zone 'UTC') - interval '1 minute')`;
  });
  after(async () => {
    await db?.$disconnect();
    if (admin && database) await admin.$executeRawUnsafe(`DROP DATABASE "${database}"`);
    await admin?.$disconnect();
  });
  const overdue = () => exec(`update public."SyncState" set "lastSuccessAt" = (now() at time zone 'UTC') - interval '90 minutes', "lastAttemptAt" = (now() at time zone 'UTC') - interval '90 minutes'`);
  it("does not dispatch for fresh feeds or when disabled; denies public access", async () => {
    assert.equal(await check(), "fresh");
    await overdue();
    await exec("update recall_ops.watchdog set enabled = false");
    assert.equal(await check(), "disabled");
    for (const role of ["anon", "authenticated", "service_role"]) {
      const [rights] = await db.$queryRawUnsafe<Array<{ schema: boolean; fn: boolean; table: boolean }>>(`select has_schema_privilege('${role}', 'recall_ops', 'USAGE') as schema, has_function_privilege('${role}', 'recall_ops.check_feeds()', 'EXECUTE') as fn, has_table_privilege('${role}', 'recall_ops.watchdog', 'SELECT') as table`);
      assert.deepEqual(rights, { schema: false, fn: false, table: false });
    }
  });
  it("dispatches once under concurrent checks, fixes destination/ref, and preserves source state", async () => {
    await overdue();
    const before = await db.$queryRaw`select * from public."SyncState" order by id`;
    assert.deepEqual((await Promise.all([check(), check(), check()])).sort(), ["cooldown", "cooldown", "dispatch_queued"]);
    const requests = await db.$queryRawUnsafe<Array<{ url: string; body: unknown }>>("select url, body from net.requests");
    assert.deepEqual(requests, [{ url: "https://api.github.com/repos/soapytofu/post-purchase-safety/actions/workflows/refresh-feeds.yml/dispatches", body: { ref: "main", inputs: { trigger: "supabase-watchdog" } } }]);
    assert.deepEqual(await db.$queryRaw`select * from public."SyncState" order by id`, before);
    assert.equal((await state()).dispatch_status, "pending");
  });
  it("covers missing, partial, failed, empty, null and future-dated feeds", async () => {
    await exec(`update public."SyncState" set "lastAttemptAt" = (now() at time zone 'UTC') - interval '30 minutes'`);
    for (const patch of ["status = 'PARTIAL'", "status = 'FAILED'", '"recordCount" = 0', '"lastSuccessAt" = null', `"lastSuccessAt" = (now() at time zone 'UTC') + interval '1 hour'`]) {
      await exec(`update public."SyncState" set ${patch} where id = 'cpsc-recalls'`);
      assert.equal(await check(), "dispatch_queued");
      await exec("update recall_ops.watchdog set last_dispatch_at = null, dispatch_status = null");
      await exec(`update public."SyncState" set status = 'SUCCEEDED', "recordCount" = 5, "lastSuccessAt" = (now() at time zone 'UTC') where id = 'cpsc-recalls'`);
    }
    await exec("delete from public.\"SyncState\" where id = 'cpsc-recalls'");
    assert.equal(await check(), "dispatch_queued");
  });
  it("allows a recent attempt time to finish and fails closed without a token", async () => {
    await overdue();
    await exec(`update public."SyncState" set "lastAttemptAt" = now() at time zone 'UTC' where id = 'cpsc-recalls'`);
    assert.equal(await check(), "recent_attempt");
    await overdue();
    await exec("delete from vault.decrypted_secrets");
    assert.equal(await check(), "missing_token");
  });
  it("records accepted dispatch separately from feed success, then retries after cooldown", async () => {
    await overdue(); await check();
    await exec(`insert into net._http_response select request_id, 200, false, null, '{"workflow_run_id":12345}' from recall_ops.watchdog`);
    assert.equal(await check(), "cooldown");
    assert.deepEqual(await state(), { dispatch_status: "accepted", http_status: 200, run_id: "12345" });
    await exec("update recall_ops.watchdog set last_dispatch_at = now() - interval '61 minutes'");
    assert.equal(await check(), "dispatch_queued");
  });
  it("records HTTP rejection/timeout without retry storms or storing sensitive errors", async () => {
    await overdue(); await check();
    await exec("insert into net._http_response select request_id, 401, false, null, 'do-not-store-response-body' from recall_ops.watchdog");
    assert.equal(await check(), "cooldown");
    assert.equal((await state()).dispatch_status, "http_error");
    await exec("update recall_ops.watchdog set dispatch_status = 'pending'");
    await exec("update net._http_response set timed_out = true, error_msg = 'do-not-store-error'");
    assert.equal(await check(), "cooldown");
    assert.equal((await state()).dispatch_status, "transport_error");
    assert.doesNotMatch(JSON.stringify(await db.$queryRaw`select * from recall_ops.watchdog`, (_, value) => typeof value === "bigint" ? String(value) : value), /do-not-store/);
  });
  it("detects lost responses and uses UTC even on a non-UTC connection", async () => {
    await overdue(); await check();
    await exec("update recall_ops.watchdog set last_dispatch_at = now() - interval '6 minutes'");
    assert.equal(await check(), "cooldown");
    assert.equal((await state()).dispatch_status, "response_missing");
    await exec(`update public."SyncState" set "lastSuccessAt" = now() at time zone 'UTC'`);
    await db.$transaction(async tx => {
      await tx.$executeRawUnsafe("set local timezone = 'Pacific/Honolulu'");
      assert.deepEqual(await tx.$queryRaw`select recall_ops.check_feeds() as result`, [{ result: "fresh" }]);
    });
  });
});
