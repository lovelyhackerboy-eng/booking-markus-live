// /v2/api/ai/agent — campaign assistant (edit roles; same origin + CSRF for writes; rate-limited; AI never writes).
//   GET    ?campaignId=…  → the campaign's saved thread + brief (shared by everyone who can see the campaign)
//   POST   { campaignId?, messages[] } → reply + proposed candidates. With a campaign, only the last message is used;
//          history and brief come from the server thread.
//   DELETE ?campaignId=…  → clear the campaign's thread
import { z } from "zod";
import { can } from "@/lib/auth/roles";
import { requireUser, requireWrite, type CurrentUser } from "@/lib/auth/session";
import { clearThread, loadThread, runAgent } from "@/lib/ai/agent";
import { rateLimit } from "@/lib/ai/deepseek";
import { visibleCampaignIds } from "@/lib/campaigns/repo";
import { db } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";
import { fail, handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";
const ID = /^[A-Za-z0-9_-]{1,40}$/;
const body = z.object({
  campaignId: z.string().regex(ID).nullable().optional(),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).min(1).max(30),
});

async function campaignParam(req: Request, u: CurrentUser) {
  if (!can(u.role, "edit")) fail(403, "forbidden");
  const id = new URL(req.url).searchParams.get("campaignId") || "";
  if (!ID.test(id) || !(await visibleCampaignIds(u)).has(id)) fail(404, "not_found");
  return id;
}

export const GET = handle(async (req: Request) => {
  const u = await requireUser(req);
  const id = await campaignParam(req, u);
  return json({ ok: true, ...(await loadThread(id)) });
});

export const DELETE = handle(async (req: Request) => {
  const u = await requireWrite(req);
  const id = await campaignParam(req, u);
  await clearThread(id);
  await db().insert(auditLog).values({ at: new Date(), actorEmail: u.email, action: "ai.thread.clear", target: "campaign:" + id });
  return json({ ok: true });
});

export const POST = handle(async (req: Request) => {
  const u = await requireWrite(req);
  if (!can(u.role, "edit")) fail(403, "forbidden");
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) fail(422, "bad_request");
  const { campaignId } = parsed.data!;
  if (campaignId && !(await visibleCampaignIds(u)).has(campaignId)) fail(404, "not_found");
  rateLimit("agent:" + u.email, 15);
  const out = await runAgent(u, parsed.data!);
  const last = parsed.data!.messages.at(-1)?.content ?? "";
  await db().insert(auditLog).values({
    at: new Date(), actorEmail: u.email, action: "ai.agent", target: "campaign:" + (campaignId ?? "-"),
    after: JSON.stringify({ q: last.slice(0, 200), tools: out.used, proposals: out.proposals.length, tokens: out.usage }),
  });
  return json({ ok: true, reply: out.reply, proposals: out.proposals, brief: out.brief });
});
