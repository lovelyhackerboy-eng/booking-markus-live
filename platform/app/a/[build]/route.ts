// GET /v2/a/<build>/ → the UI shell for that build. An older build id (old tab, bookmark) redirects to the current one,
// so nobody keeps running stale code after a deploy. Files under it (/v2/a/<build>/…) are rewritten to public/app in
// next.config.mjs and cached for a year.
import { buildId, redirectTo, shellResponse, uiBase } from "@/lib/ui-shell";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ build: string }> }) {
  const { build } = await ctx.params;
  if (build !== buildId() || !new URL(req.url).pathname.endsWith("/")) return redirectTo(uiBase());
  return shellResponse();
}
