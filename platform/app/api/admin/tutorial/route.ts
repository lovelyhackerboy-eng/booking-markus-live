// GET  /v2/api/admin/tutorial (admin) → { settings, epoch }
// POST /v2/api/admin/tutorial { resetOnDeploy } | { resetNow: true } (admin) → every user sees the welcome + tutorial again
// on their next page load (resetNow), or after every deploy (resetOnDeploy).
import { can } from "@/lib/auth/roles";
import { requireUser, requireWrite } from "@/lib/auth/session";
import { getTutorialSettings, resetTutorialNow, setResetOnDeploy, tutorialEpoch } from "@/lib/admin/tutorial";
import { fail, handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const u = await requireUser(req);
  if (!can(u.role, "admin")) fail(403, "forbidden");
  const s = await getTutorialSettings();
  return json({ ok: true, settings: s, epoch: tutorialEpoch(s) });
});

export const POST = handle(async (req: Request) => {
  const u = await requireWrite(req);
  if (!can(u.role, "admin")) fail(403, "forbidden");
  const body = (await req.json().catch(() => null)) as { resetOnDeploy?: unknown; resetNow?: unknown } | null;
  let s;
  if (body?.resetNow === true) s = await resetTutorialNow(u.email);
  else if (typeof body?.resetOnDeploy === "boolean") s = await setResetOnDeploy(u.email, body.resetOnDeploy);
  else fail(422, "bad_request");
  return json({ ok: true, settings: s, epoch: tutorialEpoch(s!) });
});
