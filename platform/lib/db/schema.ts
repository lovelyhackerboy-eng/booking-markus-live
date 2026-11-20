// MariaDB schema (Drizzle). Creator data mirrors the CREATOR_DB Sheet (37 columns) so the cron importer is a
// straight mapping. Price (rates) and contact (contacts) live in their OWN tables: a viewer query never joins them.
// Collation utf8mb4_unicode_520_ci is set on the database by migration 0000 (accent-insensitive Vietnamese search).
import {
  bigint,
  datetime,
  decimal,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  smallint,
  text,
  varchar,
} from "drizzle-orm/mysql-core";

export const ROLE_VALUES = ["admin", "manager", "planner", "viewer"] as const;
export const PLATFORM_VALUES = ["tiktok", "facebook", "instagram", "youtube", "threads"] as const;
// The 5 SOW price columns of CREATOR_DB: Photo Post, Video Post, Tham gia sự kiện, Tham gia video của nhãn hàng, Livestream.
export const SOW_VALUES = ["photo", "video", "event", "brandvideo", "live"] as const;
export const STAGE_VALUES = ["none", "zalo", "manager", "quoted", "closed"] as const;
export const BOOKING_STATUS_VALUES = ["confirmed", "content", "posted", "paid", "cancelled"] as const;

const ts = (name: string) => datetime(name, { mode: "date", fsp: 3 });

/* ---------- People ---------- */

// Mirror of the Employees tab (the role source of truth stays the Sheet in production; see lib/auth/directory.ts).
export const users = mysqlTable("users", {
  email: varchar("email", { length: 190 }).primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  role: mysqlEnum("role", ROLE_VALUES).notNull().default("viewer"),
  lastLoginAt: ts("last_login_at"),
  createdAt: ts("created_at").notNull(),
});

export const sessions = mysqlTable(
  "sessions",
  {
    idHash: varchar("id_hash", { length: 64 }).primaryKey(), // sha256 of the cookie value; the raw id is never stored
    email: varchar("email", { length: 190 }).notNull(),
    csrf: varchar("csrf", { length: 64 }).notNull(),
    createdAt: ts("created_at").notNull(),
    lastSeenAt: ts("last_seen_at").notNull(),
  },
  (t) => [index("sessions_email_idx").on(t.email)],
);

/* ---------- Creators (CREATOR_DB) ---------- */

// id: the PHP identity uid (`cr_…`) for Sheet rows, `CR-0001`… for seed data. Never the row number or the name.
export const creators = mysqlTable(
  "creators",
  {
    id: varchar("id", { length: 40 }).primaryKey(),
    sheetRow: int("sheet_row"), // 1-based Sheet row at the last import; null for creators created in v2
    name: varchar("name", { length: 190 }).notNull(), // Creator_Name
    alias: varchar("alias", { length: 190 }),
    tier: varchar("tier", { length: 20 }), // Tier
    primaryCategory: varchar("primary_category", { length: 80 }),
    secondaryCategory: varchar("secondary_category", { length: 80 }),
    creatorType: varchar("creator_type", { length: 80 }),
    castingProfile: varchar("casting_profile", { length: 190 }),
    gender: varchar("gender", { length: 20 }),
    yearOfBirth: smallint("year_of_birth"),
    ageBand: varchar("age_band", { length: 20 }),
    baseLocation: varchar("base_location", { length: 120 }),
    representation: varchar("representation", { length: 190 }),
    heroPlatform: mysqlEnum("hero_platform", PLATFORM_VALUES),
    relationshipStatus: varchar("relationship_status", { length: 40 }),
    ownerEmail: varchar("owner_email", { length: 190 }), // internal owner (booker)
    note: text("note"), // Note — free text, may hold prices/phones: internal only
    source: mysqlEnum("source", ["sheet", "v2", "seed"]).notNull(),
    syncedAt: ts("synced_at"),
    createdAt: ts("created_at").notNull(),
    updatedAt: ts("updated_at").notNull(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [index("creators_name_idx").on(t.name), index("creators_sheet_row_idx").on(t.sheetRow)],
);

// TikTok/Sub_TikTok, Facebook/Sub_Facebook, Instagram/Sub_IG, Youtube/Sub_Youtube, Threads.
export const channels = mysqlTable(
  "channels",
  {
    creatorId: varchar("creator_id", { length: 40 }).notNull(),
    platform: mysqlEnum("platform", PLATFORM_VALUES).notNull(),
    url: varchar("url", { length: 1024 }),
    label: varchar("label", { length: 190 }), // cell text as shown in the Sheet
    followers: bigint("followers", { mode: "number" }),
    followersSource: mysqlEnum("followers_source", ["sheet", "manual", "crawler", "api"]),
    followersUpdatedAt: ts("followers_updated_at"),
  },
  (t) => [primaryKey({ columns: [t.creatorId, t.platform] })],
);

// PRICE — read only for roles with the `price` permission.
export const rates = mysqlTable(
  "rates",
  {
    creatorId: varchar("creator_id", { length: 40 }).notNull(),
    sow: mysqlEnum("sow", SOW_VALUES).notNull(),
    platform: mysqlEnum("platform", PLATFORM_VALUES), // seed detail; the Sheet has one price per SOW
    amount: bigint("amount", { mode: "number" }), // parsed VND; null when the cell is not a number
    amountText: text("amount_text"), // raw cell text — free text in the Sheet ("1 video tiktok: 12,000,000 | …")
    terms: text("terms"), // usage / exclusivity / payment conditions and negotiation notes
    source: varchar("source", { length: 120 }),
    updatedAt: ts("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.creatorId, t.sow] })],
);

// CONTACT — read only for roles with the `contact` permission.
export const contacts = mysqlTable("contacts", {
  creatorId: varchar("creator_id", { length: 40 }).primaryKey(),
  contactPerson: varchar("contact_person", { length: 190 }),
  contactChannel: varchar("contact_channel", { length: 60 }),
  contactDetail: varchar("contact_detail", { length: 255 }),
  companyEmail: varchar("company_email", { length: 190 }),
  companyPhone: varchar("company_phone", { length: 60 }),
  companyWebsite: varchar("company_website", { length: 255 }),
  personalEmail: varchar("personal_email", { length: 190 }),
  personalPhone: varchar("personal_phone", { length: 60 }),
  updatedAt: ts("updated_at").notNull(),
});

// Internal working notes (contact permission: free text often quotes prices or phone numbers).
export const notes = mysqlTable(
  "notes",
  {
    id: int("id").autoincrement().primaryKey(),
    creatorId: varchar("creator_id", { length: 40 }).notNull(),
    authorEmail: varchar("author_email", { length: 190 }),
    authorName: varchar("author_name", { length: 120 }),
    body: text("body").notNull(),
    kind: mysqlEnum("kind", ["", "good", "risk"]).notNull().default(""),
    campaignId: varchar("campaign_id", { length: 40 }), // set when the note comes from campaign work: hidden from people who cannot see that campaign
    createdAt: ts("created_at").notNull(),
  },
  (t) => [index("notes_creator_idx").on(t.creatorId)],
);

/* ---------- Campaigns ---------- */

export const campaigns = mysqlTable("campaigns", {
  id: varchar("id", { length: 40 }).primaryKey(),
  name: varchar("name", { length: 190 }).notNull(),
  brand: varchar("brand", { length: 120 }),
  ownerEmail: varchar("owner_email", { length: 190 }).notNull(),
  kpiViews: bigint("kpi_views", { mode: "number" }),
  createdAt: ts("created_at").notNull(),
  updatedAt: ts("updated_at").notNull(),
  archivedAt: ts("archived_at"),
});

export const campaignMembers = mysqlTable(
  "campaign_members",
  {
    campaignId: varchar("campaign_id", { length: 40 }).notNull(),
    email: varchar("email", { length: 190 }).notNull(),
    addedAt: ts("added_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.email] }), index("campaign_members_email_idx").on(t.email)],
);

// Step 1 · Ứng viên (not yet approved).
export const campaignCandidates = mysqlTable(
  "campaign_candidates",
  {
    campaignId: varchar("campaign_id", { length: 40 }).notNull(),
    creatorId: varchar("creator_id", { length: 40 }).notNull(),
    sow: mysqlEnum("sow", SOW_VALUES),
    addedBy: varchar("added_by", { length: 190 }),
    addedAt: ts("added_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.creatorId] })],
);

// Step 2 · Liên hệ (approved; contact progress until the booking is closed).
export const campaignEntries = mysqlTable(
  "campaign_entries",
  {
    campaignId: varchar("campaign_id", { length: 40 }).notNull(),
    creatorId: varchar("creator_id", { length: 40 }).notNull(),
    stage: mysqlEnum("stage", STAGE_VALUES).notNull().default("none"),
    addedAt: ts("added_at").notNull(),
    updatedAt: ts("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.creatorId] })],
);

/* ---------- Bookings ---------- */

export const bookings = mysqlTable(
  "bookings",
  {
    id: varchar("id", { length: 40 }).primaryKey(),
    creatorId: varchar("creator_id", { length: 40 }).notNull(),
    campaignId: varchar("campaign_id", { length: 40 }),
    brand: varchar("brand", { length: 120 }),
    campaignName: varchar("campaign_name", { length: 190 }),
    platform: mysqlEnum("platform", PLATFORM_VALUES),
    sow: varchar("sow", { length: 60 }),
    quotedAmount: bigint("quoted_amount", { mode: "number" }), // price
    closedAmount: bigint("closed_amount", { mode: "number" }), // price
    bookedOn: datetime("booked_on", { mode: "date" }),
    deadline: datetime("deadline", { mode: "date" }),
    status: mysqlEnum("status", BOOKING_STATUS_VALUES).notNull(),
    contract: mysqlEnum("contract", ["pending", "signed"]),
    ownerEmail: varchar("owner_email", { length: 190 }),
    contentUrl: varchar("content_url", { length: 1024 }),
    views: bigint("views", { mode: "number" }),
    er: decimal("er", { precision: 5, scale: 2, mode: "number" }),
    score: decimal("score", { precision: 3, scale: 1, mode: "number" }),
    evaluationNote: text("evaluation_note"),
    createdAt: ts("created_at").notNull(),
    updatedAt: ts("updated_at").notNull(),
  },
  (t) => [index("bookings_creator_idx").on(t.creatorId), index("bookings_campaign_idx").on(t.campaignId)],
);

/* ---------- AI assistant ---------- */

// One shared assistant thread per campaign (everyone who can see the campaign sees it). messages/brief are JSON text.
export const aiThreads = mysqlTable("ai_threads", {
  campaignId: varchar("campaign_id", { length: 40 }).primaryKey(),
  messages: text("messages").notNull(),
  brief: text("brief"),
  updatedBy: varchar("updated_by", { length: 190 }),
  updatedAt: ts("updated_at").notNull(),
});

/* ---------- Operations ---------- */

export const reviewQueue = mysqlTable("review_queue", {
  id: int("id").autoincrement().primaryKey(),
  creatorId: varchar("creator_id", { length: 40 }).notNull(),
  field: varchar("field", { length: 80 }).notNull(),
  proposed: text("proposed"),
  source: varchar("source", { length: 40 }).notNull(),
  status: mysqlEnum("status", ["pending", "accepted", "rejected"]).notNull().default("pending"),
  createdAt: ts("created_at").notNull(),
  decidedBy: varchar("decided_by", { length: 190 }),
  decidedAt: ts("decided_at"),
});

// before/after are JSON text written by the server (not a JSON column: MariaDB stores JSON as LONGTEXT anyway).
export const auditLog = mysqlTable(
  "audit_log",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    at: ts("at").notNull(),
    actorEmail: varchar("actor_email", { length: 190 }),
    action: varchar("action", { length: 60 }).notNull(),
    target: varchar("target", { length: 120 }).notNull(),
    before: text("before"),
    after: text("after"),
  },
  (t) => [index("audit_target_idx").on(t.target)],
);

// One row per Sheet import / cron run. Counts and reasons only, never personal data.
export const syncRuns = mysqlTable("sync_runs", {
  id: int("id").autoincrement().primaryKey(),
  kind: varchar("kind", { length: 40 }).notNull(),
  dryRun: int("dry_run").notNull().default(0),
  startedAt: ts("started_at").notNull(),
  finishedAt: ts("finished_at"),
  status: mysqlEnum("status", ["running", "ok", "failed"]).notNull(),
  rowsRead: int("rows_read"),
  rowsImported: int("rows_imported"),
  rowsSkipped: int("rows_skipped"),
  skipReasons: text("skip_reasons"),
  error: varchar("error", { length: 500 }),
});
