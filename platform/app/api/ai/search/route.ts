// POST /v2/api/ai/search { query } → filter patch from DeepSeek (see lib/ai/search.ts). Same origin + CSRF; rate-limited.
// The client falls back to its rule parser when this fails.
import { z } from "zod";
import { requireWrite } from "@/lib/auth/session";
import { compactCreators } from "@/lib/ai/creators";
import { rateLimit } from "@/lib/ai/deepseek";
import { aiSearch } from "@/lib/ai/search";
import { db } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";
import { fail, handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";
const body = z.object({ query: z.string().trim().min(1).max(300) });

export const POST = handle(async (req: Request) => {
  const u = await requireWrite(req);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) fail(422, "bad_request");
  rateLimit("search:" + u.email, 30);
  const { usage, cached, ...result } = await aiSearch(parsed.data!.query, u.role, await compactCreators(u.role));
  await db().insert(auditLog).values({ at: new Date(), actorEmail: u.email, action: "ai.search", target: "discovery", after: JSON.stringify({ q: parsed.data!.query.slice(0, 200), cached, tokens: usage }) });
  return json({ ok: true, cached, ...result });
});
