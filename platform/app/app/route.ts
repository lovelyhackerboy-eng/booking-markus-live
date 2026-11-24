// GET /v2/app/ (old address, bookmarks) → the current build's UI at /v2/a/<build>/. The #fragment is kept by the browser.
import { redirectTo, uiBase } from "@/lib/ui-shell";

export const dynamic = "force-dynamic";

export function GET() {
  return redirectTo(uiBase());
}
