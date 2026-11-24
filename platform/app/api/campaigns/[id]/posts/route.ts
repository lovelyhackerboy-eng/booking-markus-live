// GET  /v2/api/campaigns/:id/posts → posts delivered for a campaign the caller can see.
// POST /v2/api/campaigns/:id/posts { op: add | update | exclude | remove | refresh } (edit role, campaign visible).
import { requireUser, requireWrite } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { visibleCampaign } from "@/lib/campaigns/write";
import { fail, handle, json } from "@/lib/http";
import { applyPostOp, listPosts, postOpSchema } from "@/lib/posts/service";

export const dynamic = "force-dynamic";
const idOk = (id: string) => /^[A-Za-z0-9_-]{1,40}$/.test(id);

export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const u = await requireUser(req);
  const { id } = await ctx.params;
  if (!idOk(id)) fail(404, "not_found");
  await visibleCampaign(u, id);
  return json({ ok: true, posts: await listPosts(id) });
});

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const u = await requireWrite(req);
  if (!can(u.role, "edit")) fail(403, "forbidden");
  const { id } = await ctx.params;
  if (!idOk(id)) fail(404, "not_found");
  await visibleCampaign(u, id);
  const parsed = postOpSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) fail(422, "bad_request");
  const result = await applyPostOp(u, id, parsed.data!);
  return json({ ok: true, result: result ?? null, posts: await listPosts(id) });
});
