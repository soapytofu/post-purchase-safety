import { it } from "node:test";
import assert from "node:assert/strict";
import { authRedirectUrl } from "../src/lib/auth-config";

it("keeps successful and failed sign-in redirects on the configured cookie origin", () => {
  const previous = process.env.APP_URL;
  try {
    process.env.APP_URL = "http://127.0.0.1:3002";
    const incoming = "http://localhost:3002/auth/callback";
    assert.equal(authRedirectUrl("/", incoming).href, "http://127.0.0.1:3002/");
    assert.equal(authRedirectUrl("/login?error=link", incoming).href, "http://127.0.0.1:3002/login?error=link");
    process.env.APP_URL = "https://safety.example";
    assert.equal(authRedirectUrl("/", "https://untrusted.example/auth/confirm").href, "https://safety.example/");
    delete process.env.APP_URL;
    assert.equal(authRedirectUrl("/", incoming).href, "http://localhost:3002/");
  } finally {
    if (previous === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previous;
  }
});
