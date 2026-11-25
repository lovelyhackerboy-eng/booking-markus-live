// One metrics run: refresh the YouTube channels that are due (oldest first), then auto-track posts of running
// campaigns whose tracking window is open. Used by the hourly cron (scripts/metrics-cron.ts) and by the admin
// "Chạy ngay" button. Records a sync_runs row (kind "metrics") with counts only.
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "../db/client";
import { campaigns } from "../db/schema";
import { getSyncSettings, recordRun } from "../admin/sync-settings";
import { vnDay } from "./compute";
import { refreshYoutube, youtubeDue } from "./service";
import { getMetricsSettings } from "./settings";
import { trackCampaign } from "../posts/service";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let running = false;
export const metricsJobRunning = () => running;

export async function runMetricsJob(opts: { batch?: number; pauseMs?: number } = {}) {
  if (running) return { ok: false, error: "already_running" };
  running = true;
  const startedAt = new Date();
  const out = { ok: true, refreshed: 0, failed: 0, errors: {} as Record<string, number>, campaigns: 0, postsAdded: 0, postsUpdated: 0 };
  try {
    const [s, sync] = await Promise.all([getMetricsSettings(), getSyncSettings()]);
    if (s.autoRefresh) {
      for (const id of await youtubeDue(opts.batch ?? sync.metricsBatch, sync.youtubeRefreshHours)) {
        const r = await refreshYoutube(id, s);
        if (r.ok) out.refreshed++;
        else { out.failed++; out.errors[r.error ?? "?"] = (out.errors[r.error ?? "?"] ?? 0) + 1; }
        await sleep(opts.pauseMs ?? 1500);
      }
    }
    const today = vnDay(new Date());
    const live = await db().select().from(campaigns).where(and(eq(campaigns.status, "running"), eq(campaigns.autoTrack, 1), isNotNull(campaigns.trackFrom)));
    for (const c of live) {
      const from = c.trackFrom!.toISOString().slice(0, 10);
      const to = c.trackTo ? new Date(c.trackTo.getTime() + 3 * 864e5).toISOString().slice(0, 10) : "9999-12-31"; // keep counting views 3 days after the window
      if (today < from || today > to) continue;
      const r = await trackCampaign(c.id);
      out.campaigns++; out.postsAdded += r.added; out.postsUpdated += r.updated;
    }
    await recordRun("metrics", startedAt, true, out);
    return out;
  } catch (e) {
    const error = (e as Error).message.slice(0, 300);
    await recordRun("metrics", startedAt, false, out, error).catch(() => null);
    return { ...out, ok: false, error };
  } finally {
    running = false;
  }
}
