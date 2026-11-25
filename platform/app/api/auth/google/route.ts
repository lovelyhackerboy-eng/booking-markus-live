// POST /v2/api/auth/google { idToken } → verify the Google ID token, decide access (lib/auth/access.ts), start a session.
//   on the Employees tab or approved → 200 + session (first login = viewer; Admin raises the role)
//   anyone else with a verified Google e-mail → 202 { pending: true }: queued for an admin, no session
//   blocked → 403 blocked. The role never comes from the client.
import { verifyGoogleIdToken } from "@/lib/auth/google";
import { accessOnLogin } from "@/lib/auth/access";
import { PERMS } from "@/lib/auth/roles";
import { createSession, originCheck } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { fail, handle, HttpError, json } from "@/lib/http";

export const dynamic = "force-dynamic";
const slow = () => new Promise((r) => setTimeout(r, 250));

export const POST = handle(async (req: Request) => {
  originCheck(req);
  const body = (await req.json().catch(() => null)) as { idToken?: unknown } | null;
  let access, claims;
  try {
    claims = await verifyGoogleIdToken(body?.idToken, { audience: env.googleClientId() });
    access = await accessOnLogin(claims);
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) await slow();
    throw e;
  }
  if (access.kind === "blocked") {
    await slow();
    return fail(403, "blocked");
  }
  if (access.kind === "pending") return json({ ok: false, pending: true, email: claims.email }, { status: 202 });
  const emp = access.emp;
  const { cookie, csrf, role } = await createSession(emp);
  return json(
    { ok: true, user: { email: emp.email, name: emp.name, role, perms: PERMS[role] }, csrf },
    { headers: { "set-cookie": cookie } },
  );
});
