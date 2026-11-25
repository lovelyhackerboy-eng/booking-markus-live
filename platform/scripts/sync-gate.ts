// Cron gate: exit 0 when the job is due under the admin's schedule, 3 when not (the wrapper then skips quietly).
//   node dist/sync-gate.cjs import || exit 0
import { existsSync } from "node:fs";
import { closeDb } from "../lib/db/client";
import { isDue } from "../lib/admin/sync-settings";

async function main() {
  const envFile = process.env.MKV2_ENV_FILE || "/home/thestvco/markus-v2-state/runtime.env";
  if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
  const job = process.argv[2] === "metrics" ? "metrics" : "import";
  try {
    process.exitCode = (await isDue(job)) ? 0 : 3;
  } catch {
    process.exitCode = 0; // DB check failed: let the job run (it has its own guards) rather than silently stop syncing
  }
}

main().finally(() => closeDb());
