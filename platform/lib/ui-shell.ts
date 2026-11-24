// UI shell + build id. The UI (public/app, plain ES modules) is served under /v2/a/<build>/ so every deploy gets new
// URLs: browsers can cache files for a year and never run stale code. (Passenger/LiteSpeed serve public/ directly and
// ignore Next's headers(), so cache headers alone could not fix staleness.)
import { readFileSync } from "node:fs";
import path from "node:path";

let build: string | null = null;
let shell: string | null = null;
const prod = () => process.env.NODE_ENV === "production";

export function buildId(): string {
  if (build && prod()) return build;
  try {
    build = readFileSync(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim();
  } catch {
    build = "dev";
  }
  return build;
}

export const uiBase = () => `/v2/a/${buildId()}/`;

export function shellResponse(): Response {
  if (shell === null || !prod()) shell = readFileSync(path.join(process.cwd(), "public", "app", "index.html"), "utf8");
  const config = JSON.stringify({ api: "/v2/api", clientId: process.env.GOOGLE_CLIENT_ID || "", build: buildId() }).replace(/</g, "\\u003c");
  const html = shell.replace("<head>", `<head>\n  <base href="${uiBase()}" />\n  <script>window.MK_CONFIG = ${config};</script>`);
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-frame-options": "DENY", "referrer-policy": "same-origin", "x-content-type-options": "nosniff" },
  });
}

// Relative Location: behind Passenger req.url carries the internal host, never the public one.
export const redirectTo = (location: string, status = 307) => new Response(null, { status, headers: { location, "cache-control": "no-store" } });
