// POST /v2/api/admin/feedback { op: update | remove, id, status?, adminNote? } → admin triage of feedback.
import { requireWrite } from "@/lib/auth/session";
import { fail, handle, json } from "@/lib/http";
import { adminFeedback, adminFeedbackSchema, listFeedback } from "@/lib/feedback/service";

export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request) => {
  const u = await requireWrite(req);
  const parsed = adminFeedbackSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) fail(422, "bad_request");
  await adminFeedback(u, parsed.data!);
  return json({ ok: true, feedback: await listFeedback(u, true) });
});
