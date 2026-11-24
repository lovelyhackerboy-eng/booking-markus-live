// POST /v2/api/creators/:id/edit { changes: { field: value } } → write the Google Sheet first, then re-import.
// 409 conflict when the Sheet changed since the last import (nothing overwritten); 503 while SHEET_WRITE is off.
import { z } from "zod";
import { requireWrite } from "@/lib/auth/session";
import { visibleCampaignIds } from "@/lib/campaigns/repo";
import { editCreator } from "@/lib/creators/edit";
import { loadCreator } from "@/lib/creators/repo";
import { fail, handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";
const body = z.object({ changes: z.record(z.string(), z.unknown()) });

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const u = await requireWrite(req);
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) fail(404, "not_found");
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) fail(422, "bad_request");
  const r = await editCreator(u, id, parsed.data!.changes);
  const creator = await loadCreator(u.role, id, await visibleCampaignIds(u));
  if (!r.ok) return json({ ok: false, error: r.error, conflicts: r.conflicts ?? [], creator }, { status: r.error === "conflict" ? 409 : r.error === "row_moved" ? 409 : 502 });
  return json({ ok: true, changed: r.changed, creator });
});
