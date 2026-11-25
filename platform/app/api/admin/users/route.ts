// GET  /v2/api/admin/users (admin) → everyone who has logged in, with role and last login.
// POST /v2/api/admin/users { email, role } (admin) → change a role (not your own; never remove the last admin).
import { can } from "@/lib/auth/roles";
import { requireUser, requireWrite } from "@/lib/auth/session";
import { isRole, listUsers, setUserRole } from "@/lib/admin/users";
import { fail, handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const u = await requireUser(req);
  if (!can(u.role, "admin")) fail(403, "forbidden");
  return json({ ok: true, users: await listUsers() });
});

export const POST = handle(async (req: Request) => {
  const u = await requireWrite(req);
  if (!can(u.role, "admin")) fail(403, "forbidden");
  const body = (await req.json().catch(() => null)) as { email?: unknown; role?: unknown } | null;
  if (typeof body?.email !== "string" || !isRole(body.role)) fail(422, "bad_request");
  await setUserRole(u.email, body!.email as string, body!.role as never);
  return json({ ok: true, users: await listUsers() });
});
