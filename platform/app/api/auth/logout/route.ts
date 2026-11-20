// POST /v2/api/auth/logout (same origin + X-CSRF-Token).
import { clearCookie, destroySession, requireWrite } from "@/lib/auth/session";
import { handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request) => {
  await requireWrite(req);
  await destroySession(req);
  return json({ ok: true }, { headers: { "set-cookie": clearCookie() } });
});
