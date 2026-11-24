// GET  /v2/api/admin/metrics → the metrics formula (any signed-in user may read it; the UI explains numbers with it).
// POST /v2/api/admin/metrics { settings } → admin only; saves and recomputes every creator from stored clips.
import { requireUser, requireWrite } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { fail, handle, json } from "@/lib/http";
import { recomputeAll } from "@/lib/metrics/service";
import { DEFAULT_METRICS, getMetricsSettings, metricsSettingsSchema, saveMetricsSettings } from "@/lib/metrics/settings";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  await requireUser(req);
  return json({ ok: true, settings: await getMetricsSettings(), defaults: DEFAULT_METRICS });
});

export const POST = handle(async (req: Request) => {
  const u = await requireWrite(req);
  if (!can(u.role, "admin")) fail(403, "forbidden");
  const body = (await req.json().catch(() => null)) as { settings?: unknown } | null;
  const parsed = metricsSettingsSchema.safeParse(body?.settings);
  if (!parsed.success) fail(422, "bad_request");
  if (parsed.data!.minSample > parsed.data!.sampleSize) fail(422, "min_gt_sample");
  await saveMetricsSettings(u.email, parsed.data!);
  const recomputed = await recomputeAll();
  return json({ ok: true, settings: parsed.data, recomputed });
});
