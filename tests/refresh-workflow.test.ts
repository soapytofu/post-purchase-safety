import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

const workflow = readFileSync(new URL("../.github/workflows/refresh-feeds.yml", import.meta.url), "utf8");
const refreshStep = workflow.split("        run: |\n")[1]?.split("\n").map(line => line.replace(/^          /, "")).join("\n");

test("scheduled recovery retains the shared concurrency and main-only protections", () => {
  assert.match(workflow, /cron: '23 \* \* \* \*'/);
  assert.match(workflow, /cron: '53 \* \* \* \*'/);
  assert.match(workflow, /group: staging-recall-refresh/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /REFRESH_SCHEDULE: \$\{\{ github\.event\.schedule \}\}/);
});

for (const [name, trigger, schedule, conditional] of [
  ["primary schedule", "", "23 * * * *", false],
  ["recovery schedule", "", "53 * * * *", true],
  ["operator dispatch", "operator", "", false],
  ["watchdog dispatch", "supabase-watchdog", "", true],
] as const) {
  test(`${name} selects the correct refresh mode`, () => {
    assert.ok(refreshStep, "workflow refresh shell must exist");
    // Execute the actual workflow shell, replacing npm so no network/database
    // work or dependency installation can occur during this contract test.
    const result = spawnSync("bash", ["-eu", "-c", `npm() { printf '%s\\n' "$*"; }\n${refreshStep}`], {
      encoding: "utf8",
      env: { PATH: process.env.PATH, REFRESH_TRIGGER: trigger, REFRESH_SCHEDULE: schedule },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), `run feeds:refresh -- --apply${conditional ? " --if-needed" : ""}`);
  });
}
