// GET /v2/api/admin/sheet-check (admin) → can the Node app run the PHP Sheet bridge? Read-only, returns counts only.
import { can } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { bridgeCheck, sheetWriteEnabled } from "@/lib/sheet/bridge";
import { fail, handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const u = await requireUser(req);
  if (!can(u.role, "admin")) fail(403, "forbidden");
  return json({ ...(await bridgeCheck()), sheetWrite: sheetWriteEnabled() });
});
