// GET /v2/api/auth/session → the logged-in user (role re-read from the directory) and the CSRF token.
import { PERMS } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const u = await requireUser(req);
  return json({ ok: true, user: { email: u.email, name: u.name, role: u.role, perms: PERMS[u.role] }, csrf: u.csrf });
});
