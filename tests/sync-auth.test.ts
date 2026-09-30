import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isAuthorizedSyncRequest } from "@/lib/sync-auth";

describe("automated sync authorization", () => {
  const secret = "a-secure-pilot-secret-with-32-chars";
  it("accepts only the exact bearer secret", () => {
    assert.equal(isAuthorizedSyncRequest(`Bearer ${secret}`, secret), true);
    assert.equal(isAuthorizedSyncRequest("Bearer wrong", secret), false);
    assert.equal(isAuthorizedSyncRequest(null, secret), false);
  });
  it("rejects missing and weak configuration", () => {
    assert.equal(isAuthorizedSyncRequest(`Bearer ${secret}`, undefined), false);
    assert.equal(isAuthorizedSyncRequest("Bearer short", "short"), false);
  });
});
