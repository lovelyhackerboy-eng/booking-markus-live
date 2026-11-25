// Admin "Người dùng": who has logged in and with which role. Roles live here (users table), not on the Sheet:
// the Employees tab only decides who may log in. First login = viewer; Admin raises the role.
import { desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { auditLog, ROLE_VALUES, users } from "../db/schema";
import { fail } from "../http";
import type { Role } from "../auth/roles";

export const isRole = (r: unknown): r is Role => typeof r === "string" && (ROLE_VALUES as readonly string[]).includes(r);

export async function listUsers() {
  return db()
    .select({ email: users.email, name: users.name, role: users.role, lastLoginAt: users.lastLoginAt, createdAt: users.createdAt })
    .from(users)
    .orderBy(desc(users.createdAt));
}

export async function setUserRole(actorEmail: string, email: string, role: Role) {
  const target = email.trim().toLowerCase();
  if (target === actorEmail.toLowerCase()) fail(409, "cannot_change_own_role");
  const [u] = await db().select().from(users).where(eq(users.email, target)).limit(1);
  if (!u) fail(404, "not_found");
  if (u!.role === role) return u!;
  if (u!.role === "admin" && role !== "admin") {
    const [a] = await db().select({ n: sql<number>`COUNT(*)` }).from(users).where(eq(users.role, "admin"));
    if (Number(a?.n ?? 0) <= 1) fail(409, "last_admin");
  }
  await db().update(users).set({ role }).where(eq(users.email, target));
  await db().insert(auditLog).values({ at: new Date(), actorEmail, action: "user.role", target: `user:${target}`, before: u!.role, after: role });
  return { ...u!, role };
}
