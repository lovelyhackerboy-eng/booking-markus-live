// Calls the PHP CLI bridges in bridge/ (same Google gateway, lock and identity code as the old app).
// SHEET_WRITE=on in runtime.env enables writes; MKV2_SHEET_ID / MKV2_PHP_STATE_DIR (test copy) pass through the env.
import { execFile } from "node:child_process";
import path from "node:path";
import { importPayload, type ImportSummary } from "../import/run";
import type { SheetPayload } from "../import/sheet";
import { fail } from "../http";

export type BridgeResult = { ok: boolean; error?: string; [k: string]: unknown };
type Runner = (script: string, input?: unknown) => Promise<unknown>;

const realRunner: Runner = (script, input) =>
  new Promise((resolve, reject) => {
    const child = execFile(
      process.env.PHP_BIN || "/usr/local/bin/php",
      [path.join(process.cwd(), "bridge", script)],
      { env: process.env, maxBuffer: 64 * 1024 * 1024, timeout: 90_000 },
      (err, stdout) => {
        if (err) return reject(new Error("bridge_exec_failed"));
        try {
          resolve(JSON.parse(stdout));
        } catch {
          reject(new Error("bridge_bad_output"));
        }
      },
    );
    child.stdin?.end(input === undefined ? "" : JSON.stringify(input));
  });

let runner: Runner = realRunner;
export function setBridgeForTests(r: Runner | null) {
  runner = r ?? realRunner;
}

export const sheetWriteEnabled = () => process.env.SHEET_WRITE === "on";

export async function sheetWrite(input: Record<string, unknown>): Promise<BridgeResult> {
  if (!sheetWriteEnabled()) fail(503, "sheet_write_disabled");
  try {
    return (await runner("sheet-write.php", input)) as BridgeResult;
  } catch {
    return fail(502, "sheet_unavailable");
  }
}

// Read-only health check of the PHP bridge (works while writing is off): header of the Sheet + one row's shape.
export async function bridgeCheck(): Promise<{ ok: boolean; columns: number; formulaCols: number; ms: number; error?: string }> {
  const t0 = Date.now();
  try {
    const r = (await runner("sheet-write.php", { op: "read", row: 4 })) as BridgeResult & { header?: string[]; formulaCols?: string[] };
    return { ok: !!r.ok, columns: r.header?.length ?? 0, formulaCols: r.formulaCols?.length ?? 0, ms: Date.now() - t0, error: r.ok ? undefined : String(r.error) };
  } catch (e) {
    return { ok: false, columns: 0, formulaCols: 0, ms: Date.now() - t0, error: (e as Error).message };
  }
}

// Re-import the whole Sheet into the DB (≈3 s). One at a time per process; a caller arriving during a run waits for it.
let running: Promise<ImportSummary> | null = null;
export function refreshFromSheet(): Promise<ImportSummary> {
  if (!running) {
    running = (async () => {
      try {
        const payload = (await runner("sheet-export.php")) as SheetPayload;
        return await importPayload(payload, { kind: "sheet_import_api" });
      } finally {
        running = null;
      }
    })();
  }
  return running;
}
