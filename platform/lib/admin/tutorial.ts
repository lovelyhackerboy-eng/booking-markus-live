// "Tutorial epoch": every browser keeps the epoch it last saw; when the server's epoch changes, the user's tutorial
// progress is reset and the welcome dialog opens again. The epoch changes on every deploy (new build id) unless the
// admin turned that off, and whenever the admin presses "Đưa mọi người về hướng dẫn ngay".
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { auditLog, settings } from "../db/schema";
import { buildId } from "./system";

export const tutorialSettingsSchema = z.object({
  resetOnDeploy: z.boolean(),
  resetAt: z.string().max(40).nullable(),
});
export type TutorialSettings = z.infer<typeof tutorialSettingsSchema>;
export const DEFAULT_TUTORIAL: TutorialSettings = { resetOnDeploy: true, resetAt: null };

const KEY = "tutorial";
export async function getTutorialSettings(): Promise<TutorialSettings> {
  const [row] = await db().select().from(settings).where(eq(settings.key, KEY)).limit(1);
  if (!row) return DEFAULT_TUTORIAL;
  try {
    const p = tutorialSettingsSchema.partial().safeParse(JSON.parse(row.value));
    return { ...DEFAULT_TUTORIAL, ...(p.success ? p.data : {}) };
  } catch {
    return DEFAULT_TUTORIAL;
  }
}

async function save(actorEmail: string, next: TutorialSettings, action: string) {
  const now = new Date();
  const value = JSON.stringify(next);
  await db().insert(settings).values({ key: KEY, value, updatedBy: actorEmail, updatedAt: now }).onDuplicateKeyUpdate({ set: { value, updatedBy: actorEmail, updatedAt: now } });
  await db().insert(auditLog).values({ at: now, actorEmail, action, target: "settings:tutorial", after: value });
  return next;
}

export async function setResetOnDeploy(actorEmail: string, resetOnDeploy: boolean) {
  return save(actorEmail, { ...(await getTutorialSettings()), resetOnDeploy }, "settings.tutorial");
}
export async function resetTutorialNow(actorEmail: string, now = new Date()) {
  return save(actorEmail, { ...(await getTutorialSettings()), resetAt: now.toISOString() }, "tutorial.reset");
}

export function tutorialEpoch(s: TutorialSettings, build = buildId()) {
  return `${s.resetOnDeploy ? build : "-"}|${s.resetAt ?? "-"}`;
}
