// GET /v2 → the current build's UI.
import { redirectTo, uiBase } from "@/lib/ui-shell";

export const dynamic = "force-dynamic";

export function GET() {
  return redirectTo(uiBase());
}
