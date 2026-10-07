import { it } from "node:test";
import assert from "node:assert/strict";
import { parseSearchHistory, rememberSearch, searchHistoryKey } from "../src/lib/search-history";

it("keeps recent submitted queries ordered, deduplicated and bounded", () => {
  let history = rememberSearch([], " Milk ", 100);
  history = rememberSearch(history, "lamp", 200);
  history = rememberSearch(history, "milk", 300);
  assert.deepEqual(history.map(item => item.query), ["milk", "lamp"]);
  for (let i = 0; i < 12; i++) history = rememberSearch(history, `item ${i}`, 400 + i);
  assert.equal(history.length, 8);
  assert.equal(history[0].query, "item 11");
});

it("ignores blank, malformed, oversized, expired and future records", () => {
  assert.deepEqual(parseSearchHistory("not json"), []);
  assert.deepEqual(parseSearchHistory('{"query":"milk"}'), []);
  const now = 40 * 86_400_000;
  const raw = JSON.stringify([null, 123, {}, { query: "old", searchedAt: 0 }, { query: "future", searchedAt: now + 1 }, { query: "x".repeat(201), searchedAt: now }, { query: "valid", searchedAt: now }]);
  assert.deepEqual(parseSearchHistory(raw, now), [{ query: "valid", searchedAt: now }]);
  assert.deepEqual(rememberSearch([], "  "), []);
});

it("separates accounts, households and public recall searches", () => {
  assert.notEqual(searchHistoryKey("purchases", "alice:household-a"), searchHistoryKey("purchases", "bob:household-a"));
  assert.notEqual(searchHistoryKey("purchases", "alice:household-a"), searchHistoryKey("purchases", "alice:household-b"));
  assert.notEqual(searchHistoryKey("recalls"), searchHistoryKey("purchases", "local"));
});
