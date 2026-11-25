// Admin "Tình trạng hệ thống". The app runs inside a CloudLinux LVE on shared hosting: os.cpus() / os.totalmem() /
// statfs report the whole physical server (48 cores, 128 GB, 3.4 TB shared with other customers), NOT this account.
// The account's real usage and limits come from cPanel `uapi ResourceUsage get_usages` (CPU % of one core, RAM,
// processes, entry processes, I/O, disk quota). It takes ~1 s and spawns processes, so it runs in the background,
// one at a time, cached for a minute. Where it is unavailable (local dev) the plan is null — never host numbers.
// Counts and sizes only — never file contents, env values or row data.
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
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
const UAPI = process.env.MKV2_UAPI || "/usr/bin/uapi";

/* ---------- Hosting plan usage / limits (cPanel + CloudLinux) ---------- */
type Meter = { used: number; limit: number | null };
export type Plan = {
  cpu: Meter; // % of one core (limit 150 = 1.5 cores)
  memory: Meter; // bytes, whole account (all sites of the cPanel user)
  processes: Meter;
  entryProcesses: Meter; // concurrent web requests
  io: Meter; // bytes/s
  iops: Meter;
  disk: Meter; // bytes, account quota
  mysqlDisk: Meter; // bytes, all databases of the account
  at: string;
};
const PLAN_IDS: Record<string, keyof Omit<Plan, "at">> = {
  lvecpu: "cpu", lvememphy: "memory", lvenproc: "processes", lveep: "entryProcesses", lveio: "io", lveiops: "iops",
  disk_usage: "disk", cachedmysqldiskusage: "mysqlDisk",
};
const num = (v: unknown): number | null => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

/** Parse `uapi --output=json ResourceUsage get_usages`; keeps only the whitelisted meters. */
export function parsePlan(raw: string, at = new Date()): Plan | null {
  let d: unknown;
  try { d = JSON.parse(raw); } catch { return null; }
  const rows = (d as { result?: { status?: number; data?: unknown } })?.result;
  if (!rows || rows.status !== 1 || !Array.isArray(rows.data)) return null;
  const out: Partial<Plan> = {};
  for (const r of rows.data as { id?: string; usage?: unknown; maximum?: unknown }[]) {
    const k = r?.id ? PLAN_IDS[r.id] : undefined;
    if (!k) continue;
    const used = num(r.usage);
    if (used == null) continue;
    out[k] = { used, limit: num(r.maximum) };
  }
  if (!out.cpu || !out.memory) return null;
  const zero = { used: 0, limit: null };
  return { processes: zero, entryProcesses: zero, io: zero, iops: zero, disk: zero, mysqlDisk: zero, ...out, at: at.toISOString() } as Plan;
}

let planCache: { at: number; plan: Plan | null } | null = null;
let planRunning: Promise<void> | null = null;
function refreshPlan(): Promise<void> {
  if (!planRunning) {
    planRunning = new Promise<void>((resolve) =>
      execFile(UAPI, ["--output=json", "ResourceUsage", "get_usages"], { timeout: 15_000, maxBuffer: 1 << 20 }, (err, out) => {
        planCache = { at: Date.now(), plan: err ? null : parsePlan(String(out)) };
        resolve();
      }),
    ).finally(() => { planRunning = null; });
  }
  return planRunning;
}
/** Last reading (refreshed in the background every minute). The very first call waits up to 3 s for it. */
async function hostingPlan(): Promise<Plan | null> {
  const stale = !planCache || Date.now() - planCache.at > 60_000;
  if (stale) {
    const p = refreshPlan();
    if (!planCache) await Promise.race([p, new Promise((r) => setTimeout(r, 3000))]);
  }
  return planCache?.plan ?? null;
}

/* ---------- App process CPU (% of one core since the previous check) ---------- */
let cpuPrev = { t: process.hrtime.bigint(), u: process.cpuUsage() };
function appCpuPct(): number {
  const t = process.hrtime.bigint(), u = process.cpuUsage();
  const wallUs = Number(t - cpuPrev.t) / 1000;
  const used = u.user - cpuPrev.u.user + (u.system - cpuPrev.u.system);
  cpuPrev = { t, u };
  return wallUs > 0 ? Math.round((used / wallUs) * 1000) / 10 : 0;
}

/* ---------- Folder sizes (du in the background, every 10 minutes) ---------- */
let duCache: { at: number; dirs: Record<string, number | null> } | null = null;
function du(dir: string): Promise<number | null> {
  return new Promise((resolve) =>
    execFile("du", ["-sk", dir], { timeout: 20_000 }, (err, out) => resolve(err ? null : Number(String(out).split(/\s/)[0]) * 1024 || null)),
  );
}
let duRunning = false;
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
      (SELECT COUNT(*) FROM sessions) AS sessions,
      (SELECT COUNT(*) FROM users) AS users`),
  )[0] ?? {};
  const [imp, met, plan] = await Promise.all([lastRun("import"), lastRun("metrics"), hostingPlan()]);
  const runs = (await recentRuns(20)).map((r) => ({
    kind: r.kind, startedAt: r.startedAt, finishedAt: r.finishedAt, status: r.status,
    rowsRead: r.rowsRead, rowsImported: r.rowsImported, rowsSkipped: r.rowsSkipped, error: r.error,
  }));
  return {
    app: {
      version: APP_VERSION, build: buildId(), node: process.version, uptimeSec: Math.round(process.uptime()), env: process.env.NODE_ENV ?? "",
      rss: m.rss, heapUsed: m.heapUsed, cpuPct: appCpuPct(),
    },
    plan,
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
