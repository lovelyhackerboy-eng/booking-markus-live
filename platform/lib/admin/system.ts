// Admin "Tình trạng hệ thống": process + machine memory, disk, database size, folder sizes, job runs.
// Counts and sizes only — never file contents, env values or row data.
import { execFile } from "node:child_process";
import { readFileSync, statfsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { getSyncSettings, lastRun, recentRuns } from "./sync-settings";

function readJson(file: string) {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; }
}
export const APP_VERSION: string = readJson(path.join(process.cwd(), "package.json"))?.version ?? "?";
let build: string | null = null;
export function buildId() {
  if (build === null) {
    try { build = readFileSync(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim(); } catch { build = "dev"; }
  }
  return build;
}

const STATE = process.env.MKV2_STATE_DIR || "/home/thestvco/markus-v2-state";
const LIMIT_MB = Number(process.env.MKV2_RAM_LIMIT_MB || 1536); // CloudLinux LVE memory limit of the hosting account

let duCache: { at: number; dirs: Record<string, number | null> } | null = null;
function du(dir: string): Promise<number | null> {
  return new Promise((resolve) =>
    execFile("du", ["-sk", dir], { timeout: 20_000 }, (err, out) => resolve(err ? null : Number(String(out).split(/\s/)[0]) * 1024 || null)),
  );
}
let duRunning = false;
/** Never blocks the page: returns the last measurement (refreshed in the background every 10 minutes). */
function folderSizes(): Record<string, number | null> {
  if ((!duCache || Date.now() - duCache.at > 10 * 60e3) && !duRunning) {
    duRunning = true;
    Promise.all([du(process.cwd()), du(STATE)])
      .then(([app, state]) => { duCache = { at: Date.now(), dirs: { app, state } }; })
      .finally(() => { duRunning = false; });
  }
  return duCache?.dirs ?? { app: null, state: null };
}

type Row = Record<string, unknown>;
const rowsOf = (r: unknown): Row[] => (Array.isArray(r) ? (Array.isArray(r[0]) ? (r[0] as Row[]) : (r as Row[])) : []);

export async function systemStatus() {
  const m = process.memoryUsage();
  let disk: { total: number; free: number } | null = null;
  try {
    const s = statfsSync(os.homedir());
    disk = { total: s.blocks * s.bsize, free: s.bavail * s.bsize };
  } catch { /* not supported here */ }
  const size = rowsOf(await db().execute(sql`SELECT COALESCE(SUM(data_length + index_length), 0) AS bytes FROM information_schema.tables WHERE table_schema = DATABASE()`))[0];
  const counts = rowsOf(
    await db().execute(sql`SELECT
      (SELECT COUNT(*) FROM creators WHERE deleted_at IS NULL) AS creators,
      (SELECT COUNT(*) FROM campaigns WHERE status <> 'deleted') AS campaigns,
      (SELECT COUNT(*) FROM campaigns WHERE status = 'deleted') AS campaignsDeleted,
      (SELECT COUNT(*) FROM creator_clips) AS clips,
      (SELECT COUNT(*) FROM posts) AS posts,
      (SELECT COUNT(*) FROM creator_metrics WHERE avg_views IS NOT NULL) AS creatorsWithMetrics,
      (SELECT COUNT(*) FROM feedback WHERE status = 'new') AS feedbackNew,
      (SELECT COUNT(*) FROM sessions) AS sessions`),
  )[0] ?? {};
  const [imp, met] = await Promise.all([lastRun("import"), lastRun("metrics")]);
  const runs = (await recentRuns(20)).map((r) => ({
    kind: r.kind, startedAt: r.startedAt, finishedAt: r.finishedAt, status: r.status,
    rowsRead: r.rowsRead, rowsImported: r.rowsImported, rowsSkipped: r.rowsSkipped, error: r.error,
  }));
  return {
    app: { version: APP_VERSION, build: buildId(), node: process.version, uptimeSec: Math.round(process.uptime()), env: process.env.NODE_ENV ?? "" },
    memory: { rss: m.rss, heapUsed: m.heapUsed, heapTotal: m.heapTotal, limitMb: LIMIT_MB, hostTotal: os.totalmem(), hostFree: os.freemem() },
    cpu: { load: os.loadavg().map((x) => Math.round(x * 100) / 100), cores: os.cpus().length },
    disk,
    folders: folderSizes(),
    database: { bytes: Number(size?.bytes ?? 0), ...Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Number(v)])) },
    jobs: {
      import: imp ? { startedAt: imp.startedAt, status: imp.status, rows: imp.rowsImported, error: imp.error } : null,
      metrics: met ? { startedAt: met.startedAt, status: met.status, summary: met.skipReasons } : null,
    },
    runs,
    sync: await getSyncSettings(),
    checkedAt: new Date(),
  };
}
