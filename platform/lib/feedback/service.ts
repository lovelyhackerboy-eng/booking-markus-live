// Feedback from the "Góp ý" button: stored server-side so admins can triage it (status + note).
// Everyone sends and sees their own; admins see and manage all.
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { auditLog, feedback, FEEDBACK_STATUS_VALUES } from "../db/schema";
import { can, type Role } from "../auth/roles";
import { fail } from "../http";

export const newFeedbackSchema = z.object({
  kind: z.enum(["bug", "ux", "feature", "data"]),
  prio: z.enum(["must", "should", "nice"]),
  doing: z.string().trim().min(1).max(2000),
  want: z.string().trim().min(1).max(4000),
  actual: z.string().trim().max(4000).optional(),
  screen: z.string().trim().max(120).optional(),
  route: z.string().trim().max(300).optional(),
  appVersion: z.string().trim().max(40).optional(),
});
export const adminFeedbackSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("update"), id: z.number().int().positive(), status: z.enum(FEEDBACK_STATUS_VALUES).optional(), adminNote: z.string().trim().max(4000).optional() }),
  z.object({ op: z.literal("remove"), id: z.number().int().positive() }),
]);

type U = { email: string; name: string; role: Role };
export async function addFeedback(u: U, f: z.infer<typeof newFeedbackSchema>) {
  const now = new Date();
  await db().insert(feedback).values({ createdAt: now, updatedAt: now, email: u.email, name: u.name, role: u.role, ...f, actual: f.actual || null });
}
export async function listFeedback(u: U, all: boolean) {
  const admin = can(u.role, "admin");
  const q = db().select().from(feedback);
  const rows = await (all && admin ? q : q.where(eq(feedback.email, u.email))).orderBy(desc(feedback.createdAt)).limit(500);
  return rows.map((r) => ({ ...r, email: admin ? r.email : undefined, updatedBy: admin ? r.updatedBy : undefined }));
}
export async function adminFeedback(u: U, op: z.infer<typeof adminFeedbackSchema>) {
  if (!can(u.role, "admin")) fail(403, "forbidden");
  const [row] = await db().select({ id: feedback.id }).from(feedback).where(eq(feedback.id, op.id)).limit(1);
  if (!row) fail(404, "not_found");
  const now = new Date();
  if (op.op === "remove") await db().delete(feedback).where(eq(feedback.id, op.id));
  else
    await db()
      .update(feedback)
      .set({ ...(op.status ? { status: op.status } : {}), ...(op.adminNote !== undefined ? { adminNote: op.adminNote || null } : {}), updatedAt: now, updatedBy: u.email })
      .where(eq(feedback.id, op.id));
  await db().insert(auditLog).values({ at: now, actorEmail: u.email, action: "feedback." + op.op, target: "feedback:" + op.id, after: op.op === "update" ? JSON.stringify({ status: op.status ?? null }) : null });
}
