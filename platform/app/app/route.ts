// GET /v2/app/ → the UI shell (public/app/index.html) with <base href="/v2/app/"> and the runtime config injected.
// The page carries no data: everything is loaded from /v2/api after the session check.
import { readFileSync } from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";
let shell: string | null = null;

export async function GET(req: Request) {
  if (!new URL(req.url).pathname.endsWith("/")) return new Response(null, { status: 308, headers: { location: "/v2/app/" } });
  if (shell === null || process.env.NODE_ENV !== "production") shell = readFileSync(path.join(process.cwd(), "public", "app", "index.html"), "utf8");
  const config = JSON.stringify({ api: "/v2/api", clientId: process.env.GOOGLE_CLIENT_ID || "" }).replace(/</g, "\u003c");
  const html = shell.replace("<head>", `<head>\n  <base href="/v2/app/" />\n  <script>window.MK_CONFIG = ${config};</script>`);
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-frame-options": "DENY", "referrer-policy": "same-origin", "x-content-type-options": "nosniff" },
  });
}
