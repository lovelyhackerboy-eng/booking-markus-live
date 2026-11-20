// GET /v2/api/creators/:id → one creator, shaped for the caller's role.
import { requireUser } from "@/lib/auth/session";
import { visibleCampaignIds } from "@/lib/campaigns/repo";
import { loadCreator } from "@/lib/creators/repo";
import { fail, handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const u = await requireUser(req);
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) fail(404, "not_found");
  const creator = await loadCreator(u.role, id, await visibleCampaignIds(u));
  if (!creator) fail(404, "not_found");
  return json({ ok: true, creator });
});
