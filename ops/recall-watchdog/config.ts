export const WORKFLOW_API = "https://api.github.com/repos/soapytofu/post-purchase-safety/actions/workflows/refresh-feeds.yml";

export function assertStagingDatabase(value: string | undefined) {
  if (!value) throw new Error("DATABASE_URL is required");
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      url.hostname !== "aws-0-us-east-1.pooler.supabase.com" || url.port !== "5432" ||
      decodeURIComponent(url.username) !== "postgres.gyapgfgdynkpmrpaejmy" ||
      url.pathname !== "/postgres" || !url.password) {
    throw new Error("Only the configured staging session-pooler connection is allowed");
  }
}

export function watchdogCommand(args: string[]) {
  const allowed = ["--status", "--enable", "--disable", "--apply", "--store-token"];
  if (args.some(arg => !allowed.includes(arg)) || new Set(args).size !== args.length) throw new Error("Invalid arguments");
  const actions = args.filter(arg => ["--status", "--enable", "--disable"].includes(arg));
  if (actions.length > 1) throw new Error("Choose one action");
  const action = actions[0] ?? "--status";
  if (args.includes("--store-token") && action !== "--enable") throw new Error("Store token only during explicit enable");
  if (action === "--status" && args.includes("--apply")) throw new Error("Status is read-only");
  return { action, apply: args.includes("--apply"), storeToken: args.includes("--store-token") };
}
