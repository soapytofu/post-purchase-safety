import { matchBusinessStock, businessNoticeIndex, type BusinessNotice, type BusinessStock } from "./business";

export function evaluateBusinessBenchmark(cases: readonly { id: string; label: "relevant" | "unrelated" | "uncertain"; stock: BusinessStock; notice: BusinessNotice }[]) {
  const results = cases.map(item => {
    const evidence = matchBusinessStock(item.stock, item.notice);
    const indexed = businessNoticeIndex([item.notice])(item.stock).some(notice => !!matchBusinessStock(item.stock, notice));
    return { id: item.id, label: item.label, detected: !!evidence, kind: evidence?.kind ?? null, conflicts: evidence?.conflicts ?? [], indexed };
  });
  const relevant = results.filter(item => item.label === "relevant"), unrelated = results.filter(item => item.label === "unrelated");
  const truePositives = relevant.filter(item => item.detected).length, falsePositives = unrelated.filter(item => item.detected).length;
  return { results, relevant: relevant.length, unrelated: unrelated.length, uncertain: results.filter(item => item.label === "uncertain").length, truePositives, falsePositives, falseNegatives: relevant.length - truePositives, precision: truePositives + falsePositives ? truePositives / (truePositives + falsePositives) : null, recall: relevant.length ? truePositives / relevant.length : null };
}
