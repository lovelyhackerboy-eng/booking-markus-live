// Admin "Người dùng": the sign-in queue, active users and the block list.
// - pending: signed in with Google but not on the Employees tab → approve (with a role) or block.
// - active: may use the app (on the Sheet, or approved). Role changes here; block revokes at once.
// - blocked: refused at sign-in even if on the Sheet. "Bỏ chặn" puts them back in the queue (nothing is deleted).
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { auditLog, ROLE_VALUES, sessions, users } from "../db/schema";
import { fail } from "../http";
import type { Role } from "../auth/roles";

export const isRole = (r: unknown): r is Role => typeof r === "string" && (ROLE_VALUES as readonly string[]).includes(r);
export const USER_OPS = ["role", "approve", "block", "unblock"] as const;
export type UserOp = (typeof USER_OPS)[number];

export async function listUsers() {
  return db()
    .select({
      email: users.email, name: users.name, role: users.role, status: users.status, lastLoginAt: users.lastLoginAt, createdAt: users.createdAt,
      requestedAt: users.requestedAt, approvedAt: users.approvedAt, approvedBy: users.approvedBy, blockedAt: users.blockedAt, blockedBy: users.blockedBy,
    })
    .from(users)
    .orderBy(desc(sql`COALESCE(${users.requestedAt}, ${users.createdAt})`));
}

async function activeAdmins() {
  const [a] = await db().select({ n: sql<number>`COUNT(*)` }).from(users).where(and(eq(users.role, "admin"), eq(users.status, "active")));
  return Number(a?.n ?? 0);
}
async function audit(actorEmail: string, action: string, email: string, before: string, after: string) {
  await db().insert(auditLog).values({ at: new Date(), actorEmail, action, target: `user:${email}`, before, after });
}

export async function changeUser(actorEmail: string, op: UserOp, rawEmail: string, role?: Role) {
  const email = rawEmail.trim().toLowerCase();
  if (email === actorEmail.toLowerCase()) fail(409, "cannot_change_own_account");
  const [u] = await db().select().from(users).where(eq(users.email, email)).limit(1);
  if (!u) fail(404, "not_found");
  const now = new Date();
  const losesAdmin = u!.role === "admin" && u!.status === "active";
  switch (op) {
    case "role": {
      if (!role) fail(422, "bad_request");
      if (u!.status !== "active") fail(409, "not_active");
      if (u!.role === role) return;
      if (losesAdmin && role !== "admin" && (await activeAdmins()) <= 1) fail(409, "last_admin");
      await db().update(users).set({ role }).where(eq(users.email, email));
      return audit(actorEmail, "user.role", email, u!.role, role!);
    }
    case "approve": {
      if (!role) fail(422, "bad_request");
      if (u!.status === "active") fail(409, "already_active");
      await db().update(users).set({ status: "active", role, approvedAt: now, approvedBy: actorEmail, blockedAt: null, blockedBy: null }).where(eq(users.email, email));
      return audit(actorEmail, "user.approve", email, u!.status, `active:${role}`);
    }
    case "block": {
      if (u!.status === "blocked") return;
      if (losesAdmin && (await activeAdmins()) <= 1) fail(409, "last_admin");
      await db().update(users).set({ status: "blocked", blockedAt: now, blockedBy: actorEmail }).where(eq(users.email, email));
      await db().delete(sessions).where(eq(sessions.email, email)); // signed out everywhere, right now
      return audit(actorEmail, "user.block", email, u!.status, "blocked");
    }
    case "unblock": {
      if (u!.status !== "blocked") fail(409, "not_blocked");
      await db().update(users).set({ status: "pending", blockedAt: null, blockedBy: null, approvedAt: null, approvedBy: null }).where(eq(users.email, email));
      return audit(actorEmail, "user.unblock", email, "blocked", "pending");
    }
  }
}
