// GET  /v2/api/admin/users (admin) → everyone who has signed in: queue (pending), active, blocked.
// POST /v2/api/admin/users (admin)
//   { op: "approve", email, role }   let a queued (or blocked) e-mail in with this role
//   { op: "block", email }           refuse at sign-in, sign out everywhere (also overrides the Employees tab)
//   { op: "unblock", email }         back to the queue (nothing is deleted)
//   { op: "role", email, role }      change an active user's role (also accepted without op, for older clients)
// Never your own account; never removes the last active admin.
import { can } from "@/lib/auth/roles";
import { requireUser, requireWrite } from "@/lib/auth/session";
import { changeUser, isRole, listUsers, USER_OPS, type UserOp } from "@/lib/admin/users";
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
  const body = (await req.json().catch(() => null)) as { op?: unknown; email?: unknown; role?: unknown } | null;
  const op = (body?.op ?? "role") as UserOp;
  if (typeof body?.email !== "string" || !USER_OPS.includes(op)) fail(422, "bad_request");
  if ((op === "role" || op === "approve") && !isRole(body!.role)) fail(422, "bad_request");
  await changeUser(u.email, op, body!.email as string, isRole(body!.role) ? body!.role : undefined);
  return json({ ok: true, users: await listUsers() });
});
