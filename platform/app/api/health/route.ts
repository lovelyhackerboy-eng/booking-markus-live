// GET /v2/api/health — public: { ok, db.ok }. Runtime detail (Node, memory, MariaDB version) only for admins.
import { can } from "@/lib/auth/roles";
import { currentUser } from "@/lib/auth/session";
import { pool } from "@/lib/db/client";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  let version: string | undefined;
  let dbOk = false;
  try {
    const [rows] = await pool().query("SELECT VERSION() AS v");
    version = (rows as { v: string }[])[0]?.v;
    dbOk = true;
  } catch {
    dbOk = false;
  }
  let admin = false;
  if (dbOk) {
    try {
      const u = await currentUser(req);
      admin = !!u && can(u.role, "admin");
    } catch {
      admin = false;
    }
  }
  if (!admin) return json({ ok: dbOk, db: { ok: dbOk } }, { status: dbOk ? 200 : 503 });
  const mem = process.memoryUsage();
  return json({
    ok: dbOk,
    node: process.version,
    rssMB: Math.round(mem.rss / 1048576),
    heapMB: Math.round(mem.heapUsed / 1048576),
    db: { ok: dbOk, version },
  });
}
