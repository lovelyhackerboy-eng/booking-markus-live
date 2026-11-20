// GET /v2/api/creators → every creator, shaped for the caller's role (lib/creators/serialize.ts).
import { requireUser } from "@/lib/auth/session";
import { visibleCampaignIds } from "@/lib/campaigns/repo";
import { loadCreators } from "@/lib/creators/repo";
import { handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const u = await requireUser(req);
  const creators = await loadCreators(u.role, undefined, undefined, await visibleCampaignIds(u));
  return json({ ok: true, count: creators.length, creators });
});
