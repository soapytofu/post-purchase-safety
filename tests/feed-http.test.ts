import { it } from "node:test";
import assert from "node:assert/strict";
import { fetchFeed } from "@/providers/feed-http";

it("retries transient errors and honors bounded Retry-After without exposing keys", async () => {
  let calls = 0;
  const waits: number[] = [];
  const result = await fetchFeed("https://example.invalid?api_key=private", r => r.json(), {
    fetchImpl: (async () => ++calls === 1 ? new Response("busy", { status: 429, headers: { "Retry-After": "2" } }) : Response.json({ ok: true })) as typeof fetch,
    sleep: async ms => { waits.push(ms); },
  });
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(waits, [2000]);
});

it("does not retry permanent errors or sleep beyond the retry budget", async () => {
  for (const status of [403, 429]) {
    let calls = 0;
    await assert.rejects(fetchFeed("https://example.invalid?api_key=private", r => r.json(), {
      fetchImpl: (async () => { calls++; return new Response("no", { status, headers: { "Retry-After": "3600" } }); }) as typeof fetch,
      sleep: async () => { assert.fail("must not sleep"); },
    }), new RegExp(`HTTP ${status}`));
    assert.equal(calls, 1);
  }
});

it("bounds transport and invalid-body failures and sanitizes their messages", async () => {
  for (const invalidBody of [false, true]) {
    let calls = 0;
    await assert.rejects(fetchFeed("https://example.invalid?api_key=private", r => r.json(), {
      fetchImpl: (async () => { calls++; if (invalidBody) return new Response("not JSON"); throw new Error("private key in URL"); }) as typeof fetch,
      sleep: async () => {},
    }), error => error instanceof Error && !error.message.includes("private"));
    assert.equal(calls, 3);
  }
});
