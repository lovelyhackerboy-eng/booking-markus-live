// Hourly job (cron on the host): refresh YouTube channels in small batches (oldest first), then auto-track posts of
// running campaigns whose tracking window is open. Prints COUNTS ONLY.
//   node dist/metrics-cron.cjs [--batch=25]
import { existsSync } from "node:fs";
import { and, eq, isNotNull } from "drizzle-orm";
import { closeDb, db } from "../lib/db/client";
import { campaigns } from "../lib/db/schema";
import { vnDay } from "../lib/metrics/compute";
import { refreshYoutube, youtubeDue } from "../lib/metrics/service";
import { getMetricsSettings } from "../lib/metrics/settings";
import { trackCampaign } from "../lib/posts/service";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const envFile = process.env.MKV2_ENV_FILE || "/home/thestvco/markus-v2-state/runtime.env";
  if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
  const batch = Math.min(60, Math.max(1, +(process.argv.find((a) => a.startsWith("--batch="))?.slice(8) ?? 25)));
  const out = { ok: true, refreshed: 0, failed: 0, errors: {} as Record<string, number>, campaigns: 0, postsAdded: 0, postsUpdated: 0 };
  try {
    const s = await getMetricsSettings();
    if (s.autoRefresh) {
      for (const id of await youtubeDue(batch)) {
        const r = await refreshYoutube(id, s);
        if (r.ok) out.refreshed++;
        else { out.failed++; out.errors[r.error ?? "?"] = (out.errors[r.error ?? "?"] ?? 0) + 1; }
        await sleep(1500);
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
    console.log(JSON.stringify(out));
  } catch (e) {
    console.error(JSON.stringify({ ok: false, error: (e as Error).message.slice(0, 300) }));
    process.exitCode = 1;
  }
}

main().finally(() => closeDb());
