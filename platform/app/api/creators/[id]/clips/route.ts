// GET  /v2/api/creators/:id/clips → recent clips behind the creator's average views / ER (public numbers, any role).
// POST /v2/api/creators/:id/clips { op: add | remove | refresh } → type in a clip, delete one, or re-read YouTube now.
import { requireUser, requireWrite } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { visibleCampaignIds } from "@/lib/campaigns/repo";
import { creatorExists, loadCreator } from "@/lib/creators/repo";
import { fail, handle, json } from "@/lib/http";
import { applyClipOp, clipOpSchema, clipsOf } from "@/lib/metrics/service";
import { getMetricsSettings } from "@/lib/metrics/settings";

export const dynamic = "force-dynamic";
const idOk = (id: string) => /^[A-Za-z0-9_-]{1,40}$/.test(id);

export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireUser(req);
  const { id } = await ctx.params;
  if (!idOk(id) || !(await creatorExists(id))) fail(404, "not_found");
  return json({ ok: true, clips: await clipsOf(id), settings: await getMetricsSettings() });
});

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const u = await requireWrite(req);
  if (!can(u.role, "edit")) fail(403, "forbidden");
  const { id } = await ctx.params;
  if (!idOk(id) || !(await creatorExists(id))) fail(404, "not_found");
  const parsed = clipOpSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) fail(422, "bad_request");
  await applyClipOp(u, id, parsed.data!);
  return json({ ok: true, clips: await clipsOf(id), creator: await loadCreator(u.role, id, await visibleCampaignIds(u)) });
});
