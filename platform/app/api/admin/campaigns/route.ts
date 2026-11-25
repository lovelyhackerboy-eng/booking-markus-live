// GET /v2/api/admin/campaigns (admin) → soft-deleted campaigns (restore with POST /campaigns/:id { op: "restore" }).
import { can } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { listDeletedCampaigns } from "@/lib/campaigns/repo";
import { fail, handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const u = await requireUser(req);
  if (!can(u.role, "admin")) fail(403, "forbidden");
  return json({ ok: true, campaigns: await listDeletedCampaigns() });
});
