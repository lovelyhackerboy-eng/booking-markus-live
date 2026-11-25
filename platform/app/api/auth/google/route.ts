// POST /v2/api/auth/google { idToken } → verify the Google ID token, look the email up in Employees, start a session.
// Same contract as PHP google-auth.php: unknown email → 401 not_authorized; the role never comes from the client.
// First login → viewer (least privilege); Admin raises the role in Quản trị → Người dùng.
import { verifyGoogleIdToken } from "@/lib/auth/google";
import { directory } from "@/lib/auth/directory";
import { PERMS } from "@/lib/auth/roles";
import { createSession, originCheck } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { fail, handle, HttpError, json } from "@/lib/http";

export const dynamic = "force-dynamic";
const slow = () => new Promise((r) => setTimeout(r, 250));

export const POST = handle(async (req: Request) => {
  originCheck(req);
  const body = (await req.json().catch(() => null)) as { idToken?: unknown } | null;
  let emp;
  try {
    const claims = await verifyGoogleIdToken(body?.idToken, { audience: env.googleClientId() });
    emp = await directory().lookup(claims.email, true);
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) await slow();
    throw e;
  }
  if (!emp) {
    await slow();
    return fail(401, "not_authorized");
  }
  const { cookie, csrf, role } = await createSession(emp);
  return json(
    { ok: true, user: { email: emp.email, name: emp.name, role, perms: PERMS[role] }, csrf },
    { headers: { "set-cookie": cookie } },
  );
});
