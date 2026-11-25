// Admin-editable schedule for the automatic jobs. The host crontab only wakes the jobs up (import every 15 min,
// metrics hourly); each run first asks isDue() and exits early when the admin chose a longer interval or "off".
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { auditLog, settings, syncRuns } from "../db/schema";

const oneOf = (...v: number[]) => z.number().int().refine((x) => v.includes(x), "not allowed");
export const IMPORT_MINUTES = [0, 15, 30, 60, 120, 240, 720, 1440];
export const METRICS_HOURS = [0, 1, 2, 3, 6, 12, 24];
export const CLIENT_MINUTES = [0, 5, 10, 15, 30, 60];
export const syncSettingsSchema = z.object({
  importMinutes: oneOf(...IMPORT_MINUTES), // Sheet → app (0 = tắt)
  metricsHours: oneOf(...METRICS_HOURS), // YouTube metrics + post tracking (0 = tắt)
  metricsBatch: z.number().int().min(5).max(60), // channels per run
  youtubeRefreshHours: z.number().int().min(6).max(168), // re-read a channel at most this often
  clientRefreshMinutes: oneOf(...CLIENT_MINUTES), // open browsers reload data (0 = only on page load)
});
export type SyncSettings = z.infer<typeof syncSettingsSchema>;
export const DEFAULT_SYNC: SyncSettings = { importMinutes: 15, metricsHours: 1, metricsBatch: 25, youtubeRefreshHours: 20, clientRefreshMinutes: 15 };

const KEY = "sync";
export async function getSyncSettings(): Promise<SyncSettings> {
  const [row] = await db().select().from(settings).where(eq(settings.key, KEY)).limit(1);
  if (!row) return DEFAULT_SYNC;
  try {
    const p = syncSettingsSchema.partial().safeParse(JSON.parse(row.value));
    return { ...DEFAULT_SYNC, ...(p.success ? p.data : {}) };
  } catch {
    return DEFAULT_SYNC;
  }
}
export async function saveSyncSettings(actorEmail: string, next: SyncSettings) {
  const now = new Date();
  const value = JSON.stringify(next);
  await db().insert(settings).values({ key: KEY, value, updatedBy: actorEmail, updatedAt: now }).onDuplicateKeyUpdate({ set: { value, updatedBy: actorEmail, updatedAt: now } });
  await db().insert(auditLog).values({ at: now, actorEmail, action: "settings.sync", target: "settings:sync", after: value });
}

const KINDS: Record<"import" | "metrics", string[]> = { import: ["sheet_import", "sheet_import_api"], metrics: ["metrics"] };
export async function lastRun(job: "import" | "metrics") {
  const rows = await db().select().from(syncRuns).where(eq(syncRuns.dryRun, 0)).orderBy(desc(syncRuns.startedAt)).limit(300);
  return rows.find((r) => KINDS[job].includes(r.kind)) ?? null;
}

/** Should the cron-woken job run now? 2 minutes of slack so a 15-min cron does not skip every other run. */
export async function isDue(job: "import" | "metrics", now = new Date()): Promise<boolean> {
  const s = await getSyncSettings();
  const every = job === "import" ? s.importMinutes * 60e3 : s.metricsHours * 3600e3;
  if (!every) return false;
  const last = await lastRun(job);
  return !last || now.getTime() - last.startedAt.getTime() >= every - 2 * 60e3;
}

export async function recordRun(kind: string, startedAt: Date, ok: boolean, summary: Record<string, unknown>, error?: string) {
  await db().insert(syncRuns).values({
    kind, dryRun: 0, startedAt, finishedAt: new Date(), status: ok ? "ok" : "failed",
    rowsRead: Number(summary.refreshed ?? 0), rowsImported: Number(summary.postsAdded ?? 0), rowsSkipped: Number(summary.failed ?? 0),
    skipReasons: JSON.stringify(summary).slice(0, 4000), error: error ? error.slice(0, 500) : null,
  });
}
export const recentRuns = (limit = 30) => db().select().from(syncRuns).where(eq(syncRuns.dryRun, 0)).orderBy(desc(syncRuns.startedAt)).limit(limit);
