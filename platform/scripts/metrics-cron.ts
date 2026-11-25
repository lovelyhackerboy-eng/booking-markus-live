// Hourly job (cron on the host). Runs only when the admin's schedule says it is due (Quản trị → Đồng bộ tự động),
// then refreshes YouTube channels and auto-tracks campaign posts. Prints COUNTS ONLY.
//   node dist/metrics-cron.cjs [--batch=25] [--force]
import { existsSync } from "node:fs";
import { closeDb } from "../lib/db/client";
import { isDue } from "../lib/admin/sync-settings";
import { runMetricsJob } from "../lib/metrics/job";

async function main() {
  const envFile = process.env.MKV2_ENV_FILE || "/home/thestvco/markus-v2-state/runtime.env";
  if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
  const arg = process.argv.find((a) => a.startsWith("--batch="));
  try {
    if (!process.argv.includes("--force") && !(await isDue("metrics"))) return console.log(JSON.stringify({ ok: true, skipped: "not_due" }));
    const out = await runMetricsJob({ batch: arg ? Math.min(60, Math.max(1, +arg.slice(8))) : undefined });
    console.log(JSON.stringify(out));
    if (!out.ok) process.exitCode = 1;
  } catch (e) {
    console.error(JSON.stringify({ ok: false, error: (e as Error).message.slice(0, 300) }));
    process.exitCode = 1;
  }
}

main().finally(() => closeDb());
