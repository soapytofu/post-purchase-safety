import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hostnameFromHostHeader, isLoopbackHostname, isPublicPilotPath } from "@/lib/access-boundary";

describe("private pilot access boundary", () => {
  it("recognizes only loopback hostnames as private", () => {
    assert.equal(isLoopbackHostname("localhost"), true);
    assert.equal(isLoopbackHostname("127.0.0.1"), true);
    assert.equal(isLoopbackHostname("[::1]"), true);
    assert.equal(isLoopbackHostname("safekeep.example"), false);
    assert.equal(isLoopbackHostname("localhost.example"), false);
  });

  it("parses host headers without accepting deceptive suffixes", () => {
    assert.equal(hostnameFromHostHeader("127.0.0.1:3001"), "127.0.0.1");
    assert.equal(hostnameFromHostHeader("[::1]:3001"), "::1");
    assert.equal(hostnameFromHostHeader("localhost.example:3001"), "localhost.example");
  });

  it("exposes only public recall and operational routes", () => {
    assert.equal(isPublicPilotPath("/notices"), true);
    assert.equal(isPublicPilotPath("/api/health"), true);
    assert.equal(isPublicPilotPath("/api/sync"), true);
    assert.equal(isPublicPilotPath("/purchases"), false);
    assert.equal(isPublicPilotPath("/alerts"), false);
    assert.equal(isPublicPilotPath("/api/export"), false);
  });
});
