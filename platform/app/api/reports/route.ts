// GET /v2/api/reports → overview of every campaign the caller can see (+ team table for allCampaigns roles).
import { requireUser } from "@/lib/auth/session";
import { handle, json } from "@/lib/http";
import { overviewReport } from "@/lib/reports/campaign";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const u = await requireUser(req);
  return json({ ok: true, ...(await overviewReport(u)) });
});
