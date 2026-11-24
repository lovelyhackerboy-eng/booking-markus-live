// Creator edit/add through the Sheet, with a fake PHP bridge that behaves like bridge/sheet-write.php + sheet-export.php
// on an in-memory Sheet. Checks: flag, per-field permissions, write-then-reimport, conflicts, moved rows, create, duplicates.
import path from "node:path";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setDirectoryForTests } from "@/lib/auth/directory";
import { createSession } from "@/lib/auth/session";
import { closeDb, db } from "@/lib/db/client";
import { auditLog, channels, contacts, creators, syncRuns } from "@/lib/db/schema";
import { assertLocalDatabase, SEED_USERS, seedAll } from "@/lib/db/seed-data";
import { setBridgeForTests } from "@/lib/sheet/bridge";

const TEST_DB = process.env.TEST_DATABASE_URL;
const ORIGIN = "http://localhost:3100";
const HEADER = [
  "STT", "Creator_Name", "Tier", "Primary_Category", "Secondary_Category", "Creator_Type", "Casting_Profile", "Year_Of_Birth",
  "Base_Location", "Age", "Age_Band", "Representation", "Contact_Person", "Contact_Channel", "Contact_Detail", "Company_Email",
  "Company_Phone", "Company_Website", "Personal_Email", "Personal_Phone", "Note", "Hero_Platform", "TikTok", "Sub_TikTok",
  "Facebook", "Sub_Facebook", "Instagram", "Sub_IG", "Youtube", "Sub_Youtube", "Threads", "Relationship_Status", "Photo Post",
  "Video Post", "Tham gia sự kiện", "Tham gia video của nhãn hàng", "Livestream",
];
const C = (name: string) => HEADER.indexOf(name);
type Row = { cells: string[]; links: Record<string, string | null>; uid: string | null };

// In-memory Sheet: rows[i] is Sheet row i + 4 (header = row 3).
let sheet: Row[] = [];
const calls: string[] = [];
const mkRow = (name: string, uid: string, over: Record<string, string> = {}, tiktok = `https://www.tiktok.com/@${uid}`): Row => {
  const cells = HEADER.map((h) => over[h] ?? "");
  cells[C("Creator_Name")] = name;
  cells[C("TikTok")] = "@" + uid;
  return { cells, links: { tiktok }, uid };
};
let uidSeq = 0xabc000;
function fakeBridge(script: string, input?: unknown): Promise<unknown> {
  const i = (input ?? {}) as Record<string, unknown>;
  calls.push(script + ":" + (i.op ?? "export"));
  if (script === "sheet-export.php") {
    return Promise.resolve({
      header: HEADER,
      rows: sheet.map((r) => r.cells),
      links: sheet.map((r) => r.links),
      uids: sheet.map((r) => r.uid),
      statuses: sheet.map((r) => (r.uid ? "bound" : null)),
    });
  }
  const row = Number(i.row);
  const r = sheet[row - 4];
  if (i.op === "read") return Promise.resolve({ ok: true, header: HEADER, values: r.cells, links: r.links, formulaCols: ["TikTok"] });
  if (i.op === "update") {
    if (r.cells[C("Creator_Name")] !== i.name) return Promise.resolve({ ok: false, error: "row_moved" });
    const conflicts = Object.entries(i.expect as Record<string, string>).filter(([col, v]) => r.cells[C(col)] !== v);
    if (conflicts.length) return Promise.resolve({ ok: false, error: "conflict", conflicts: conflicts.map(([col]) => ({ column: col, current: r.cells[C(col)] })) });
    for (const [col, v] of Object.entries(i.set as Record<string, string | number>)) r.cells[C(col)] = String(v);
    return Promise.resolve({ ok: true, row, written: Object.keys(i.set as object) });
  }
  if (i.op === "create") {
    const vals = i.values as Record<string, string | number>;
    if (sheet.some((x) => x.cells[C("Creator_Name")] === vals.Creator_Name)) return Promise.resolve({ ok: false, error: "name_taken" });
    const url = (i.links as Record<string, string>).tiktok;
    if (sheet.some((x) => x.links.tiktok?.replace(/\/$/, "") === url.replace(/\/$/, ""))) return Promise.resolve({ ok: false, error: "url_taken", name: "someone" });
    const uid = "cr_0000000000" + (uidSeq++).toString(16);
    const nr = mkRow(String(vals.Creator_Name), uid, Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, String(v)])), url);
    sheet.push(nr);
    return Promise.resolve({ ok: true, row: sheet.length + 3 });
  }
  return Promise.resolve({ ok: false, error: "unknown_op" });
}

describe.skipIf(!TEST_DB)("creator edit / add via the Sheet (fake bridge)", () => {
  const cookies: Record<string, { cookie: string; csrf: string }> = {};
  const login = async (email: string) => {
    const u = SEED_USERS.find((x) => x.email === email)!;
    const { cookie, csrf } = await createSession({ email: u.email, name: u.name, role: u.role as "admin" | "manager" | "planner" | "viewer" });
    return { cookie: cookie.split(";")[0], csrf };
  };
  const post = async (as: string, route: string, body: unknown, id?: string) => {
    const mod = (await import(route)) as { POST: (r: Request, c?: unknown) => Promise<Response> };
    const r = new Request(ORIGIN + "/v2/api/x", { method: "POST", headers: { cookie: cookies[as].cookie, "x-csrf-token": cookies[as].csrf, origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify(body) });
    return id ? mod.POST(r, { params: Promise.resolve({ id }) }) : mod.POST(r);
  };
  const EDIT = "@/app/api/creators/[id]/edit/route";
  const CREATE = "@/app/api/creators/route";
  const UID_A = "cr_00000000000000aa";
  const UID_B = "cr_00000000000000bb";

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    process.env.APP_ORIGIN = ORIGIN;
    process.env.DIRECTORY = "db";
    assertLocalDatabase(TEST_DB, process.env.NODE_ENV);
    setDirectoryForTests(undefined);
    await migrate(db(), { migrationsFolder: path.resolve(__dirname, "..", "drizzle") });
    await seedAll(db());
    cookies.planner = await login("ngocanh@markus.test");
    cookies.viewer = await login("khach@markus.test");
    setBridgeForTests(fakeBridge);
  });
  beforeEach(async () => {
    process.env.SHEET_WRITE = "on";
    calls.length = 0;
    sheet = [
      mkRow("Creator A", UID_A, { Tier: "Micro", Sub_TikTok: "86,000", Hero_Platform: "TikTok", Personal_Phone: "0900 000 001", "Video Post": "12tr", Relationship_Status: "Đã báo giá" }),
      mkRow("Creator B", UID_B, { Tier: "Nano", Sub_TikTok: "5,000", Hero_Platform: "TikTok" }),
    ];
    await db().delete(syncRuns); // a fresh fake Sheet per test: don't let the >20% drop guard compare with the previous test
    const { refreshFromSheet } = await import("@/lib/sheet/bridge");
    await refreshFromSheet();
    calls.length = 0;
  });
  afterAll(async () => {
    setBridgeForTests(null);
    delete process.env.SHEET_WRITE;
    await closeDb();
  });

  it("is off unless SHEET_WRITE=on (503)", async () => {
    process.env.SHEET_WRITE = "";
    expect((await post("planner", EDIT, { changes: { tier: "Macro" } }, UID_A)).status).toBe(503);
    expect(calls).toEqual([]);
  });

  it("viewer cannot edit; unknown fields and identity columns are refused", async () => {
    expect((await post("viewer", EDIT, { changes: { tier: "Macro" } }, UID_A)).status).toBe(403);
    expect((await post("planner", EDIT, { changes: { name: "X" } }, UID_A)).status).toBe(422);
    expect((await post("planner", EDIT, { changes: { tiktokUrl: "https://x.y/z" } }, UID_A)).status).toBe(422);
    expect((await post("planner", EDIT, { changes: { tier: "Giant" } }, UID_A)).status).toBe(422);
    expect(calls.filter((c) => c.endsWith(":update"))).toEqual([]);
  });

  it("planner edit: Sheet first (exact expected raw values), then DB re-imported; audit kept", async () => {
    const res = await post("planner", EDIT, { changes: { "followers.tiktok": 120000, personalPhone: "0900 000 009", "rate.video": "15tr / video", heroPlatform: "facebook" } }, UID_A);
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.changed).toHaveLength(4);
    expect(calls).toEqual(["sheet-write.php:read", "sheet-write.php:update", "sheet-export.php:export"]);
    expect(sheet[0].cells[C("Sub_TikTok")]).toBe("120000");
    expect(sheet[0].cells[C("Hero_Platform")]).toBe("Facebook");
    const [ch] = await db().select().from(channels).where(eq(channels.creatorId, UID_A));
    expect(ch.followers).toBe(120000);
    const [ct] = await db().select().from(contacts).where(eq(contacts.creatorId, UID_A));
    expect(ct.personalPhone).toBe("0900 000 009");
    expect(j.creator.rates.find((r: { sow: string }) => r.sow === "video").amountText).toBe("15tr / video");
    const [a] = await db().select().from(auditLog).where(eq(auditLog.action, "creator.sheet_edit"));
    expect(a.target).toBe("creator:" + UID_A);
  });

  it("someone changed the cell on the Sheet since the last import → 409, nothing written, DB refreshed", async () => {
    sheet[0].cells[C("Sub_TikTok")] = "90,000"; // edited directly on the Sheet
    const res = await post("planner", EDIT, { "changes": { "followers.tiktok": 100000 } }, UID_A);
    expect(res.status).toBe(409);
    const j = await res.json();
    expect(j.conflicts).toEqual([{ field: "followers.tiktok", sheet: "90,000" }]);
    expect(sheet[0].cells[C("Sub_TikTok")]).toBe("90,000");
    expect(calls).not.toContain("sheet-write.php:update");
    expect(j.creator.channels.tiktok.followers).toBe(90000); // the user now sees the newer Sheet value
  });

  it("row moved (rows inserted above) → re-import, then the edit lands on the right row", async () => {
    sheet.unshift(mkRow("New On Top", "cr_00000000000000cc"));
    const res = await post("planner", EDIT, { changes: { tier: "Macro" } }, UID_A);
    expect(res.status).toBe(200);
    expect(sheet[1].cells[C("Tier")]).toBe("Macro");
    expect(sheet[0].cells[C("Tier")]).toBe("");
    expect(calls).toEqual(["sheet-write.php:read", "sheet-export.php:export", "sheet-write.php:read", "sheet-write.php:update", "sheet-export.php:export"]);
  });

  it("create: appended to the Sheet, gets a uid from the re-import, returned as a creator", async () => {
    const res = await post("planner", CREATE, { name: "Brand New", links: { tiktok: "https://www.tiktok.com/@brandnew" }, fields: { tier: "Nano", "followers.tiktok": "8,5K", primaryCategory: "Beauty" } });
    expect(res.status).toBe(201);
    const j = await res.json();
    expect(j.id).toMatch(/^cr_/);
    expect(j.creator.name).toBe("Brand New");
    expect(j.creator.channels.tiktok.followers).toBe(8500);
    const [c] = await db().select().from(creators).where(eq(creators.id, j.id));
    expect(c.sheetRow).toBe(sheet.length + 3);
  });

  it("create duplicates → 409 (name or URL); bad link → 422; viewer → 403", async () => {
    expect((await post("planner", CREATE, { name: "Creator A", links: { tiktok: "https://www.tiktok.com/@zzz" } })).status).toBe(409);
    expect((await post("planner", CREATE, { name: "Other", links: { tiktok: `https://www.tiktok.com/@${UID_B}/` } })).status).toBe(409);
    expect((await post("planner", CREATE, { name: "Other", links: { tiktok: "not a url" } })).status).toBe(422);
    expect((await post("viewer", CREATE, { name: "Other", links: { tiktok: "https://www.tiktok.com/@ok" } })).status).toBe(403);
  });

  it("snapshot tells the UI whether writing is on", async () => {
    const { GET } = (await import("@/app/api/snapshot/route")) as { GET: (r: Request) => Promise<Response> };
    const j = await (await GET(new Request(ORIGIN + "/v2/api/snapshot", { headers: { cookie: cookies.planner.cookie } }))).json();
    expect(j.features).toEqual({ sheetWrite: true });
  });
});
