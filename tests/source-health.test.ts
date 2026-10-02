import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sourceHealth, requiredSources } from "@/lib/source-health";

describe("startup source coverage health", () => {
  const now = Date.parse("2026-10-02T20:00:00Z");
  const complete = requiredSources.map(provider => ({ provider, status: "SUCCEEDED", recordCount: 10, lastAttemptAt: new Date(now), lastSuccessAt: new Date(now) }));

  it("requires fresh complete data from every expected authority", () => {
    assert.equal(sourceHealth(complete, now).healthy, true);
    assert.equal(sourceHealth(complete.slice(0, 2), now).healthy, false);
    assert.equal(sourceHealth([...complete.slice(0, 2), { ...complete[2], provider: "unknown" }], now).healthy, false);
  });

  it("does not treat partial, failed, stale or empty coverage as healthy", () => {
    for (const status of ["PARTIAL", "FAILED", "UNKNOWN"]) assert.equal(sourceHealth([{ ...complete[0], status }, ...complete.slice(1)], now).healthy, false);
    assert.equal(sourceHealth([{ ...complete[0], recordCount: 0 }, ...complete.slice(1)], now).healthy, false);
    assert.equal(sourceHealth([{ ...complete[0], lastSuccessAt: new Date(now - 49 * 60 * 60 * 1000) }, ...complete.slice(1)], now).healthy, false);
  });
});
