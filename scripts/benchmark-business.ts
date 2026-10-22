import { BUSINESS_MATCH_VERSION } from "../src/domain/matching/business";
import { evaluateBusinessBenchmark } from "../src/domain/matching/benchmark";
import { businessBenchmark } from "../tests/fixtures/business-benchmark";

const report = evaluateBusinessBenchmark(businessBenchmark);
console.log(`Business candidate benchmark · ${BUSINESS_MATCH_VERSION}`);
console.log(`${businessBenchmark.length} authored synthetic pairs. Product retrieval only—not recall applicability, safety accuracy or real-world validation.`);
console.log(`Relevant candidates retrieved: ${report.truePositives}/${report.relevant}; misses: ${report.falseNegatives}; unrelated candidates flagged: ${report.falsePositives}/${report.unrelated}.`);
console.log(`Synthetic retrieval precision: ${((report.precision ?? 0) * 100).toFixed(1)}%; recall: ${((report.recall ?? 0) * 100).toFixed(1)}%. ${report.uncertain} uncertain examples excluded from these denominators.`);
for (const result of report.results) {
  if ((result.label === "relevant" && !result.detected) || (result.label === "unrelated" && result.detected)) console.log(`${result.detected ? "FALSE POSITIVE" : "MISS"}: ${result.id} — ${businessBenchmark.find(item => item.id === result.id)!.note}`);
}
console.log("Unverified model/serial/date/lot ranges remain manual checks. Next validation: label real pilot inventory against independently reviewed official notices.");
const regressions = report.results.filter(result => result.kind !== businessBenchmark.find(item => item.id === result.id)!.baseline || result.indexed !== result.detected);
if (regressions.length) { console.error("Baseline changed; review labels and matching behavior before updating expectations:", regressions.map(item => item.id)); process.exitCode = 1; }
