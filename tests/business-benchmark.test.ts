import { it } from "node:test";
import assert from "node:assert/strict";
import { evaluateBusinessBenchmark } from "../src/domain/matching/benchmark";
import { businessBenchmark } from "./fixtures/business-benchmark";

it("runs a labeled synthetic retrieval benchmark and keeps known misses/false positives visible", () => {
  const report = evaluateBusinessBenchmark(businessBenchmark);
  assert.equal(new Set(businessBenchmark.map(item => item.id)).size, businessBenchmark.length);
  for (const [index, result] of report.results.entries()) {
    const fixture = businessBenchmark[index];
    assert.equal(result.kind, fixture.baseline, fixture.id);
    assert.equal(result.indexed, result.detected, `Index must preserve full matcher results: ${fixture.id}`);
    if (fixture.conflict) assert.ok(result.conflicts.some(text => text.includes(fixture.conflict!)), fixture.id);
  }
  assert.equal(report.falseNegatives, 2); assert.equal(report.falsePositives, 1);
  assert.ok(report.uncertain > 0); assert.ok(report.precision! < 1 && report.recall! < 1);
});
