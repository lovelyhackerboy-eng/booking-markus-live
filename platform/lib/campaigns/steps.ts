// Contact steps (bước 2 · Liên hệ) per campaign. A campaign without rows in campaign_steps uses DEFAULT_STEPS; the first
// edit materialises them. Exactly one step is `final` (= chốt booking); reports and the tracking phase rely on it.
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { campaignSteps } from "../db/schema";

export type Step = { key: string; label: string; position: number; final: boolean };

export const DEFAULT_STEPS: Step[] = [
  { key: "none", label: "Chưa liên hệ", position: 0, final: false },
  { key: "zalo", label: "Đã liên hệ qua Zalo", position: 1, final: false },
  { key: "manager", label: "Qua Manager / MCN", position: 2, final: false },
  { key: "quoted", label: "Đã báo giá", position: 3, final: false },
  { key: "closed", label: "Đã chốt", position: 4, final: true },
];

export async function stepsOf(campaignIds: string[]): Promise<Map<string, Step[]>> {
  const out = new Map<string, Step[]>();
  if (!campaignIds.length) return out;
  const rows = await db().select().from(campaignSteps).where(inArray(campaignSteps.campaignId, campaignIds)).orderBy(asc(campaignSteps.position));
  for (const id of campaignIds) {
    const own = rows.filter((r) => r.campaignId === id).map((r) => ({ key: r.key, label: r.label, position: r.position, final: !!r.final }));
    out.set(id, own.length ? own : DEFAULT_STEPS);
  }
  return out;
}

export async function stepsFor(campaignId: string): Promise<Step[]> {
  return (await stepsOf([campaignId])).get(campaignId) ?? DEFAULT_STEPS;
}

export const firstStep = (steps: Step[]) => steps[0]?.key ?? "none";
export const finalStep = (steps: Step[]) => steps.find((s) => s.final)?.key ?? steps[steps.length - 1]?.key ?? "closed";

export async function replaceSteps(campaignId: string, steps: Step[]) {
  await db().transaction(async (tx) => {
    await tx.delete(campaignSteps).where(eq(campaignSteps.campaignId, campaignId));
    await tx.insert(campaignSteps).values(steps.map((s, i) => ({ campaignId, key: s.key, label: s.label, position: i, final: s.final ? 1 : 0 })));
  });
}
