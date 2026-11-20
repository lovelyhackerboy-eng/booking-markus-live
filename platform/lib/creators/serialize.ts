// The ONLY place creator data is shaped for the client. Every column has a class; a column is sent only when the
// caller holds the matching permission. Adding a column to the schema without classifying it fails typecheck
// (`satisfies Record<keyof …>`), and an unknown class is never sent.
import type { channels, contacts, creators, notes, rates } from "../db/schema";
import { can, type Role } from "../auth/roles";

type Cls = "public" | "price" | "contact" | "hidden";
type Creator = typeof creators.$inferSelect;
type Channel = typeof channels.$inferSelect;
type Rate = typeof rates.$inferSelect;
type Contact = typeof contacts.$inferSelect;
type Note = typeof notes.$inferSelect;

// `contact` = internal working data: contact details AND free text / relationship judgements, which in practice
// carry phone numbers, prices and opinions about the creator. Viewers (external guests) never get it.
export const CREATOR_FIELDS = {
  id: "public",
  sheetRow: "hidden",
  name: "public",
  alias: "public",
  tier: "public",
  primaryCategory: "public",
  secondaryCategory: "public",
  creatorType: "public",
  castingProfile: "public",
  gender: "public",
  yearOfBirth: "public",
  ageBand: "public",
  baseLocation: "public",
  representation: "public",
  heroPlatform: "public",
  relationshipStatus: "contact",
  ownerEmail: "contact",
  note: "contact",
  source: "hidden",
  syncedAt: "public",
  createdAt: "hidden",
  updatedAt: "public",
  deletedAt: "hidden",
} as const satisfies Record<keyof Creator, Cls>;

export const CHANNEL_FIELDS = {
  creatorId: "hidden",
  platform: "public",
  url: "public",
  label: "public",
  followers: "public",
  followersSource: "public",
  followersUpdatedAt: "public",
} as const satisfies Record<keyof Channel, Cls>;

export const RATE_FIELDS = {
  creatorId: "hidden",
  sow: "price",
  platform: "price",
  amount: "price",
  amountText: "price",
  terms: "price",
  source: "price",
  updatedAt: "price",
} as const satisfies Record<keyof Rate, Cls>;

export const CONTACT_FIELDS = {
  creatorId: "hidden",
  contactPerson: "contact",
  contactChannel: "contact",
  contactDetail: "contact",
  companyEmail: "contact",
  companyPhone: "contact",
  companyWebsite: "contact",
  personalEmail: "contact",
  personalPhone: "contact",
  updatedAt: "contact",
} as const satisfies Record<keyof Contact, Cls>;

export const NOTE_FIELDS = {
  id: "contact",
  creatorId: "hidden",
  authorEmail: "hidden",
  authorName: "contact",
  body: "contact",
  kind: "contact",
  campaignId: "hidden",
  createdAt: "contact",
} as const satisfies Record<keyof Note, Cls>;

const allowed = (cls: Cls, role: Role) =>
  cls === "public" || (cls === "price" && can(role, "price")) || (cls === "contact" && can(role, "contact"));

export function pick<T extends Record<string, unknown>>(row: T, map: Record<keyof T, Cls>, role: Role): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(map) as (keyof T)[]) if (allowed(map[k], role)) out[k] = row[k];
  return out;
}

export type CreatorParts = {
  creator: Creator;
  channels: Channel[];
  rates?: Rate[];
  contact?: Contact | null;
  notes?: Note[];
};

export function serializeCreator(p: CreatorParts, role: Role) {
  const out: Record<string, unknown> = pick(p.creator, CREATOR_FIELDS, role);
  out.channels = Object.fromEntries(p.channels.map((c) => [c.platform, pick(c, CHANNEL_FIELDS, role)]));
  if (can(role, "price")) out.rates = (p.rates ?? []).map((r) => pick(r, RATE_FIELDS, role));
  if (can(role, "contact")) {
    out.contact = p.contact ? pick(p.contact, CONTACT_FIELDS, role) : null;
    out.notes = (p.notes ?? []).map((n) => pick(n, NOTE_FIELDS, role));
  }
  return out;
}
