// Edit / add creators by writing the Google Sheet FIRST (it stays master), then re-importing it into the DB.
// Safety, in order:
//   1. per-field permission (price fields need `price`, contact/internal fields need `contact`, all need `edit`)
//   2. the Sheet row still belongs to this creator (name + channel links match the DB) — else re-import and retry once
//   3. every target cell still holds what the DB last imported (normalised through the importer's own parsers) —
//      else 409 conflict: someone changed it on the Sheet; nothing is overwritten
//   4. the PHP bridge re-checks the row and the exact raw values under the old app's write lock before writing RAW
// Creator_Name and channel links are not editable: the old app binds creator identity through them.
import { eq } from "drizzle-orm";
import { z } from "zod";
import { can, type Role } from "../auth/roles";
import type { CurrentUser } from "../auth/session";
import { db } from "../db/client";
import { auditLog, channels, contacts, creators, rates } from "../db/schema";
import { fail } from "../http";
import { heroOf, parseCount, validUrl } from "../import/sheet";
import { refreshFromSheet, sheetWrite } from "../sheet/bridge";

type Cls = "public" | "price" | "contact";
type Kind = "text" | "count" | "year" | "hero" | "price";
type Field = { col: string; cls: Cls; kind: Kind; options?: readonly string[] };

export const TIER_OPTIONS = ["Nano", "Micro", "Mid-Tier", "Macro", "Celeb"] as const;
export const REL_OPTIONS = ["Đã hợp tác", "Đã báo giá", "Chưa liên hệ"] as const;
const LINK_COLS: Record<string, string> = { tiktok: "TikTok", facebook: "Facebook", instagram: "Instagram", youtube: "Youtube", threads: "Threads" };
const HERO_LABEL: Record<string, string> = { tiktok: "TikTok", facebook: "Facebook", instagram: "Instagram", youtube: "YouTube", threads: "Threads" };

export const FIELDS: Record<string, Field> = {
  tier: { col: "Tier", cls: "public", kind: "text", options: TIER_OPTIONS },
  primaryCategory: { col: "Primary_Category", cls: "public", kind: "text" },
  secondaryCategory: { col: "Secondary_Category", cls: "public", kind: "text" },
  creatorType: { col: "Creator_Type", cls: "public", kind: "text" },
  castingProfile: { col: "Casting_Profile", cls: "public", kind: "text" },
  yearOfBirth: { col: "Year_Of_Birth", cls: "public", kind: "year" },
  baseLocation: { col: "Base_Location", cls: "public", kind: "text" },
  representation: { col: "Representation", cls: "public", kind: "text" },
  heroPlatform: { col: "Hero_Platform", cls: "public", kind: "hero" },
  "followers.tiktok": { col: "Sub_TikTok", cls: "public", kind: "count" },
  "followers.facebook": { col: "Sub_Facebook", cls: "public", kind: "count" },
  "followers.instagram": { col: "Sub_IG", cls: "public", kind: "count" },
  "followers.youtube": { col: "Sub_Youtube", cls: "public", kind: "count" },
  relationshipStatus: { col: "Relationship_Status", cls: "contact", kind: "text", options: REL_OPTIONS },
  note: { col: "Note", cls: "contact", kind: "text" },
  contactPerson: { col: "Contact_Person", cls: "contact", kind: "text" },
  contactChannel: { col: "Contact_Channel", cls: "contact", kind: "text" },
  contactDetail: { col: "Contact_Detail", cls: "contact", kind: "text" },
  companyEmail: { col: "Company_Email", cls: "contact", kind: "text" },
  companyPhone: { col: "Company_Phone", cls: "contact", kind: "text" },
  companyWebsite: { col: "Company_Website", cls: "contact", kind: "text" },
  personalEmail: { col: "Personal_Email", cls: "contact", kind: "text" },
  personalPhone: { col: "Personal_Phone", cls: "contact", kind: "text" },
  "rate.photo": { col: "Photo Post", cls: "price", kind: "price" },
  "rate.video": { col: "Video Post", cls: "price", kind: "price" },
  "rate.event": { col: "Tham gia sự kiện", cls: "price", kind: "price" },
  "rate.brandvideo": { col: "Tham gia video của nhãn hàng", cls: "price", kind: "price" },
  "rate.live": { col: "Livestream", cls: "price", kind: "price" },
};

const mayEdit = (f: Field, role: Role) => can(role, "edit") && (f.cls === "public" || can(role, f.cls));

// Same normalisation as the importer (lib/import/sheet.ts), so "unchanged on the Sheet" means "equal to the DB".
const cleanText = (v: unknown, max = 5000) => {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
};
const yearOf = (v: unknown) => {
  const n = Number(String(v ?? "").trim());
  return Number.isInteger(n) && n >= 1930 && n <= 2020 ? n : null;
};
function sheetNorm(f: Field, cell: string): string | number | null {
  if (f.kind === "count") return parseCount(cell);
  if (f.kind === "year") return yearOf(cell);
  if (f.kind === "hero") return heroOf(cell);
  return cleanText(cell, f.kind === "price" ? 2000 : 5000);
}

// URL identity, like PHP sh_norm_url (lower-case, no scheme/www, no query except facebook profile.php?id=, no slash).
export function normUrl(u: string | null | undefined): string {
  let s = String(u ?? "").trim().toLowerCase();
  if (!s) return "";
  s = s.replace(/^https?:\/\/(www\.)?/, "").replace(/#.*$/, "");
  let q = "";
  const qi = s.indexOf("?");
  if (qi >= 0) {
    const query = s.slice(qi + 1);
    s = s.slice(0, qi);
    const m = query.match(/(?:^|&)id=(\d+)(?:&|$)/);
    if (/\/profile\.php\/?$/.test(s) && m) q = "?id=" + m[1];
  }
  return s.replace(/\/+$/, "") + q;
}

type Loaded = {
  c: typeof creators.$inferSelect;
  ch: (typeof channels.$inferSelect)[];
  rt: (typeof rates.$inferSelect)[];
  ct: typeof contacts.$inferSelect | null;
};
async function load(id: string): Promise<Loaded> {
  const [c] = await db().select().from(creators).where(eq(creators.id, id)).limit(1);
  if (!c || c.deletedAt) fail(404, "not_found");
  const [ch, rt, ct] = await Promise.all([
    db().select().from(channels).where(eq(channels.creatorId, id)),
    db().select().from(rates).where(eq(rates.creatorId, id)),
    db().select().from(contacts).where(eq(contacts.creatorId, id)),
  ]);
  return { c: c!, ch, rt, ct: ct[0] ?? null };
}
function dbValue(L: Loaded, key: string): string | number | null {
  if (key.startsWith("followers.")) return L.ch.find((x) => x.platform === key.slice(10))?.followers ?? null;
  if (key.startsWith("rate.")) return L.rt.find((x) => x.sow === key.slice(5))?.amountText ?? null;
  if (key in (L.ct ?? {}) && key !== "creatorId" && key !== "updatedAt") return ((L.ct as Record<string, unknown>)[key] as string | null) ?? null;
  if (["contactPerson", "contactChannel", "contactDetail", "companyEmail", "companyPhone", "companyWebsite", "personalEmail", "personalPhone"].includes(key)) return null;
  return ((L.c as Record<string, unknown>)[key] as string | number | null) ?? null;
}

// New value → { cell sent to the Sheet, normalised value for audit }.
const valueSchema = z.union([z.string().max(2000), z.number(), z.null()]);
function toCell(f: Field, key: string, v: unknown): string | number {
  const r = valueSchema.safeParse(v);
  if (!r.success) fail(422, "bad_value");
  const raw = r.data;
  if (raw === null || raw === "") return "";
  if (f.kind === "count") {
    const n = typeof raw === "number" ? raw : parseCount(raw);
    if (n == null || n < 0 || n > 1e11) fail(422, "bad_value");
    return Math.round(n as number);
  }
  if (f.kind === "year") {
    const n = yearOf(raw);
    if (n == null) fail(422, "bad_value");
    return n as number;
  }
  if (f.kind === "hero") {
    const p = heroOf(raw);
    if (!p) fail(422, "bad_value");
    return HERO_LABEL[p as string];
  }
  const s = String(raw).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "").trim();
  if (f.options && s && !f.options.includes(s)) fail(422, "bad_value");
  if (key.endsWith("Email") && s && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) fail(422, "bad_email");
  return s;
}

type Actor = Pick<CurrentUser, "email" | "name" | "role">;
export type EditResult = { ok: true; changed: string[] } | { ok: false; error: string; conflicts?: { field: string; sheet: string }[] };

export async function editCreator(actor: Actor, id: string, changes: Record<string, unknown>): Promise<EditResult> {
  const keys = Object.keys(changes);
  if (!keys.length || keys.length > 40) fail(422, "bad_request");
  for (const k of keys) {
    const f = FIELDS[k];
    if (!f) fail(422, "unknown_field");
    if (!mayEdit(f, actor.role)) fail(403, "forbidden");
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    const L = await load(id);
    if (L.c.source !== "sheet" || !L.c.sheetRow) fail(409, "not_on_sheet");
    const rd = await sheetWrite({ op: "read", row: L.c.sheetRow });
    if (!rd.ok) fail(502, String(rd.error || "sheet_read_failed"));
    const header = rd.header as string[];
    const values = rd.values as string[];
    const links = (rd.links ?? {}) as Record<string, string | null>;
    // 2. is this row still this creator?
    const nameCol = header.indexOf("Creator_Name");
    const sheetUrls = Object.entries(LINK_COLS).map(([p, col]) => normUrl(validUrl(links[p]) ?? validUrl(values[header.indexOf(col)]))).filter(Boolean).sort();
    const dbUrls = L.ch.map((x) => normUrl(x.url)).filter(Boolean).sort();
    const same = cleanText(values[nameCol]) === cleanText(L.c.name) && JSON.stringify(sheetUrls) === JSON.stringify(dbUrls);
    if (!same) {
      if (attempt === 0) { await refreshFromSheet(); continue; }
      return { ok: false, error: "row_moved" };
    }
    // 3. unchanged since the last import?
    const expect: Record<string, string> = {};
    const set: Record<string, string | number> = {};
    const conflicts: { field: string; sheet: string }[] = [];
    const before: Record<string, unknown> = {};
    for (const k of keys) {
      const f = FIELDS[k];
      const i = header.indexOf(f.col);
      if (i < 0) fail(409, "sheet_layout_changed");
      const cell = values[i] ?? "";
      const dbv = dbValue(L, k);
      const sv = sheetNorm(f, cell);
      // Year_Of_Birth empty on the Sheet while the DB derived the year from Age → not a conflict.
      const derivedYear = f.kind === "year" && sv === null;
      if (!derivedYear && sv !== (dbv ?? null)) conflicts.push({ field: k, sheet: cell });
      expect[f.col] = cell;
      set[f.col] = toCell(f, k, changes[k]);
      before[k] = dbv;
    }
    if (conflicts.length) {
      await refreshFromSheet(); // pull the newer Sheet values into the DB so the user sees them
      return { ok: false, error: "conflict", conflicts };
    }
    const w = await sheetWrite({ op: "update", row: L.c.sheetRow, name: values[nameCol], expect, set });
    if (!w.ok) {
      if (w.error === "row_moved" && attempt === 0) { await refreshFromSheet(); continue; }
      if (w.error === "conflict") { await refreshFromSheet(); return { ok: false, error: "conflict", conflicts: ((w.conflicts as { column: string; current: string }[]) ?? []).map((x) => ({ field: x.column, sheet: x.current })) }; }
      return { ok: false, error: String(w.error) };
    }
    await db().insert(auditLog).values({ at: new Date(), actorEmail: actor.email, action: "creator.sheet_edit", target: "creator:" + id, before: JSON.stringify(before), after: JSON.stringify(set) });
    await refreshFromSheet();
    return { ok: true, changed: keys };
  }
  return { ok: false, error: "row_moved" };
}

export const createSchema = z.object({
  name: z.string().trim().min(1).max(190).refine((s) => !/[\r\n]/.test(s)),
  links: z.partialRecord(z.enum(["tiktok", "facebook", "instagram", "youtube", "threads"]), z.string().trim().max(1024)), // only the links given
  labels: z.record(z.string(), z.string().max(190)).optional(),
  fields: z.record(z.string(), z.unknown()).optional().default({}),
});

export async function createCreator(actor: Actor, input: z.infer<typeof createSchema>) {
  if (!can(actor.role, "edit")) fail(403, "forbidden");
  const links: Record<string, string> = {};
  for (const [p, u] of Object.entries(input.links)) if (u) {
    if (!validUrl(u)) fail(422, "bad_link");
    links[p] = u;
  }
  if (!Object.keys(links).length) fail(422, "link_required");
  const values: Record<string, string | number> = { Creator_Name: input.name };
  for (const [k, v] of Object.entries(input.fields)) {
    const f = FIELDS[k];
    if (!f) fail(422, "unknown_field");
    if (!mayEdit(f, actor.role)) fail(403, "forbidden");
    const cell = toCell(f, k, v);
    if (cell !== "") values[f.col] = cell;
  }
  const w = await sheetWrite({ op: "create", values, links, labels: input.labels ?? {} });
  if (!w.ok) return { ok: false as const, error: String(w.error), row: w.row as number | undefined, existing: w.name as string | undefined };
  const row = Number(w.row);
  await db().insert(auditLog).values({ at: new Date(), actorEmail: actor.email, action: "creator.sheet_create", target: "sheet_row:" + row, after: JSON.stringify({ name: input.name, links: Object.keys(links) }) });
  const summary = await refreshFromSheet();
  const [c] = await db().select({ id: creators.id, name: creators.name }).from(creators).where(eq(creators.sheetRow, row)).limit(1);
  const id = c && cleanText(c.name) === cleanText(input.name) ? c.id : null;
  return { ok: true as const, id, row, quarantined: summary.skipped };
}
