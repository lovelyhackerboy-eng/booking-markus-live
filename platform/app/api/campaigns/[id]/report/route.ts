// GET /v2/api/campaigns/:id/report → KPI vs delivered views, funnel, per-creator rows. Cost/CPV only with `price`.
import { requireUser } from "@/lib/auth/session";
import { fail, handle, json } from "@/lib/http";
import { campaignReport } from "@/lib/reports/campaign";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const u = await requireUser(req);
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) fail(404, "not_found");
  const r = await campaignReport(u, id);
  if (!r) fail(404, "not_found");
  return json({ ok: true, ...r });
});
