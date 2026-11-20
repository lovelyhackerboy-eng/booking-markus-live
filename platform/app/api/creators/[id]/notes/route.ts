// POST /v2/api/creators/:id/notes { text, kind? } → internal note on a creator (needs `edit` and `contact`, CSRF).
import { eq } from "drizzle-orm";
import { z } from "zod";
import { can } from "@/lib/auth/roles";
import { requireWrite } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { auditLog, creators, notes } from "@/lib/db/schema";
import { fail, handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";
const body = z.object({ text: z.string().trim().min(1).max(4000), kind: z.enum(["", "good", "risk"]).optional().default("") });

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const u = await requireWrite(req);
  if (!can(u.role, "edit") || !can(u.role, "contact")) fail(403, "forbidden");
  const { id } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) fail(422, "bad_request");
  const [c] = await db().select({ id: creators.id }).from(creators).where(eq(creators.id, id)).limit(1);
  if (!c) fail(404, "not_found");
  const now = new Date();
  await db().insert(notes).values({ creatorId: id, authorEmail: u.email, authorName: u.name, body: parsed.data!.text, kind: parsed.data!.kind, createdAt: now });
  await db().insert(auditLog).values({ at: now, actorEmail: u.email, action: "creator.note", target: "creator:" + id, after: JSON.stringify({ kind: parsed.data!.kind }) });
  return json({ ok: true, note: { authorName: u.name, body: parsed.data!.text, kind: parsed.data!.kind, createdAt: now } }, { status: 201 });
});
