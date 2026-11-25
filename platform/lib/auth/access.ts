// Who may enter, decided at Google sign-in:
//   1. users.status = blocked              → refused (admin pressed "Chặn"; the Sheet does not override it)
//   2. on the Employees tab of the Sheet   → in
//   3. approved by an admin (approvedAt)   → in
//   4. anyone else with a verified Google e-mail → queued (status = pending) for an admin to approve or block.
// The queue is capped so a flood of sign-ins cannot grow the table without bound.
import { eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { users } from "../db/schema";
import { fail } from "../http";
import { directory, type Employee } from "./directory";

export const PENDING_CAP = 300;
export type Access = { kind: "allow"; emp: Employee } | { kind: "pending" } | { kind: "blocked" };

export async function accessOnLogin(claims: { email: string; name?: string }, now = new Date()): Promise<Access> {
  const email = claims.email.trim().toLowerCase();
  const [u] = await db().select().from(users).where(eq(users.email, email)).limit(1);
  if (u?.status === "blocked") return { kind: "blocked" };
  const emp = await directory().lookup(email, true);
  if (emp) return { kind: "allow", emp };
  if (u && u.status === "active" && u.approvedAt) return { kind: "allow", emp: { email, name: u.name, role: u.role } };
  // Stranger (or someone removed from the Sheet without an approval): join / stay in the queue.
  if (!u || u.status !== "pending") {
    const [p] = await db().select({ n: sql<number>`COUNT(*)` }).from(users).where(eq(users.status, "pending"));
    if (Number(p?.n ?? 0) >= PENDING_CAP) fail(429, "queue_full");
  }
  const name = (claims.name || u?.name || email).slice(0, 120);
  await db()
    .insert(users)
    .values({ email, name, role: "viewer", status: "pending", requestedAt: now, createdAt: now })
    .onDuplicateKeyUpdate({ set: { status: "pending", requestedAt: now, name } });
  return { kind: "pending" };
}

/** Per request: still allowed? (blocked → no; otherwise on the Sheet or approved). */
export function stillAllowed(row: { status: string | null; approvedAt: Date | null } | null, onSheet: boolean): boolean {
  if (row?.status === "blocked") return false;
  return onSheet || (row?.status === "active" && !!row.approvedAt);
}
