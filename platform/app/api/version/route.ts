// GET /v2/api/version → the build id being served (lets the deploy script confirm the new build is live).
import { readFileSync } from "node:fs";
import path from "node:path";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";
let build: string | null = null;

export async function GET() {
  if (build === null) {
    try {
      build = readFileSync(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim();
    } catch {
      build = "dev";
    }
  }
  return json({ ok: true, build });
}
