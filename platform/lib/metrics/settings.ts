// Admin-configurable metrics formula, stored as JSON in `settings` (key "metrics"). Changing it recomputes every
// creator from the stored clips — no refetch needed.
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { auditLog, settings } from "../db/schema";

export const metricsSettingsSchema = z.object({
  sampleSize: z.number().int().min(3).max(30), // the N most recent clips
  maxAgeDays: z.number().int().min(0).max(730), // ignore clips older than this (0 = no limit)
  method: z.enum(["mean", "median", "trimmed"]), // how per-clip numbers are averaged
  trimPct: z.number().int().min(0).max(40), // % cut from EACH end for "trimmed"
  minSample: z.number().int().min(1).max(30), // fewer clips than this → no number shown
  erBase: z.enum(["views", "followers"]), // ER = interactions / views (per clip) or / followers
  erLikes: z.boolean(),
  erComments: z.boolean(),
  erShares: z.boolean(),
  autoRefresh: z.boolean(), // hourly job refreshes YouTube channels
});
export type MetricsSettings = z.infer<typeof metricsSettingsSchema>;

export const DEFAULT_METRICS: MetricsSettings = {
  sampleSize: 10,
  maxAgeDays: 90,
  method: "median",
  trimPct: 10,
  minSample: 3,
  erBase: "views",
  erLikes: true,
  erComments: true,
  erShares: true,
  autoRefresh: true,
};

const KEY = "metrics";

export async function getMetricsSettings(): Promise<MetricsSettings> {
  const [row] = await db().select().from(settings).where(eq(settings.key, KEY)).limit(1);
  if (!row) return DEFAULT_METRICS;
  try {
    const parsed = metricsSettingsSchema.partial().safeParse(JSON.parse(row.value));
    return { ...DEFAULT_METRICS, ...(parsed.success ? parsed.data : {}) };
  } catch {
    return DEFAULT_METRICS;
  }
}

export async function saveMetricsSettings(actorEmail: string, next: MetricsSettings) {
  const now = new Date();
  const value = JSON.stringify(next);
  await db()
    .insert(settings)
    .values({ key: KEY, value, updatedBy: actorEmail, updatedAt: now })
    .onDuplicateKeyUpdate({ set: { value, updatedBy: actorEmail, updatedAt: now } });
  await db().insert(auditLog).values({ at: now, actorEmail, action: "settings.metrics", target: "settings:metrics", after: value });
}
