// Server sessions in MariaDB. Cookie holds a random id; the table stores only its sha256.
// Limits match PHP: 8 h idle, 24 h absolute.
// WHO may log in: the Employees tab or an admin approval, never when blocked (lib/auth/access.ts) — re-checked on every
// request, so removing someone from the Sheet (unless approved) or blocking them revokes access at once.
// WHICH role: the users row, managed by Admin (Quản trị → Người dùng). A first login always starts as viewer
// (least privilege); the Sheet's Role column only counts when no admin exists yet (bootstrap, e.g. a fresh database).
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "../db/client";
import { sessions, users } from "../db/schema";
import { env } from "../env";
import { fail, readCookie } from "../http";
import { stillAllowed } from "./access";
import { directory, type Employee } from "./directory";
import type { Role } from "./roles";

export const COOKIE = "mkv2_sid";
const IDLE_MS = 8 * 3600_000;
const ABS_MS = 24 * 3600_000;
const TOUCH_MS = 5 * 60_000;

export type CurrentUser = Employee & { csrf: string };

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function cookieHeader(value: string, maxAgeSec: number): string {
  const secure = env.appOrigin().startsWith("https://") ? "; Secure" : "";
  return `${COOKIE}=${value}; Path=${env.basePath}; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}

/** Role for someone logging in: their users row if they have one, otherwise viewer (bootstrap: no admin yet → Sheet role). */
async function roleOnLogin(emp: Employee): Promise<Role> {
  const [u] = await db().select({ role: users.role }).from(users).where(eq(users.email, emp.email)).limit(1);
  if (u) return u.role;
  const [a] = await db().select({ n: sql<number>`COUNT(*)` }).from(users).where(eq(users.role, "admin"));
  return Number(a?.n ?? 0) === 0 && emp.role === "admin" ? "admin" : "viewer";
}

export async function createSession(emp: Employee): Promise<{ cookie: string; csrf: string; role: Role }> {
  const id = randomBytes(32).toString("base64url");
  const csrf = randomBytes(32).toString("hex");
  const now = new Date();
  await db().insert(sessions).values({ idHash: sha256(id), email: emp.email, csrf, createdAt: now, lastSeenAt: now });
  // Never overwrite an existing role here: only Admin changes roles.
  await db()
    .insert(users)
    .values({ email: emp.email, name: emp.name || emp.email, role: await roleOnLogin(emp), lastLoginAt: now, createdAt: now })
    .onDuplicateKeyUpdate({ set: { name: emp.name || emp.email, lastLoginAt: now, status: "active" } }); // e.g. queued, then added to the Sheet
  const [u] = await db().select({ role: users.role }).from(users).where(eq(users.email, emp.email)).limit(1);
  // Housekeeping: drop expired rows of this user (cheap, indexed).
  await db()
    .delete(sessions)
    .where(and(eq(sessions.email, emp.email), lt(sessions.createdAt, new Date(now.getTime() - ABS_MS))));
  return { cookie: cookieHeader(id, Math.floor(ABS_MS / 1000)), csrf, role: u?.role ?? "viewer" };
}

export const clearCookie = () => cookieHeader("", 0);

export async function destroySession(req: Request): Promise<void> {
  const id = readCookie(req, COOKIE);
  if (id) await db().delete(sessions).where(eq(sessions.idHash, sha256(id)));
}

export async function currentUser(req: Request): Promise<CurrentUser | null> {
  const id = readCookie(req, COOKIE);
  if (!id || id.length > 100) return null;
  const hash = sha256(id);
  const [s] = await db()
    .select({ email: sessions.email, csrf: sessions.csrf, createdAt: sessions.createdAt, lastSeenAt: sessions.lastSeenAt, role: users.role, status: users.status, approvedAt: users.approvedAt, name: users.name })
    .from(sessions)
    .leftJoin(users, eq(users.email, sessions.email))
    .where(eq(sessions.idHash, hash))
    .limit(1);
  if (!s) return null;
  const now = Date.now();
  if (now - s.createdAt.getTime() > ABS_MS || now - s.lastSeenAt.getTime() > IDLE_MS) {
    await db().delete(sessions).where(eq(sessions.idHash, hash));
    return null;
  }
  const emp = s.status === "blocked" ? null : await directory().lookup(s.email);
  if (!stillAllowed(s, !!emp)) {
    await db().delete(sessions).where(eq(sessions.idHash, hash));
    return null;
  }
  if (now - s.lastSeenAt.getTime() > TOUCH_MS) {
    await db().update(sessions).set({ lastSeenAt: new Date(now) }).where(eq(sessions.idHash, hash));
  }
  return { email: s.email, name: emp?.name || s.name || s.email, role: s.role ?? "viewer", csrf: s.csrf };
}

export async function requireUser(req: Request): Promise<CurrentUser> {
  const u = await currentUser(req);
  if (!u) fail(401, "unauthenticated");
  return u as CurrentUser;
}

// Same-origin check against the configured origin (not the Host header, which a proxy may rewrite).
export function originCheck(req: Request): void {
  const want = env.appOrigin();
  if (!want) fail(500, "app_origin_missing");
  const origin = req.headers.get("origin");
  if (origin) {
    if (origin !== want) fail(403, "bad_origin");
    return;
  }
  const ref = req.headers.get("referer") || "";
  if (!(ref === want || ref.startsWith(want + "/"))) fail(403, "bad_origin");
}

export async function requireWrite(req: Request): Promise<CurrentUser> {
  originCheck(req);
  const u = await requireUser(req);
  const t = req.headers.get("x-csrf-token") || "";
  const a = Buffer.from(t);
  const b = Buffer.from(u.csrf);
  if (a.length !== b.length || !timingSafeEqual(a, b)) fail(403, "csrf_invalid");
  return u;
}
