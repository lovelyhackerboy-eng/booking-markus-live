// Tutorial reset. A deploy does NOT send people back to the tutorial (25/11/2026: whoever has seen it is not made
// to see it again; a new version is announced only when it brings something for that user — see ui/core/tour.js).
// The only reset is the admin button "Đưa mọi người về hướng dẫn ngay": it stores resetAt, the snapshot sends it as
// config.tutorialReset, and each browser that has not seen that value yet shows the welcome dialog again.
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { auditLog, settings } from "../db/schema";

export const tutorialSettingsSchema = z.object({ resetAt: z.string().max(40).nullable() });
export type TutorialSettings = z.infer<typeof tutorialSettingsSchema>;
export const DEFAULT_TUTORIAL: TutorialSettings = { resetAt: null };

const KEY = "tutorial";
export async function getTutorialSettings(): Promise<TutorialSettings> {
  const [row] = await db().select().from(settings).where(eq(settings.key, KEY)).limit(1);
  if (!row) return DEFAULT_TUTORIAL;
  try {
    const p = tutorialSettingsSchema.partial().safeParse(JSON.parse(row.value)); // older rows also had resetOnDeploy (ignored)
    return { ...DEFAULT_TUTORIAL, ...(p.success ? p.data : {}) };
  } catch {
    return DEFAULT_TUTORIAL;
  }
}

export async function resetTutorialNow(actorEmail: string, now = new Date()) {
  const next: TutorialSettings = { resetAt: now.toISOString() };
  const value = JSON.stringify(next);
  await db().insert(settings).values({ key: KEY, value, updatedBy: actorEmail, updatedAt: now }).onDuplicateKeyUpdate({ set: { value, updatedBy: actorEmail, updatedAt: now } });
  await db().insert(auditLog).values({ at: now, actorEmail, action: "tutorial.reset", target: "settings:tutorial", after: value });
  return next;
}
