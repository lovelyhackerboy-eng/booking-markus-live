// POST /v2/api/bookings/:id { op: "advance" | "cancel" | "contentUrl" | "evaluate", … } (edit, CSRF).
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { requireWrite } from "@/lib/auth/session";
import { listBookings } from "@/lib/bookings/repo";
import { applyBookingOp, opSchema } from "@/lib/bookings/write";
import { fail, handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const u = await requireWrite(req);
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) fail(404, "not_found");
  const parsed = opSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) fail(422, "bad_request");
  await applyBookingOp(u, id, parsed.data!);
  const names = new Map((await db().select({ email: users.email, name: users.name }).from(users)).map((p) => [p.email, p.name]));
  const booking = (await listBookings(u, names)).find((b) => b.id === id) ?? null;
  return json({ ok: true, booking });
});
