// POST /v2/api/ai/agent { campaignId?, messages[] } → campaign assistant reply + proposed candidates.
// Edit roles only (it suggests campaign work); same origin + CSRF; rate-limited; nothing is written by the AI.
import { z } from "zod";
import { can } from "@/lib/auth/roles";
import { requireWrite } from "@/lib/auth/session";
import { runAgent } from "@/lib/ai/agent";
import { rateLimit } from "@/lib/ai/deepseek";
import { db } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";
import { fail, handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";
const body = z.object({
  campaignId: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/).nullable().optional(),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).min(1).max(30),
});

export const POST = handle(async (req: Request) => {
  const u = await requireWrite(req);
  if (!can(u.role, "edit")) fail(403, "forbidden");
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) fail(422, "bad_request");
  rateLimit("agent:" + u.email, 15);
  const out = await runAgent(u, parsed.data!);
  const last = parsed.data!.messages.at(-1)?.content ?? "";
  await db().insert(auditLog).values({ at: new Date(), actorEmail: u.email, action: "ai.agent", target: "campaign:" + (parsed.data!.campaignId ?? "-"), after: JSON.stringify({ q: last.slice(0, 200), tools: out.used, proposals: out.proposals.length }) });
  return json({ ok: true, reply: out.reply, proposals: out.proposals });
});
