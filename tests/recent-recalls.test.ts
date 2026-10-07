import { it } from "node:test";
import assert from "node:assert/strict";
import { recallDateFilter } from "../src/lib/recent-recalls";

it("filters newest notices against an explicit date and defaults unknown periods to 30 days", () => {
  const now = new Date("2026-10-07T12:00:00Z");
  assert.equal(recallDateFilter("7", now).recallDate?.gte.toISOString(), "2026-09-30T12:00:00.000Z");
  assert.deepEqual(recallDateFilter("invalid", now), recallDateFilter("30", now));
  assert.deepEqual(recallDateFilter("all", now), {});
  assert.equal(recallDateFilter("90", now).recallDate?.gte.toISOString(), "2026-07-09T12:00:00.000Z");
});
