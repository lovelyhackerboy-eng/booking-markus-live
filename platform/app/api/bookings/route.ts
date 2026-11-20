// GET  /v2/api/bookings → bookings cut to the caller's role (amounts need `price`).
// POST /v2/api/bookings { campaignId?, brand?, campaignName?, items[] } → create bookings (edit, CSRF).
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { requireUser, requireWrite } from "@/lib/auth/session";
import { listBookings } from "@/lib/bookings/repo";
import { createBookings, createSchema } from "@/lib/bookings/write";
import { fail, handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";
const names = async () => new Map((await db().select({ email: users.email, name: users.name }).from(users)).map((p) => [p.email, p.name]));

export const GET = handle(async (req: Request) => {
  const u = await requireUser(req);
  const bookings = await listBookings(u, await names());
  return json({ ok: true, count: bookings.length, bookings });
});

export const POST = handle(async (req: Request) => {
  const u = await requireWrite(req);
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) fail(422, "bad_request");
  const ids = await createBookings(u, parsed.data!);
  const all = await listBookings(u, await names());
  return json({ ok: true, bookings: all.filter((b) => ids.includes(b.id as string)) }, { status: 201 });
});
