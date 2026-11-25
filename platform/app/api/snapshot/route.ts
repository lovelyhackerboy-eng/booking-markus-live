// GET /v2/api/snapshot → everything the UI needs on load, already cut to the caller's role:
// user, team (names; e-mails only for roles that can edit), creators, campaigns (visible only), bookings.
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { can, PERMS } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { listBookings } from "@/lib/bookings/repo";
import { listCampaigns, visibleCampaignIds } from "@/lib/campaigns/repo";
import { loadCreators } from "@/lib/creators/repo";
import { handle, json } from "@/lib/http";
import { sheetWriteEnabled } from "@/lib/sheet/bridge";
import { getSyncSettings } from "@/lib/admin/sync-settings";
import { APP_VERSION, buildId } from "@/lib/admin/system";
import { getTutorialSettings } from "@/lib/admin/tutorial";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const u = await requireUser(req);
  const people = await db().select({ email: users.email, name: users.name, role: users.role }).from(users).where(eq(users.status, "active"));
  const pendingUsers = can(u.role, "admin") ? (await db().select({ n: sql<number>`COUNT(*)` }).from(users).where(eq(users.status, "pending")))[0]?.n ?? 0 : undefined;
  const names = new Map(people.map((p) => [p.email, p.name]));
  const [creators, campaigns, bookings] = await Promise.all([loadCreators(u.role, undefined, names, await visibleCampaignIds(u)), listCampaigns(u), listBookings(u, names)]);
  const team = people
    .filter((p) => p.role !== "viewer" || can(u.role, "edit"))
    .map((p) => (can(u.role, "edit") ? { name: p.name, email: p.email, role: p.role } : { name: p.name }));
  return json({
    ok: true,
    user: { email: u.email, name: u.name, role: u.role, perms: PERMS[u.role] },
    csrf: u.csrf,
    features: { sheetWrite: sheetWriteEnabled() },
    config: { clientRefreshMinutes: (await getSyncSettings()).clientRefreshMinutes, version: APP_VERSION, build: buildId(), tutorialReset: (await getTutorialSettings()).resetAt, pendingUsers: pendingUsers == null ? undefined : Number(pendingUsers) },
    team,
    creators,
    campaigns,
    bookings,
  });
});
