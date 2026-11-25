// GET /v2/api/admin/system (admin) → memory, disk, database size, job runs, sync schedule. Counts and sizes only.
import { can } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { systemStatus } from "@/lib/admin/system";
import { fail, handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const u = await requireUser(req);
  if (!can(u.role, "admin")) fail(403, "forbidden");
  return json({ ok: true, ...(await systemStatus()) });
});
