// GET  /v2/api/campaigns → only the campaigns the caller owns or follows (all of them for manager/admin).
// POST /v2/api/campaigns { name, brand?, kpiViews? } → new campaign owned by the caller (edit permission, CSRF).
import { requireUser, requireWrite } from "@/lib/auth/session";
import { listCampaigns } from "@/lib/campaigns/repo";
import { createCampaign, createSchema } from "@/lib/campaigns/write";
import { fail, handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const u = await requireUser(req);
  const campaigns = await listCampaigns(u);
  return json({ ok: true, count: campaigns.length, campaigns });
});

export const POST = handle(async (req: Request) => {
  const u = await requireWrite(req);
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) fail(422, "bad_request");
  const id = await createCampaign(u, parsed.data!);
  const campaign = (await listCampaigns(u)).find((c) => c.id === id) ?? null;
  return json({ ok: true, campaign }, { status: 201 });
});
