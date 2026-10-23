import { createServer } from "node:http";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser } from "playwright";
import { PrismaClient } from "@prisma/client";
import { provisionHousehold } from "../src/lib/household-data";
import { createOrganization, saveLocation, inviteBusinessMember, acceptBusinessInvitation } from "../src/lib/business-data";
import { previewInventoryCsv, commitInventoryImport } from "../src/lib/business-inventory";
import { syncRecallProvider } from "../src/lib/sync-recalls";
import { addBusinessCaseNote } from "../src/lib/business-cases";
// This command writes synthetic fixtures. Refuse staging, remote databases and
// ordinary local databases; use a disposable safekeep_test database only.
const root = process.cwd(), database = process.env.TEST_DATABASE_URL;
assert.ok(database, "Set TEST_DATABASE_URL to a disposable local PostgreSQL database.");
const target = new URL(database);
assert.ok(["postgres:", "postgresql:"].includes(target.protocol) && ["127.0.0.1", "localhost"].includes(target.hostname) && target.pathname === "/safekeep_test", "Browser tests are restricted to loopback /safekeep_test.");
process.env.DATABASE_URL = database;
const artifacts = join(root, ".test-artifacts", "business-cases");
mkdirSync(artifacts, { recursive: true });
const p = new PrismaClient({ datasourceUrl: database });
const owner = { id: "a1000000-0000-4000-8000-000000000001", email: "browser-owner@example.test" }, staff = { id: "a1000000-0000-4000-8000-000000000002", email: "browser-staff@example.test" }, foreign = { id: "a1000000-0000-4000-8000-000000000003", email: "browser-foreign@example.test" };
const user = (id: string) => ({ ...([owner, staff, foreign].find(item => item.id === id) ?? foreign), aud: "authenticated", role: "authenticated", email_confirmed_at: "2026-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z", app_metadata: {}, user_metadata: {} });
async function main() {
  for (const identity of [owner, staff, foreign]) await provisionHousehold(p, identity.id);
  const org = await createOrganization(p, owner, "Case browser shop");
  const store = await saveLocation(p, owner.id, org.id, { code: "MAIN", name: "Main Street" });
  await acceptBusinessInvitation(p, staff, await inviteBusinessMember(p, owner.id, org.id, { email: staff.email, role: "STAFF" }));
  const draft = await previewInventoryCsv(p, owner.id, org.id, "stock.csv", "location_code,sku,product_name,quantity_on_hand,inventory_as_of,brand,gtin,lot_number\nMAIN,ALMOND01,Organic almond butter,8,2026-10-22T09:00:00Z,Orchard,012345678905,A1", [store.id]);
  await commitInventoryImport(p, owner.id, org.id, draft.preview!.id);
  const source = { sourceAuthority: "FDA", externalId: `browser-case-notice-${Date.now()}`, headline: "Orchard almond butter recall", description: "Synthetic browser test notice. Verify affected lot A1.", productName: "Organic almond butter", brand: "Orchard", category: "Food", upcs: ["012345678905"], lotNumbers: ["A1"], recallDate: new Date("2026-10-21"), recommendedAction: "Contact the supplier", sourceUrl: "https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts", rawData: { synthetic: true } };
  const provider = (records: typeof source[]) => ({ name: "browser-test", managedAuthorities: ["FDA"], fetchRecalls: async () => ({ records, status: "SUCCEEDED" as const, replaceSnapshot: true }) });
  await syncRecallProvider(provider([source]), p);
  const originalPurchases = await p.purchase.findMany({ orderBy: { id: "asc" } });
  const auth = createServer((req, res) => { const token = req.headers.authorization?.replace("Bearer ", ""); let id = foreign.id; try { id = JSON.parse(Buffer.from(token!.split(".")[1], "base64url").toString()).sub; } catch {} res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(user(id))); });
  await new Promise<void>((resolve, reject) => { auth.once("error", reject); auth.listen(0, "127.0.0.1", resolve); });
  const authPort = (auth.address() as { port: number }).port;
  const probe = createServer();
  await new Promise<void>((resolve, reject) => { probe.once("error", reject); probe.listen(0, "127.0.0.1", resolve); });
  const appPort = (probe.address() as { port: number }).port;
  await new Promise<void>(resolve => probe.close(() => resolve()));
  const origin = `http://127.0.0.1:${appPort}`;
  const app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(appPort)], { cwd: root, env: { ...process.env, DATABASE_URL: database, AUTH_MODE: "supabase", NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${authPort}`, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-only-publishable-key", APP_URL: origin, RESEND_API_KEY: "", EMAIL_FROM: "" }, stdio: ["ignore", "pipe", "pipe"] });
  let logs = "";
  const recordLog = (data: Buffer) => { logs = (logs + data.toString()).slice(-20_000); };
  app.stdout.on("data", recordLog); app.stderr.on("data", recordLog);
  let browser: Browser | undefined;
  try {
    let ready = false;
    for (let i = 0; i < 90; i++) {
      if (app.exitCode !== null) throw new Error("Test app exited before becoming ready.");
      try { if ((await fetch(`${origin}/login`, { signal: AbortSignal.timeout(2000) })).ok) { ready = true; break; } } catch { /* Wait for the local app. */ }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.ok(ready, "Local test app did not become ready.");
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined, headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    async function login(identity: typeof owner) {
      const token = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: identity.id, aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000) })).toString("base64url")}.fake-signature`;
      await context.clearCookies();
      await context.addCookies([{ name: "sb-127-auth-token", value: `base64-${Buffer.from(JSON.stringify({ access_token: token, token_type: "bearer", refresh_token: "test-only-refresh-token", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: user(identity.id) })).toString("base64url")}`, domain: "127.0.0.1", path: "/", sameSite: "Lax" }]);
    }
    await login(owner);
    const page = await context.newPage();
    const errors: string[] = []; page.on("pageerror", error => errors.push(String(error)));
    const base = `${origin}/business/${org.id}`;
    await page.goto(`${base}/recalls`);
    await page.getByRole("button", { name: "Save recall case", exact: true }).first().click();
    await page.getByRole("link", { name: "Open saved case →" }).first().click();
    await page.getByRole("heading", { name: "Review this case" }).waitFor();
    const caseUrl = page.url();
    const caseId = caseUrl.split("/").at(-1)!;
    const original = await p.businessRecallCase.findUniqueOrThrow({ where: { id: caseId } });
    await page.getByLabel("Review notes").fill("Keep this draft when the case changes in another tab.");
    await addBusinessCaseNote(p, owner.id, org.id, { caseId, expectedVersion: original.version, note: "Another tab added a note." });
    await page.getByRole("button", { name: "Record review", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "This case changed" }).waitFor();
    assert.equal(await page.getByLabel("Review notes").inputValue(), "Keep this draft when the case changes in another tab.");
    await page.reload(); await page.getByRole("heading", { name: "Review this case" }).waitFor();
    await page.getByLabel("Review decision").selectOption("CONFIRMED_AFFECTED");
    await page.getByLabel("Confirmed affected units").fill("3");
    await page.getByLabel("Review notes").fill("Checked barcode and lot A1 on the packaging.");
    await page.getByLabel("I checked the official notice").check();
    await page.getByRole("button", { name: "Record review", exact: true }).click();
    await page.getByText("Current decision: confirmed affected", { exact: false }).waitFor();
    await page.getByRole("status").filter({ hasText: "Review recorded" }).waitFor();
    await page.getByLabel("Case note", { exact: true }).fill("Supplier follow-up requested; retain packaging for verification.");
    await page.getByRole("button", { name: "Add note", exact: true }).click();
    await page.getByText("Supplier follow-up requested; retain packaging for verification.", { exact: true }).waitFor();
    await page.getByRole("status").filter({ hasText: "Note added" }).waitFor();
    const exported = await context.request.get(`${caseUrl}/export`);
    assert.equal(exported.status(), 200); assert.equal(exported.headers()["cache-control"], "private, no-store");
    const report = await exported.json(); assert.equal(report.case.organizationId, org.id); assert.equal(report.activity.at(-1).kind, "NOTE_ADDED");
    assert.equal(await p.businessRecallCase.count({ where: { organizationId: org.id } }), 1);
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `No horizontal overflow at ${width}`);
      await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0); });
      await page.screenshot({ path: join(artifacts, `case-${width}.png`), fullPage: true });
    }
    await syncRecallProvider(provider([{ ...source, recommendedAction: "Revised supplier instructions: verify new scope" }]), p);
    await page.reload();
    await page.getByText("The notice has changed since the latest saved evidence.", { exact: false }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Record review", exact: true }).count(), 0);
    await page.getByRole("button", { name: "Capture latest notice evidence", exact: true }).click();
    await page.getByRole("heading", { name: "Notice version 2", exact: true }).waitFor();
    const revised = page.locator(".case-revision").filter({ has: page.locator("summary", { hasText: "Version 2" }) });
    await revised.locator("summary").first().click();
    assert.equal(await revised.locator(".case-diff dd > div p").first().textContent(), "Contact the supplier");
    assert.ok((await revised.locator(".case-diff dd > div").last().innerText()).includes("Revised supplier instructions"));
    await page.getByLabel("Review decision").selectOption("NOT_AFFECTED");
    await page.getByLabel("Review notes").fill("Supplier confirmed our saved lot is outside revised scope.");
    await page.getByLabel("I checked the official notice").check();
    await page.getByRole("button", { name: "Record review", exact: true }).click();
    await page.getByText("Current decision: not affected", { exact: false }).waitFor();
    await page.getByRole("link", { name: "View evidence used", exact: true }).last().click();
    await page.getByText("You are viewing historical evidence", { exact: false }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Record review", exact: true }).count(), 0);
    await page.goto(`${base}/cases`);
    await page.getByRole("link", { name: "Review case", exact: true }).waitFor();
    assert.deepEqual(await p.purchase.findMany({ orderBy: { id: "asc" } }), originalPurchases);
    // The separate household UI must still work after the business workflow.
    await page.goto(`${origin}/`); await page.getByRole("heading", { name: "Household overview", exact: true }).waitFor();
    await page.goto(`${origin}/add`); await page.getByRole("heading", { name: "Track a recent purchase", exact: true }).waitFor();
    const householdProduct = `Browser household desk ${org.id}`;
    const purchaseForm = page.locator(".purchase-form");
    await purchaseForm.getByLabel("Product name *", { exact: true }).fill(householdProduct);
    await purchaseForm.getByLabel("Brand *", { exact: true }).fill("Synthetic household brand");
    await purchaseForm.getByLabel("Category *", { exact: true }).fill("Furniture");
    await purchaseForm.getByLabel("Retailer *", { exact: true }).fill("Synthetic test retailer");
    await purchaseForm.getByLabel("Purchase date *", { exact: true }).fill("2026-10-21");
    await purchaseForm.getByRole("button", { name: "Save & check purchase" }).click();
    await page.waitForURL(url => url.pathname === "/purchases");
    await page.getByText(householdProduct, { exact: true }).waitFor();
    assert.equal(await p.businessRecallCase.count({ where: { organizationId: org.id } }), 1);
    await page.goto(`${origin}/alerts`); await page.getByRole("heading", { name: "Potential recall matches", exact: true }).waitFor();
    await login(staff); await page.goto(caseUrl);
    await page.getByText("Read-only access.", { exact: false }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Record review", exact: true }).count(), 0);
    assert.equal((await context.request.get(`${caseUrl}/export`)).status(), 404);
    await page.goto(`${origin}/purchases`); await page.getByRole("heading", { name: "Everything you’re tracking", exact: true }).waitFor();
    assert.equal(await page.getByText(householdProduct, { exact: true }).count(), 0);
    await login(foreign); await page.goto(caseUrl); await page.getByRole("heading", { name: "404", exact: true }).waitFor();
    assert.equal(await page.getByRole("heading", { name: "Saved stock", exact: true }).count(), 0);
    assert.equal((await context.request.get(`${caseUrl}/export`)).status(), 404);
    await context.clearCookies(); await page.goto(caseUrl); await page.waitForURL(url => url.pathname === "/login" && !!url.searchParams.get("next"));
    assert.equal((await context.request.get(`${caseUrl}/export`)).status(), 401);
    assert.deepEqual(errors, []);
    console.log("PASS: business cases, rejected drafts, notes/exports, notice diffs, role isolation, household purchase flow/isolation, and 320/390/1440px layouts.");
  } catch (error) {
    console.error(logs);
    throw error;
  } finally {
    if (browser) await browser.close();
    if (app.exitCode === null) {
      app.kill("SIGTERM");
      await Promise.race([new Promise(resolve => app.once("exit", resolve)), new Promise(resolve => setTimeout(resolve, 5000))]);
      if (app.exitCode === null) app.kill("SIGKILL");
    }
    auth.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => p.$disconnect());

