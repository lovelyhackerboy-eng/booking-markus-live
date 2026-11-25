// GET  /v2/api/admin/sync (admin) → schedule of the automatic jobs + allowed values.
// POST /v2/api/admin/sync { settings } (admin) → save; the next cron wake-up follows it.
import { can } from "@/lib/auth/roles";
import { requireUser, requireWrite } from "@/lib/auth/session";
import { CLIENT_MINUTES, DEFAULT_SYNC, getSyncSettings, IMPORT_MINUTES, METRICS_HOURS, saveSyncSettings, syncSettingsSchema } from "@/lib/admin/sync-settings";
import { fail, handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";
const options = { importMinutes: IMPORT_MINUTES, metricsHours: METRICS_HOURS, clientRefreshMinutes: CLIENT_MINUTES };

export const GET = handle(async (req: Request) => {
  const u = await requireUser(req);
  if (!can(u.role, "admin")) fail(403, "forbidden");
  return json({ ok: true, settings: await getSyncSettings(), defaults: DEFAULT_SYNC, options });
});

export const POST = handle(async (req: Request) => {
  const u = await requireWrite(req);
  if (!can(u.role, "admin")) fail(403, "forbidden");
  const body = (await req.json().catch(() => null)) as { settings?: unknown } | null;
  const parsed = syncSettingsSchema.safeParse(body?.settings);
  if (!parsed.success) fail(422, "bad_request");
  await saveSyncSettings(u.email, parsed.data!);
  return json({ ok: true, settings: parsed.data, options });
});
