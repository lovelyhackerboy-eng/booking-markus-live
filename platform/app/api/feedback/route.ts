// GET  /v2/api/feedback[?all=1] → your own feedback (admin with all=1: everyone's).
// POST /v2/api/feedback { kind, prio, doing, want, actual?, screen?, route?, appVersion? } → any signed-in role.
import { requireUser, requireWrite } from "@/lib/auth/session";
import { fail, handle, json } from "@/lib/http";
import { addFeedback, listFeedback, newFeedbackSchema } from "@/lib/feedback/service";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const u = await requireUser(req);
  const all = new URL(req.url).searchParams.get("all") === "1";
  return json({ ok: true, feedback: await listFeedback(u, all) });
});

export const POST = handle(async (req: Request) => {
  const u = await requireWrite(req);
  const parsed = newFeedbackSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) fail(422, "bad_request");
  await addFeedback(u, parsed.data!);
  return json({ ok: true, feedback: await listFeedback(u, false) }, { status: 201 });
});
