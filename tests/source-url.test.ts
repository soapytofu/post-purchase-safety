import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isTrustedSourceUrl } from "@/lib/source-url";

describe("source URL validation", () => {
  it("allows official authority links", () => {
    assert.equal(isTrustedSourceUrl("https://api.fda.gov/food/enforcement.json", "FDA / openFDA"), true);
    assert.equal(isTrustedSourceUrl("https://www.cpsc.gov/Recalls/2026/example", "CPSC"), true);
  });

  it("rejects insecure, deceptive, and unknown links", () => {
    assert.equal(isTrustedSourceUrl("http://www.cpsc.gov/Recalls", "CPSC"), false);
    assert.equal(isTrustedSourceUrl("https://www.cpsc.gov.example.com/Recalls", "CPSC"), false);
    assert.equal(isTrustedSourceUrl("javascript:alert(1)", "CPSC"), false);
  });
});
