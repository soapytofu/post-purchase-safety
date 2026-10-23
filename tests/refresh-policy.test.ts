import { it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { feedsNeedRefresh, REFRESH_OVERDUE_MINUTES } from "../src/lib/refresh-policy";
import { requiredSources } from "../src/lib/source-health";

const now = Date.parse("2026-10-23T06:00:00Z");
const fresh = () => requiredSources.map(provider => ({ provider, status: "SUCCEEDED", recordCount: 5, lastSuccessAt: new Date(now - 60_000) }));

it("skips only when all required feeds are fresh and complete", () => {
  assert.equal(feedsNeedRefresh(fresh(), now), false);
  assert.equal(feedsNeedRefresh([], now), true);
  assert.equal(feedsNeedRefresh(fresh().slice(1), now), true);
});
it("retries partial, failed and empty feeds even with recent timestamps", () => {
  for (const patch of [{ status: "PARTIAL" }, { status: "FAILED" }, { recordCount: 0 }]) {
    const states = fresh(); Object.assign(states[0], patch);
    assert.equal(feedsNeedRefresh(states, now), true);
  }
});
it("treats the exact deadline, missing, invalid and future timestamps as overdue", () => {
  for (const lastSuccessAt of [new Date(now - REFRESH_OVERDUE_MINUTES * 60_000), null, new Date(NaN), new Date(now + 1)]) {
    assert.equal(feedsNeedRefresh([{ ...fresh()[0], lastSuccessAt }, ...fresh().slice(1)], now), true);
  }
  assert.equal(feedsNeedRefresh(fresh().map(state => ({ ...state, lastSuccessAt: new Date(now - REFRESH_OVERDUE_MINUTES * 60_000 + 1) })), now), false);
});
it("uses the same non-cancelling concurrency group for both timers", () => {
  const workflow = readFileSync(".github/workflows/refresh-feeds.yml", "utf8");
  assert.match(workflow, /group: staging-recall-refresh\n\s+cancel-in-progress: false/);
  assert.match(workflow, /options: \[operator, supabase-watchdog\]/);
  assert.match(workflow, /--apply --if-needed/);
});
