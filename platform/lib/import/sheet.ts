// CREATOR_DB (Sheet) snapshot → creator records. Pure functions: no I/O, so they are unit-tested with fake rows.
// Input = the payload of the PHP bridge (bridge/sheet-export.php): header, rows, links, uids (same uids as the old app).
import type { PLATFORM_VALUES, SOW_VALUES } from "../db/schema";

type Platform = (typeof PLATFORM_VALUES)[number];
type Sow = (typeof SOW_VALUES)[number];

export type SheetPayload = {
  header: string[];
  rows: string[][];
  links: Partial<Record<string, string | null>>[];
  uids: (string | null)[];
  statuses?: (string | null)[]; // reconcile status/reason per row from the bridge ("bound", "new", "quarantine:shared_url", …)
  deleted?: boolean[]; // creator deleted in the old app
  updatedAt?: string;
};

// Header text → key: lower-case, Vietnamese diacritics removed, only a-z0-9 ("Tham gia sự kiện" → "thamgiasukien").
export const headerKey = (h: string) =>
  String(h ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

export const COLUMNS = {
  name: "creatorname",
  tier: "tier",
  primaryCategory: "primarycategory",
  secondaryCategory: "secondarycategory",
  creatorType: "creatortype",
  castingProfile: "castingprofile",
  yearOfBirth: "yearofbirth",
  age: "age",
  baseLocation: "baselocation",
  ageBand: "ageband",
  representation: "representation",
  contactPerson: "contactperson",
  contactChannel: "contactchannel",
  contactDetail: "contactdetail",
  companyEmail: "companyemail",
  companyPhone: "companyphone",
  companyWebsite: "companywebsite",
  personalEmail: "personalemail",
  personalPhone: "personalphone",
  note: "note",
  heroPlatform: "heroplatform",
  tiktok: "tiktok",
  subTiktok: "subtiktok",
  facebook: "facebook",
  subFacebook: "subfacebook",
  instagram: "instagram",
  subInstagram: "subig",
  youtube: "youtube",
  subYoutube: "subyoutube",
  threads: "threads",
  relationshipStatus: "relationshipstatus",
  photo: "photopost",
  video: "videopost",
  event: "thamgiasukien",
  brandvideo: "thamgiavideocuanhanhang",
  live: "livestream",
} as const;
type Col = keyof typeof COLUMNS;

// Missing any of these → abort the import (the Sheet layout changed).
export const REQUIRED: Col[] = [
  "name", "tier", "tiktok", "subTiktok", "facebook", "subFacebook", "instagram", "subInstagram",
  "youtube", "subYoutube", "photo", "video", "live", "contactDetail", "heroPlatform",
];

export function columnIndex(header: string[]): { idx: Partial<Record<Col, number>>; missing: Col[] } {
  const pos = new Map<string, number>();
  header.forEach((h, i) => {
    const k = headerKey(h);
    if (k && !pos.has(k)) pos.set(k, i);
  });
  const idx: Partial<Record<Col, number>> = {};
  for (const [col, key] of Object.entries(COLUMNS) as [Col, string][]) {
    const i = pos.get(key);
    if (i !== undefined) idx[col] = i;
  }
  return { idx, missing: REQUIRED.filter((c) => idx[c] === undefined) };
}

const clean = (v: unknown, max = 190): string | null => {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
};

// "86,000" "86.000" "86K" "1,2M" "1.2tr" "320 N" → integer. Unknown text → null.
export function parseCount(raw: unknown): number | null {
  let s = String(raw ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  let mult = 1;
  const short = s.match(/^(\d+)(k|m)(\d)$/); // "1m2" = 1.2M, "8k5" = 8.5K
  if (short) return Math.round(Number(`${short[1]}.${short[3]}`) * (short[2] === "k" ? 1e3 : 1e6));
  const m = s.match(/^([0-9][0-9.,]*)(k|n|nghìn|ngàn|m|tr|triệu|trieu|b|tỷ|ty)?\+?$/);
  if (!m) return null;
  s = m[1];
  const suf = m[2];
  if (suf === "k" || suf === "n" || suf === "nghìn" || suf === "ngàn") mult = 1e3;
  else if (suf === "m" || suf === "tr" || suf === "triệu" || suf === "trieu") mult = 1e6;
  else if (suf === "b" || suf === "tỷ" || suf === "ty") mult = 1e9;
  let n: number;
  if (mult === 1) n = Number(s.replace(/[.,]/g, "")); // thousands separators
  else {
    // with a suffix the separator is a decimal point: "1,2M" = 1.2M; "1.250K" is read as 1250K
    const parts = s.split(/[.,]/);
    n = parts.length === 2 && parts[1].length <= 2 ? Number(parts[0] + "." + parts[1]) : Number(s.replace(/[.,]/g, ""));
  }
  if (!Number.isFinite(n)) return null;
  return Math.round(n * mult);
}

// Price cells in CREATOR_DB are free text: "1 video tiktok: 12,000,000", "2 video + đăng FB: 15tr | 3 video: 20tr",
// "Thương lượng". The raw text is always kept; `amount` = the LOWEST money figure in the cell (a "from" price for sorting
// and filtering), or null when there is none. A money figure is ≥ 100.000 VND after its unit (k/tr/triệu/m/củ).
const MONEY = /(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(k|nghìn|ngàn|tr|triệu|trieu|củ|cu|m)?(?![a-zà-ỹ])/gi;
export function parsePrice(raw: unknown): { amount: number | null; text: string | null } {
  const text = clean(raw, 2000);
  if (!text) return { amount: null, text: null };
  const found: number[] = [];
  for (const m of text.toLowerCase().matchAll(MONEY)) {
    const unit = m[2];
    const num = m[1];
    let v: number;
    if (!unit) v = Number(num.replace(/[.,]/g, ""));
    else {
      const parts = num.split(/[.,]/);
      const base = parts.length === 2 && parts[1].length <= 2 ? Number(parts[0] + "." + parts[1]) : Number(num.replace(/[.,]/g, ""));
      v = base * (unit === "k" || unit === "nghìn" || unit === "ngàn" ? 1e3 : 1e6);
    }
    if (Number.isFinite(v) && v >= 1e5 && v < 1e11) found.push(Math.round(v));
  }
  return { amount: found.length ? Math.min(...found) : null, text };
}

export function heroOf(raw: unknown): Platform | null {
  const s = String(raw ?? "").toLowerCase();
  if (s.includes("tik")) return "tiktok";
  if (s.includes("face") || s === "fb") return "facebook";
  if (s.includes("insta") || s === "ig") return "instagram";
  if (s.includes("you") || s === "yt") return "youtube";
  if (s.includes("thread")) return "threads";
  return null;
}

export function validUrl(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!/^https?:\/\/[^\s/]+\.[^\s/]+\/\S+/i.test(s) || s.length > 1024) return null;
  return s;
}

const yob = (raw: unknown): number | null => {
  const n = Number(String(raw ?? "").trim());
  return Number.isInteger(n) && n >= 1930 && n <= 2020 ? n : null;
};
// Year_Of_Birth is mostly empty on the Sheet while Age is filled: derive the year from Age (as of the import year).
const yobFromAge = (raw: unknown, now = new Date()): number | null => {
  const a = Number(String(raw ?? "").trim());
  return Number.isInteger(a) && a >= 10 && a <= 90 ? now.getFullYear() - a : null;
};

export type CreatorRecord = {
  id: string;
  sheetRow: number;
  creator: {
    name: string; tier: string | null; primaryCategory: string | null; secondaryCategory: string | null;
    creatorType: string | null; castingProfile: string | null; yearOfBirth: number | null; ageBand: string | null;
    baseLocation: string | null; representation: string | null; heroPlatform: Platform | null;
    relationshipStatus: string | null; note: string | null;
  };
  channels: { platform: Platform; url: string | null; label: string | null; followers: number | null }[];
  rates: { sow: Sow; amount: number | null; amountText: string }[];
  contact: {
    contactPerson: string | null; contactChannel: string | null; contactDetail: string | null;
    companyEmail: string | null; companyPhone: string | null; companyWebsite: string | null;
    personalEmail: string | null; personalPhone: string | null;
  };
};

export type BuildResult = {
  records: CreatorRecord[];
  deletedIds: string[];
  skipped: Record<string, number>;
  rowsRead: number;
};

const SHEET_FIRST_DATA_ROW = 4; // header is sheet row 3

const CHANNELS: [Platform, Col, Col | null][] = [
  ["tiktok", "tiktok", "subTiktok"],
  ["facebook", "facebook", "subFacebook"],
  ["instagram", "instagram", "subInstagram"],
  ["youtube", "youtube", "subYoutube"],
  ["threads", "threads", null],
];
const SOWS: [Sow, Col][] = [["photo", "photo"], ["video", "video"], ["event", "event"], ["brandvideo", "brandvideo"], ["live", "live"]];

export function buildRecords(p: SheetPayload): BuildResult {
  const { idx, missing } = columnIndex(p.header);
  if (missing.length) throw new Error(`sheet_layout_changed: missing ${missing.join(",")}`);
  const cell = (row: string[], c: Col) => (idx[c] === undefined ? "" : row[idx[c] as number] ?? "");
  const skipped: Record<string, number> = {};
  const skip = (why: string) => (skipped[why] = (skipped[why] ?? 0) + 1);
  const records: CreatorRecord[] = [];
  const deletedIds: string[] = [];
  const seen = new Set<string>();

  p.rows.forEach((row, i) => {
    const uid = p.uids[i] ?? null;
    const status = p.statuses?.[i] ?? null;
    if (uid && p.deleted?.[i]) {
      deletedIds.push(uid);
      return;
    }
    const name = clean(cell(row, "name"));
    if (!uid) {
      if (!name) return; // blank row (often only an STT number), not counted
      skip(status && status.startsWith("quarantine") ? status : "no_uid");
      return;
    }
    if (!name) return void skip("no_name");
    if (!/^cr_[0-9a-f]{16}$/.test(uid)) return void skip("bad_uid");
    if (seen.has(uid)) return void skip("duplicate_uid");
    seen.add(uid);
    const links = p.links[i] ?? {};
    const channels = CHANNELS.map(([platform, col, sub]) => {
      const label = clean(cell(row, col));
      const url = validUrl(links[platform]) ?? validUrl(cell(row, col));
      const followers = sub ? parseCount(cell(row, sub)) : null;
      return { platform, url, label, followers };
    }).filter((c) => c.url || c.label || c.followers);
    const rates = SOWS.flatMap(([sow, col]) => {
      const { amount, text } = parsePrice(cell(row, col));
      return text ? [{ sow, amount, amountText: text }] : [];
    });
    records.push({
      id: uid,
      sheetRow: SHEET_FIRST_DATA_ROW + i,
      creator: {
        name,
        tier: clean(cell(row, "tier"), 20),
        primaryCategory: clean(cell(row, "primaryCategory"), 80),
        secondaryCategory: clean(cell(row, "secondaryCategory"), 80),
        creatorType: clean(cell(row, "creatorType"), 80),
        castingProfile: clean(cell(row, "castingProfile")),
        yearOfBirth: yob(cell(row, "yearOfBirth")) ?? yobFromAge(cell(row, "age")),
        ageBand: clean(cell(row, "ageBand"), 20),
        baseLocation: clean(cell(row, "baseLocation"), 120),
        representation: clean(cell(row, "representation")),
        heroPlatform: heroOf(cell(row, "heroPlatform")),
        relationshipStatus: clean(cell(row, "relationshipStatus"), 40),
        note: clean(cell(row, "note"), 5000),
      },
      channels,
      rates,
      contact: {
        contactPerson: clean(cell(row, "contactPerson")),
        contactChannel: clean(cell(row, "contactChannel"), 60),
        contactDetail: clean(cell(row, "contactDetail"), 255),
        companyEmail: clean(cell(row, "companyEmail")),
        companyPhone: clean(cell(row, "companyPhone"), 60),
        companyWebsite: clean(cell(row, "companyWebsite"), 255),
        personalEmail: clean(cell(row, "personalEmail")),
        personalPhone: clean(cell(row, "personalPhone"), 60),
      },
    });
  });
  return { records, deletedIds, skipped, rowsRead: p.rows.length };
}
