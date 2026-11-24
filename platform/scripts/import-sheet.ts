// Sheet → MariaDB importer (cron). Reads the bridge payload on stdin, prints COUNTS ONLY (never names, phones, emails).
//   php bridge/sheet-export.php | node dist/import-sheet.cjs --dry-run
//   php bridge/sheet-export.php | node dist/import-sheet.cjs
// The Sheet stays master. Logic lives in lib/import/run.ts (also used by the creator edit/add API).
import { existsSync } from "node:fs";
import { closeDb } from "../lib/db/client";
import { importPayload } from "../lib/import/run";
import type { SheetPayload } from "../lib/import/sheet";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const envFile = process.env.MKV2_ENV_FILE || "/home/thestvco/markus-v2-state/runtime.env";
  if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
  try {
    const raw = await readStdin();
    if (!raw.trim()) throw new Error("empty_input");
    const summary = await importPayload(JSON.parse(raw) as SheetPayload, { dry: process.argv.includes("--dry-run"), force: process.argv.includes("--force") });
    console.log(JSON.stringify({ ok: true, ...summary }));
  } catch (e) {
    console.error(JSON.stringify({ ok: false, error: (e as Error).message.slice(0, 300) }));
    process.exitCode = 1;
  }
}

main().finally(() => closeDb());
