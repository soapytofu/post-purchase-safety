import { it } from "node:test";
import assert from "node:assert/strict";
import { databaseConnectionUrl } from "@/lib/database-config";

it("bounds hosted pools without overriding operator settings or local databases", () => {
  const url = new URL(databaseConnectionUrl("postgresql://user:password@localhost:5432/test?sslmode=require")!);
  assert.equal(url.searchParams.get("connection_limit"), "3");
  assert.equal(url.searchParams.get("pool_timeout"), "20");
  assert.equal(url.searchParams.get("sslmode"), "require");
  const configured = new URL(databaseConnectionUrl("postgresql://localhost/test?connection_limit=5&pool_timeout=10")!);
  assert.equal(configured.searchParams.get("connection_limit"), "5");
  assert.equal(configured.searchParams.get("pool_timeout"), "10");
  assert.equal(databaseConnectionUrl("file:./local.db"), "file:./local.db");
  assert.equal(databaseConnectionUrl(undefined), undefined);
});
