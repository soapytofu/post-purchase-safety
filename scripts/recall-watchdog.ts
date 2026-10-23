import { PrismaClient } from "@prisma/client";
import { assertStagingDatabase, watchdogCommand, WORKFLOW_API } from "../ops/recall-watchdog/config";
import { databaseConnectionUrl } from "../src/lib/database-config";
import { sourceHealth } from "../src/lib/source-health";

// Operator-only utility. No implicit credential-helper access or migration/seed.
// Run after the separate operational SQL migration is installed on staging.
let client: PrismaClient | undefined;
async function main() {
  const { action, apply, storeToken } = watchdogCommand(process.argv.slice(2));
  if (action !== "--status" && !apply) {
    console.log("Dry run: add --apply to enable/disable dispatch. --enable --store-token also stores RECALL_WATCHDOG_GITHUB_TOKEN in Supabase Vault. No changes made.");
    return;
  }
  assertStagingDatabase(process.env.DATABASE_URL);
  client = new PrismaClient({ datasourceUrl: databaseConnectionUrl(process.env.DATABASE_URL), log: [] });
  const [{ installed }] = await client.$queryRaw<Array<{ installed: boolean }>>`select to_regclass('recall_ops.watchdog') is not null as installed`;
  if (!installed) {
    console.log("Watchdog is not installed. Follow docs/RECALL_WATCHDOG.md; no changes made.");
    process.exitCode = 1;
    return;
  }
  if (action === "--enable") {
    const token = process.env.RECALL_WATCHDOG_GITHUB_TOKEN?.trim();
    if (storeToken) {
      if (!token || !/^github_pat_[A-Za-z0-9_]+$/.test(token)) throw new Error("Provide a fine-grained token privately");
      const response = await fetch(WORKFLOW_API, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10" },
        redirect: "error", signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error("Cannot read workflow with supplied token");
      const workflow = await response.json();
      if (workflow.state !== "active" || workflow.path !== ".github/workflows/refresh-feeds.yml") throw new Error("Refresh workflow unavailable");
    }
    await client.$transaction(async tx => {
      await tx.$queryRaw`select id from recall_ops.watchdog where id for update`;
      if (storeToken) {
        const secrets = await tx.$queryRaw<Array<{ id: string }>>`select id::text from vault.secrets where name = 'recall_watchdog_github_token'`;
        if (secrets.length) await tx.$executeRaw`select vault.update_secret(${secrets[0].id}::uuid, ${token!}::text)`;
        else await tx.$queryRaw`select vault.create_secret(${token!}::text, 'recall_watchdog_github_token', 'Staging recall workflow dispatch only')`;
      }
      const [{ present }] = await tx.$queryRaw<Array<{ present: boolean }>>`select exists(select 1 from vault.decrypted_secrets where name = 'recall_watchdog_github_token' and length(decrypted_secret) >= 20) as present`;
      if (!present) throw new Error("Watchdog token missing");
      await tx.$executeRaw`update recall_ops.watchdog set enabled = true where id`;
      // Repair only our timer if it was paused/deleted. Preserve retry cooldown.
      await tx.$queryRaw`select cron.schedule('safekeep-recall-watchdog', '*/10 * * * *', 'select recall_ops.check_feeds();')`;
    });
    console.log("Watchdog dispatch enabled. The next cron tick will check freshness; this does not prove a refresh succeeded.");
  } else if (action === "--disable") {
    await client.$executeRaw`update recall_ops.watchdog set enabled = false where id`;
    console.log("Watchdog dispatch disabled. Previously queued GitHub runs are not cancelled; the token stays in Vault for rotation/removal.");
  }
  const state = await client.$queryRaw`select enabled, last_checked_at, decision, last_dispatch_at, request_id::text, dispatch_status, http_status, run_id from recall_ops.watchdog`;
  const clock = await client.$queryRaw`select jobid::text, active, schedule from cron.job where jobname = 'safekeep-recall-watchdog'`;
  const runs = await client.$queryRaw`select status, start_time, end_time from cron.job_run_details where jobid in (select jobid from cron.job where jobname = 'safekeep-recall-watchdog') order by start_time desc limit 3`;
  const health = sourceHealth(await client.syncState.findMany());
  console.log(JSON.stringify({ watchdog: state, clock, recentClockRuns: runs, feedHealth: health }, null, 2));
}
main().catch(() => {
  console.error("Watchdog operation failed. Check staging connection, installed migration, and the restricted token's permissions/expiry. Credentials and database errors are intentionally not logged.");
  process.exitCode = 1;
}).finally(() => client?.$disconnect());
