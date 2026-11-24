// Pure: recent clips + settings → average views and ER. No I/O, unit-tested in tests/unit/metrics.test.ts.
import type { MetricsSettings } from "./settings";

export type ClipIn = { publishedAt: Date | null; views: number | null; likes: number | null; comments: number | null; shares: number | null };
export type Computed = { avgViews: number | null; er: number | null; sampleSize: number };

export function average(values: number[], method: MetricsSettings["method"], trimPct = 0): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  if (method === "median") {
    const m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  }
  let use = v;
  if (method === "trimmed") {
    const cut = Math.floor((v.length * trimPct) / 100);
    if (v.length - 2 * cut >= 1) use = v.slice(cut, v.length - cut);
  }
  return use.reduce((s, x) => s + x, 0) / use.length;
}

/** Clips used for the formula: newest first, within maxAgeDays, at most sampleSize, with a view count. */
export function sampleOf<T extends ClipIn>(clips: T[], s: MetricsSettings, now = new Date()): T[] {
  const minTime = s.maxAgeDays ? now.getTime() - s.maxAgeDays * 864e5 : -Infinity;
  return clips
    .filter((c) => c.views != null && c.views >= 0 && (!c.publishedAt || c.publishedAt.getTime() >= minTime))
    .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
    .slice(0, s.sampleSize);
}

export function computeMetrics(clips: ClipIn[], followers: number | null, s: MetricsSettings, now = new Date()): Computed {
  const sample = sampleOf(clips, s, now);
  if (sample.length < s.minSample) return { avgViews: null, er: null, sampleSize: sample.length };
  const avgViews = average(sample.map((c) => c.views!), s.method, s.trimPct);
  const parts = (c: ClipIn) => {
    const xs = [s.erLikes ? c.likes : undefined, s.erComments ? c.comments : undefined, s.erShares ? c.shares : undefined].filter((x) => x !== undefined);
    if (!xs.length || xs.every((x) => x == null)) return null; // nothing known for this clip
    return xs.reduce<number>((t, x) => t + (x ?? 0), 0);
  };
  const perClip = sample
    .map((c) => {
      const inter = parts(c);
      const base = s.erBase === "followers" ? followers : c.views;
      return inter == null || !base ? null : (inter / base) * 100;
    })
    .filter((x): x is number => x != null);
  const er = perClip.length >= s.minSample ? average(perClip, s.method, s.trimPct) : null;
  return {
    avgViews: avgViews == null ? null : Math.round(avgViews),
    er: er == null ? null : Math.round(er * 100) / 100,
    sampleSize: sample.length,
  };
}

/** Vietnam calendar day (UTC+7) of a timestamp, as YYYY-MM-DD. Tracking windows are VN days, both ends inclusive. */
export const vnDay = (d: Date) => new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 10);
export function inWindow(at: Date | null, from: Date | null, to: Date | null): boolean {
  if (!at || !from) return false;
  const day = vnDay(at);
  const f = from.toISOString().slice(0, 10); // stored as UTC midnight of the chosen day
  const t = to ? to.toISOString().slice(0, 10) : "9999-12-31";
  return day >= f && day <= t;
}
