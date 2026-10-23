import { it } from "node:test";
import assert from "node:assert/strict";
import { assertStagingDatabase, watchdogCommand } from "../ops/recall-watchdog/config";

const staging = "postgresql://postgres.gyapgfgdynkpmrpaejmy:fake-password@aws-0-us-east-1.pooler.supabase.com:5432/postgres";
it("limits watchdog management to the exact staging database", () => {
  assert.doesNotThrow(() => assertStagingDatabase(staging));
  for (const url of [undefined, staging.replace("gyapgfgdynkpmrpaejmy", "different-project"), staging.replace(":5432", ":6543"), staging.replace("/postgres", "/production"), staging.replace("supabase.com", "example.com"), staging.replace(":fake-password", "")]) {
    assert.throws(() => assertStagingDatabase(url));
  }
});
it("defaults to read-only status and requires explicit activation/token-storage intent", () => {
  assert.deepEqual(watchdogCommand([]), { action: "--status", apply: false, storeToken: false });
  assert.deepEqual(watchdogCommand(["--enable", "--store-token", "--apply"]), { action: "--enable", apply: true, storeToken: true });
  assert.equal(watchdogCommand(["--enable"]).apply, false);
  for (const args of [["--store-token"], ["--enable", "--disable"], ["--status", "--apply"], ["--disable", "--store-token"], ["--enable", "--enable"], ["--unknown"]]) assert.throws(() => watchdogCommand(args));
});
