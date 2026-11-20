// POST /v2/api/campaigns/:id { op, … } → one change to a campaign (see lib/campaigns/write.ts). Same origin + CSRF.
// Returns the campaign as the caller now sees it (null if it was archived).
import { requireWrite } from "@/lib/auth/session";
import { listCampaigns } from "@/lib/campaigns/repo";
import { applyCampaignOp, opSchema } from "@/lib/campaigns/write";
import { fail, handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const u = await requireWrite(req);
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) fail(404, "not_found");
  const parsed = opSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) fail(422, "bad_request");
  await applyCampaignOp(u, id, parsed.data!);
  const campaign = (await listCampaigns(u)).find((c) => c.id === id) ?? null;
  return json({ ok: true, campaign });
});
