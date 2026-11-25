// GET  /v2/api/admin/tutorial (admin) → { settings: { resetAt } }
// POST /v2/api/admin/tutorial { resetNow: true } (admin) → everyone sees the welcome dialog + tutorial again on their
// next page load. Deploys never do this on their own.
import { can } from "@/lib/auth/roles";
import { requireUser, requireWrite } from "@/lib/auth/session";
import { getTutorialSettings, resetTutorialNow } from "@/lib/admin/tutorial";
import { fail, handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const u = await requireUser(req);
  if (!can(u.role, "admin")) fail(403, "forbidden");
  return json({ ok: true, settings: await getTutorialSettings() });
});

export const POST = handle(async (req: Request) => {
  const u = await requireWrite(req);
  if (!can(u.role, "admin")) fail(403, "forbidden");
  const body = (await req.json().catch(() => null)) as { resetNow?: unknown } | null;
  if (body?.resetNow !== true) fail(422, "bad_request");
  return json({ ok: true, settings: await resetTutorialNow(u.email) });
});
