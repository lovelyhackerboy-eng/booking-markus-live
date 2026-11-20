// Booking reads. Amounts are `price`; evaluation notes are internal (`contact`). The campaign link is dropped when the
// caller cannot see that campaign, so a booking never reveals a hidden campaign's id.
import { desc } from "drizzle-orm";
import { db } from "../db/client";
import { bookings, campaigns } from "../db/schema";
import { can } from "../auth/roles";
import type { CurrentUser } from "../auth/session";
import { pick } from "../creators/serialize";
import { visibleWhere } from "../campaigns/repo";

type Booking = typeof bookings.$inferSelect;
type Cls = "public" | "price" | "contact" | "hidden";

export const BOOKING_FIELDS = {
  id: "public",
  creatorId: "public",
  campaignId: "public",
  brand: "public",
  campaignName: "public",
  platform: "public",
  sow: "public",
  quotedAmount: "price",
  closedAmount: "price",
  bookedOn: "public",
  deadline: "public",
  status: "public",
  contract: "contact",
  ownerEmail: "hidden",
  contentUrl: "public",
  views: "public",
  er: "public",
  score: "contact",
  evaluationNote: "contact",
  createdAt: "hidden",
  updatedAt: "public",
} as const satisfies Record<keyof Booking, Cls>;

export async function listBookings(u: Pick<CurrentUser, "email" | "role">, ownerNames: Map<string, string>) {
  const [rows, vis] = await Promise.all([
    db().select().from(bookings).orderBy(desc(bookings.bookedOn)),
    db().select({ id: campaigns.id }).from(campaigns).where(visibleWhere(u)),
  ]);
  const visible = new Set(vis.map((v) => v.id));
  return rows.map((b) => {
    const out: Record<string, unknown> = pick(b, BOOKING_FIELDS, u.role);
    // A booking made inside a campaign the caller cannot see must not reveal that campaign — neither its id nor
    // its name (bookings created from a campaign copy the campaign name).
    if (b.campaignId && !visible.has(b.campaignId)) {
      out.campaignId = null;
      out.campaignName = null;
    }
    out.owner = b.ownerEmail ? (ownerNames.get(b.ownerEmail) ?? null) : null;
    out.mine = b.ownerEmail === u.email;
    if (!can(u.role, "price")) {
      delete out.quotedAmount;
      delete out.closedAmount;
    }
    return out;
  });
}
