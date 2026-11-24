// GET /v2/api/creators → every creator, shaped for the caller's role (lib/creators/serialize.ts).
import { requireUser, requireWrite } from "@/lib/auth/session";
import { createCreator, createSchema } from "@/lib/creators/edit";
import { loadCreator } from "@/lib/creators/repo";
import { visibleCampaignIds } from "@/lib/campaigns/repo";
import { loadCreators } from "@/lib/creators/repo";
import { fail, handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const u = await requireUser(req);
  const creators = await loadCreators(u.role, undefined, undefined, await visibleCampaignIds(u));
  return json({ ok: true, count: creators.length, creators });
});

// POST /v2/api/creators { name, links{platform:url}, labels?, fields? } → append a row to the Google Sheet, re-import,
// return the new creator (uid assigned by the old app's identity code). 409 name_taken / url_taken.
export const POST = handle(async (req: Request) => {
  const u = await requireWrite(req);
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) fail(422, "bad_request");
  const r = await createCreator(u, parsed.data!);
  if (!r.ok) return json({ ok: false, error: r.error, existing: r.existing ?? null }, { status: r.error === "name_taken" || r.error === "url_taken" ? 409 : 422 });
  const creator = r.id ? await loadCreator(u.role, r.id, await visibleCampaignIds(u)) : null;
  return json({ ok: true, id: r.id, row: r.row, creator, pending: !r.id }, { status: 201 });
});
