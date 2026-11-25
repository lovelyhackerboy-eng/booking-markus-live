// API tests against a real MariaDB (TEST_DATABASE_URL, see docker-compose.dev.yml). Sessions are created directly
// in the DB per role — there is no login shortcut in the app. Leak checks run on the RAW JSON text.
import path from "node:path";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DbDirectory, setDirectoryForTests, type Employee } from "@/lib/auth/directory";
import { setGoogleKeysForTests } from "@/lib/auth/google";
import { createSession } from "@/lib/auth/session";
import { closeDb, db, pool } from "@/lib/db/client";
import { auditLog, sessions, users } from "@/lib/db/schema";
import { SEED_USERS, assertLocalDatabase, seedAll } from "@/lib/db/seed-data";
import { BOOKINGS, CREATORS } from "../seed/prototype-data.mjs";
import { fakeGoogle } from "./helpers/google-keys";

const TEST_DB = process.env.TEST_DATABASE_URL;
const ORIGIN = "http://localhost:3100";
const BASE = `${ORIGIN}/v2`;

type Role = "admin" | "manager" | "planner" | "viewer";
const cookies: Record<string, { cookie: string; csrf: string }> = {};
const emailOf = (name: string) => SEED_USERS.find((u) => u.name === name)!.email;

async function loginAs(email: string) {
  const u = SEED_USERS.find((x) => x.email === email)!;
  const { cookie, csrf } = await createSession({ email: u.email, name: u.name, role: u.role as Role });
  return { cookie: cookie.split(";")[0], csrf };
}

function req(p: string, opts: { as?: string; method?: string; headers?: Record<string, string>; body?: unknown } = {}) {
  const h = new Headers(opts.headers);
  if (opts.as) h.set("cookie", cookies[opts.as].cookie);
  return new Request(BASE + p, {
    method: opts.method ?? "GET",
    headers: h,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

const routes = {
  creators: () => import("@/app/api/creators/route"),
  creator: () => import("@/app/api/creators/[id]/route"),
  campaigns: () => import("@/app/api/campaigns/route"),
  session: () => import("@/app/api/auth/session/route"),
  logout: () => import("@/app/api/auth/logout/route"),
  google: () => import("@/app/api/auth/google/route"),
  health: () => import("@/app/api/health/route"),
};

async function getText(p: string, as?: string) {
  let res: Response;
  if (p === "/api/creators") res = await (await routes.creators()).GET(req(p, { as }));
  else if (p.startsWith("/api/creators/")) {
    const id = p.split("/").pop()!;
    res = await (await routes.creator()).GET(req(p, { as }), { params: Promise.resolve({ id }) });
  } else if (p === "/api/campaigns") res = await (await routes.campaigns()).GET(req(p, { as }));
  else if (p === "/api/auth/session") res = await (await routes.session()).GET(req(p, { as }));
  else if (p === "/api/health") res = await (await routes.health()).GET(req(p, { as }));
  else if (p === "/api/bookings") res = await (await import("@/app/api/bookings/route")).GET(req(p, { as }));
  else if (p === "/api/snapshot") res = await (await import("@/app/api/snapshot/route")).GET(req(p, { as }));
  else throw new Error("unknown route " + p);
  return { status: res.status, text: await res.text() };
}

// Values a viewer must never receive, taken from the seed itself.
const followerValues = new Set(CREATORS.flatMap((c) => Object.values(c.channels).map((ch) => ch.followers.value)));
const amounts = [...new Set([...CREATORS.flatMap((c) => c.rates.map((r) => r.amount)), ...BOOKINGS.flatMap((b) => [b.quoted, b.closed])])].filter(
  (a) => !followerValues.has(a),
);
const SECRET_PATTERNS: [string, RegExp][] = [
  ["seed phone", /555 1\d\d/],
  ["creator e-mail", /@[a-z0-9.-]*example\.com/i],
  ["MCN mailbox", /lumi-mcn/i],
  ["negotiation note", /Thương lượng|Linh hoạt|Giảm 5/],
  ["contract terms", /Cọc 50%|Exclusivity|Usage 60/],
  ["internal notes", /Giao bài sớm 2 ngày|chỉnh sửa 2 vòng/],
  ["relationship status", /"relationshipStatus"|"preferred"|"dnr"/i],
  ["rates key", /"rates"|"amount"|"quotedAmount"|"closedAmount"/],
  ["contact key", /"contact"|"personalPhone"|"companyEmail"/],
];
function leaks(text: string): string[] {
  const found = SECRET_PATTERNS.filter(([, re]) => re.test(text)).map(([n]) => n);
  for (const a of amounts) if (new RegExp(`[:\\[,]${a}[,}\\]]`).test(text)) found.push(`amount ${a}`);
  return found;
}

describe.skipIf(!TEST_DB)("API with MariaDB", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    process.env.APP_ORIGIN = ORIGIN;
    process.env.DIRECTORY = "db";
    process.env.GOOGLE_CLIENT_ID = "test-client.apps.googleusercontent.com";
    assertLocalDatabase(TEST_DB, process.env.NODE_ENV);
    setDirectoryForTests(undefined);
    await migrate(db(), { migrationsFolder: path.resolve(__dirname, "..", "drizzle") });
    await seedAll(db());
    cookies.admin = await loginAs("admin@markus.test");
    cookies.manager = await loginAs("haiyen@markus.test");
    cookies.planner = await loginAs(emailOf("Ngọc Anh"));
    cookies.plannerOther = await loginAs(emailOf("Khánh Vy"));
    cookies.viewer = await loginAs("khach@markus.test");
  });
  afterAll(async () => {
    setGoogleKeysForTests(null);
    await closeDb();
  });

  it("tables use utf8mb4_unicode_520_ci", async () => {
    const [rows] = await pool().query(
      "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name <> '__drizzle_migrations' AND table_collation <> 'utf8mb4_unicode_520_ci'",
    );
    expect(Number((rows as { n: number }[])[0].n)).toBe(0);
  });

  it("every data endpoint requires a session", async () => {
    for (const p of ["/api/creators", "/api/creators/CR-0001", "/api/campaigns", "/api/auth/session"]) {
      expect((await getText(p)).status, p).toBe(401);
    }
  });

  describe("viewer gets no price, contact or internal data (raw JSON)", () => {
    for (const p of ["/api/creators", "/api/creators/CR-0001", "/api/creators/CR-0019", "/api/campaigns", "/api/auth/session", "/api/bookings", "/api/snapshot"]) {
      it(p, async () => {
        const r = await getText(p, "viewer");
        expect(r.status).toBe(200);
        expect(leaks(r.text)).toEqual([]);
      });
    }
    it("but still gets the public profile (names, followers)", async () => {
      const r = JSON.parse((await getText("/api/creators", "viewer")).text);
      expect(r.count).toBe(30);
      expect(r.creators[0].name).toBeTruthy();
      expect(Object.values(r.creators[0].channels as Record<string, { followers: number }>)[0].followers).toBeGreaterThan(0);
    });
  });

  it("negative control: the same checks DO find the data for a planner", async () => {
    const all = (await getText("/api/creators", "planner")).text;
    const found = leaks(all);
    for (const n of ["seed phone", "creator e-mail", "negotiation note", "contract terms", "internal notes", "rates key", "contact key"])
      expect(found, n).toContain(n);
    expect(found.some((f) => f.startsWith("amount "))).toBe(true);
  });

  it("a malformed cookie is treated as no session (401, not 500)", async () => {
    const { GET } = await routes.creators();
    const res = await GET(new Request(BASE + "/api/creators", { headers: { cookie: "mkv2_sid=%E0%A4%A; other=1" } }));
    expect(res.status).toBe(401);
  });

  it("unknown creator id → 404, odd id → 404", async () => {
    expect((await getText("/api/creators/CR-9999", "planner")).status).toBe(404);
    expect((await getText("/api/creators/..%2Fetc", "planner")).status).toBe(404);
  });

  describe("campaign visibility (server side, per row)", () => {
    const ids = async (as: string) =>
      (JSON.parse((await getText("/api/campaigns", as)).text).campaigns as { id: string }[]).map((c) => c.id).sort();
    it("manager and admin see all", async () => {
      expect(await ids("manager")).toEqual(["L1", "L2", "L3", "L4", "L5"]);
      expect(await ids("admin")).toEqual(["L1", "L2", "L3", "L4", "L5"]);
    });
    it("planner sees own + invited, not others", async () => {
      expect(await ids("planner")).toEqual(["L1", "L2", "L4", "L5"]);
      expect(await ids("plannerOther")).toEqual([]);
    });
    it("viewer sees only the campaign they were invited to", async () => {
      expect(await ids("viewer")).toEqual(["L1"]);
    });
    it("hidden campaign names never appear in a planner's response", async () => {
      expect((await getText("/api/campaigns", "planner")).text).not.toContain("Tech reviewers");
    });
  });

  describe("writes: campaigns and bookings (server re-checks visibility)", () => {
    const post = async (as: string, path: string, body: unknown, mod: string) => {
      const m = (await import(mod)) as { POST: (r: Request, c?: unknown) => Promise<Response> };
      const id = path.split("/")[3];
      const r = req(path, { as, method: "POST", headers: { origin: ORIGIN, "x-csrf-token": cookies[as].csrf, "content-type": "application/json" }, body });
      return id ? m.POST(r, { params: Promise.resolve({ id }) }) : m.POST(r);
    };
    const CAMP = "@/app/api/campaigns/route";
    const CAMP_ID = "@/app/api/campaigns/[id]/route";
    const BOOK = "@/app/api/bookings/route";

    it("planner cannot touch a campaign they cannot see (404, not 403)", async () => {
      const res = await post("planner", "/api/campaigns/L3", { op: "addCandidate", creatorId: "CR-0001" }, CAMP_ID);
      expect(res.status).toBe(404);
    });
    it("viewer cannot write at all", async () => {
      expect((await post("viewer", "/api/campaigns/L1", { op: "addCandidate", creatorId: "CR-0001" }, CAMP_ID)).status).toBe(403);
      expect((await post("viewer", "/api/campaigns", { name: "x" }, CAMP)).status).toBe(403);
    });
    it("bad input → 422", async () => {
      expect((await post("planner", "/api/campaigns/L1", { op: "setStage", creatorId: "CR-0001", stage: "hacked" }, CAMP_ID)).status).toBe(422);
    });
    it("planner flow: create → candidate → approve → stage; then a booking from a hidden campaign does not leak its name", async () => {
      const created = await (await post("planner", "/api/campaigns", { name: "Secret launch X", brand: "Vinamilk" }, CAMP)).json();
      const id = created.campaign.id as string;
      expect(created.campaign.isMine).toBe(true);
      expect((await post("planner", `/api/campaigns/${id}`, { op: "addCandidate", creatorId: "CR-0002", sow: "video" }, CAMP_ID)).status).toBe(200);
      const ap = await (await post("planner", `/api/campaigns/${id}`, { op: "approve", creatorIds: ["CR-0002"] }, CAMP_ID)).json();
      expect(ap.campaign.entries.map((e: { creatorId: string }) => e.creatorId)).toEqual(["CR-0002"]);
      expect(ap.campaign.candidates).toEqual([]);
      const st = await (await post("planner", `/api/campaigns/${id}`, { op: "setStage", creatorId: "CR-0002", stage: "quoted" }, CAMP_ID)).json();
      expect(st.campaign.entries[0].stage).toBe("quoted");
      const bk = await post("planner", "/api/bookings", { campaignId: id, items: [{ creatorId: "CR-0002", sow: "Video", amount: 25000000 }] }, BOOK);
      expect(bk.status).toBe(201);
      for (const as of ["viewer", "plannerOther"]) {
        const t = (await getText("/api/creators/CR-0002", as)).text + (await getText("/api/campaigns", as)).text;
        const { GET } = await import(BOOK);
        const bt = await (await GET(req("/api/bookings", { as }))).text();
        expect(t + bt, as).not.toContain("Secret launch X");
      }
      const { GET } = await import(BOOK);
      expect(await (await GET(req("/api/bookings", { as: "planner" }))).text()).toContain("Secret launch X");
      // soft delete keeps the booking; the campaign disappears from lists for everyone
      expect((await post("planner", `/api/campaigns/${id}`, { op: "delete" }, CAMP_ID)).status).toBe(200);
      expect(await (await GET(req("/api/bookings", { as: "admin" }))).text()).toContain("CR-0002");
      expect((await getText("/api/campaigns", "admin")).text).not.toContain("Secret launch X");
    });

    it("lifecycle: dates, custom steps, drag move, done, and delete of a draft only", async () => {
      const op = async (id: string, body: unknown, as = "planner") => post(as, `/api/campaigns/${id}`, body, CAMP_ID);
      const id = (await (await post("planner", "/api/campaigns", { name: "Lifecycle test", brand: "B" }, CAMP)).json()).campaign.id as string;
      let c = (await (await op(id, { op: "update", description: "Brief", budget: 90000000, trackFrom: "2026-12-01", trackTo: "2026-12-20", autoTrack: true })).json()).campaign;
      expect(c).toMatchObject({ status: "draft", description: "Brief", budget: 90000000, trackFrom: "2026-12-01", trackTo: "2026-12-20", autoTrack: true });
      expect(c.steps.map((s: { key: string }) => s.key)).toEqual(["none", "zalo", "manager", "quoted", "closed"]);
      expect((await op(id, { op: "update", trackFrom: "2026-12-30" })).status).toBe(422); // from > to

      await op(id, { op: "addCandidate", creatorId: "CR-0003", sow: "video" });
      await op(id, { op: "addCandidate", creatorId: "CR-0004", sow: "video" });
      await op(id, { op: "approve", creatorIds: ["CR-0003", "CR-0004"] });
      // rename + add + reorder steps; "manager" and "zalo" disappear
      c = (await (await op(id, { op: "steps", steps: [{ key: "none", label: "Mới" }, { label: "Đàm phán giá" }, { key: "closed", label: "Chốt", final: true }] })).json()).campaign;
      expect(c.steps.map((s: { label: string }) => s.label)).toEqual(["Mới", "Đàm phán giá", "Chốt"]);
      const nego = c.steps[1].key as string;
      expect(nego).toBe("dam-phan-gia");
      expect((await op(id, { op: "steps", steps: [{ key: "none", label: "A", final: true }, { key: "closed", label: "B", final: true }] })).status).toBe(422);
      expect((await op(id, { op: "setStage", creatorId: "CR-0003", stage: "zalo" })).status).toBe(422); // removed step

      // drag CR-0004 to the top of "đàm phán", then CR-0003 above it
      await op(id, { op: "moveEntry", creatorId: "CR-0004", stage: nego, position: 0 });
      c = (await (await op(id, { op: "moveEntry", creatorId: "CR-0003", stage: nego, position: 0 })).json()).campaign;
      expect(c.entries.filter((e: { stage: string }) => e.stage === nego).map((e: { creatorId: string }) => e.creatorId)).toEqual(["CR-0003", "CR-0004"]);
      // removing a step that still has entries needs a target
      expect((await op(id, { op: "steps", steps: [{ key: "none", label: "Mới" }, { key: "closed", label: "Chốt", final: true }] })).status).toBe(409);
      c = (await (await op(id, { op: "steps", steps: [{ key: "none", label: "Mới" }, { key: "closed", label: "Chốt", final: true }], moveTo: "none" })).json()).campaign;
      expect(c.entries.every((e: { stage: string }) => e.stage === "none")).toBe(true);

      // a viewer who CAN see a campaign (invited member of L1) still never gets its budget
      expect((await op("L1", { op: "update", budget: 77700000 })).status).toBe(200);
      const vt = (await getText("/api/campaigns", "viewer")).text;
      expect(vt).toContain("Vinamilk");
      expect(vt).not.toContain("77700000");
      expect(vt).not.toContain('"budget"');
      expect((await getText("/api/campaigns", "planner")).text).toContain("77700000");
      // planner who is not owner/member cannot change status; owner can run → done
      expect((await op(id, { op: "setStatus", status: "running" }, "plannerOther")).status).toBe(404);
      c = (await (await op(id, { op: "setStatus", status: "running" })).json()).campaign;
      expect(c.status).toBe("running");
      expect(c.startDate).toBeTruthy();
      expect((await op(id, { op: "delete" })).status).toBe(403); // running: only admin deletes
      c = (await (await op(id, { op: "setStatus", status: "done" })).json()).campaign;
      expect(c.status).toBe("done");
      expect(c.doneAt).toBeTruthy();
      const del = await op(id, { op: "delete" }, "admin"); // done → admin may delete
      expect(del.status).toBe(200);
      expect((await getText("/api/campaigns", "planner")).text).not.toContain("Lifecycle test");
      // data is kept: admin sees it in the deleted list and restores it with its old status
      const { GET: deletedList } = await import("@/app/api/admin/campaigns/route");
      expect((await deletedList(req("/api/admin/campaigns", { as: "planner" }))).status).toBe(403);
      const dl = await (await deletedList(req("/api/admin/campaigns", { as: "admin" }))).json();
      expect(dl.campaigns.find((x: { id: string }) => x.id === id)).toMatchObject({ statusBefore: "done", entries: 2 });
      expect((await op(id, { op: "restore" })).status).toBe(403);
      const back = await (await op(id, { op: "restore" }, "admin")).json();
      expect(back.campaign).toMatchObject({ status: "done" });
      // a draft: the owner may delete it
      const d2 = (await (await post("planner", "/api/campaigns", { name: "Draft to delete" }, CAMP)).json()).campaign.id as string;
      expect((await op(d2, { op: "delete" })).status).toBe(200);
    });
  });

  describe("metrics, posts and reports", () => {
    const call = async (as: string, mod: string, method: "GET" | "POST", path: string, body?: unknown, id?: string) => {
      const m = (await import(mod)) as Record<string, (r: Request, c?: unknown) => Promise<Response>>;
      const headers: Record<string, string> = method === "POST" ? { origin: ORIGIN, "x-csrf-token": cookies[as].csrf, "content-type": "application/json" } : {};
      const r = req(path, { as, method, headers, body });
      const res = await (id ? m[method](r, { params: Promise.resolve({ id }) }) : m[method](r));
      return { status: res.status, text: await res.clone().text(), json: (await res.json().catch(() => ({}))) as Record<string, any> };
    };
    const CLIPS = "@/app/api/creators/[id]/clips/route";
    const POSTS = "@/app/api/campaigns/[id]/posts/route";
    const REPORT = "@/app/api/campaigns/[id]/report/route";
    const OVERVIEW = "@/app/api/reports/route";
    const SETTINGS = "@/app/api/admin/metrics/route";
    const CAMP = "@/app/api/campaigns/route";
    const CAMP_ID = "@/app/api/campaigns/[id]/route";
    const day = (iso: string) => new Date(iso);

    it("only admin changes the formula; changing it recomputes from stored clips", async () => {
      const s = (await call("planner", SETTINGS, "GET", "/api/admin/metrics")).json.settings;
      expect(s.method).toBe("median");
      expect((await call("planner", SETTINGS, "POST", "/api/admin/metrics", { settings: { ...s, method: "mean" } })).status).toBe(403);
      expect((await call("admin", SETTINGS, "POST", "/api/admin/metrics", { settings: { ...s, minSample: 40 } })).status).toBe(422);
      const ok = await call("admin", SETTINGS, "POST", "/api/admin/metrics", { settings: { ...s, method: "mean", minSample: 3, maxAgeDays: 0 } });
      expect(ok.status).toBe(200);
    });

    it("manual clips give average views + ER; viewer can read but not write", async () => {
      const add = (views: number, likes: number, n: number) =>
        call("planner", CLIPS, "POST", "/api/creators/CR-0005/clips", { op: "add", platform: "tiktok", url: `https://www.tiktok.com/@x/video/90000000000000000${n}`, views, likes, comments: 0, shares: 0, publishedAt: "2026-11-2" + n }, "CR-0005");
      await add(1000, 100, 1);
      await add(2000, 100, 2);
      const r = await add(3000, 300, 3);
      expect(r.status).toBe(200);
      expect(r.json.creator.metrics.tiktok).toMatchObject({ avgViews: 2000, sampleSize: 3, source: "manual" });
      expect(r.json.creator.metrics.tiktok.er).toBeCloseTo((10 + 5 + 10) / 3, 1);
      // same URL again updates the same clip
      const again = await call("planner", CLIPS, "POST", "/api/creators/CR-0005/clips", { op: "add", platform: "tiktok", url: "https://www.tiktok.com/@x/video/900000000000000003?lang=vi", views: 6000, likes: 600 }, "CR-0005");
      expect(again.json.clips.filter((c: { platform: string }) => c.platform === "tiktok")).toHaveLength(3);
      expect(again.json.creator.metrics.tiktok.avgViews).toBe(3000);
      expect((await call("viewer", CLIPS, "POST", "/api/creators/CR-0005/clips", { op: "remove", id: again.json.clips[0].id }, "CR-0005")).status).toBe(403);
      const v = await call("viewer", CLIPS, "GET", "/api/creators/CR-0005/clips", undefined, "CR-0005");
      expect(v.status).toBe(200);
      expect(leaks(v.text)).toEqual([]);
      expect(v.text).not.toContain("enteredBy");
      expect(JSON.parse((await getText("/api/creators/CR-0005", "viewer")).text).creator.metrics.tiktok.avgViews).toBe(3000);
      expect((await call("planner", CLIPS, "POST", "/api/creators/CR-0005/clips", { op: "add", platform: "tiktok", url: "http://insecure.example/x", views: 1 }, "CR-0005")).status).toBe(422);
    });

    it("YouTube: channel refresh, then auto-tracking inside the window; excluded posts stay out", async () => {
      const { setYoutubeFetcherForTests } = await import("@/lib/metrics/youtube");
      const { channels } = await import("@/lib/db/schema");
      const CID = "UCabcdefghijklmnopqrstuv";
      const vid = (id: string, pub: string, views: number, likes: number) => `<entry><yt:videoId>${id}</yt:videoId><title>${id}</title><published>${pub}</published><media:starRating count="${likes}"/><media:statistics views="${views}"/></entry>`;
      let views = 5000;
      setYoutubeFetcherForTests(async (url) => {
        if (url.startsWith("https://www.youtube.com/@fakech")) return { status: 200, text: `<html>"externalId":"${CID}" <meta property="og:image" content="https://yt3.googleusercontent.com/av=s900"> "subscriberCountText":{"simpleText":"12.5K subscribers"}</html>` };
        if (url.includes("feeds/videos.xml?channel_id=" + CID))
          return { status: 200, text: `<feed>${vid("inWindow001", "2026-12-20T16:00:00+00:00", views, 100)}${vid("inWindow002", "2026-12-05T03:00:00+00:00", 3000, 30)}${vid("outWindow01", "2026-12-20T17:30:00+00:00", 999, 9)}${vid("oldVideo001", "2026-11-01T03:00:00+00:00", 1000, 10)}</feed>` };
        return { status: 404, text: "" };
      });
      await db().insert(channels).values({ creatorId: "CR-0006", platform: "youtube", url: "https://www.youtube.com/@fakech", label: "fake" }).onDuplicateKeyUpdate({ set: { url: "https://www.youtube.com/@fakech" } });
      const ref = await call("planner", CLIPS, "POST", "/api/creators/CR-0006/clips", { op: "refresh" }, "CR-0006");
      expect(ref.status).toBe(200);
      expect(ref.json.creator.metrics.youtube).toMatchObject({ avgViews: 2500, followersSeen: 12500, avatarUrl: "https://yt3.googleusercontent.com/av=s900", source: "auto" });

      const id = (await call("planner", CAMP, "POST", "/api/campaigns", { name: "Track test", brand: "B" })).json.campaign.id as string;
      await call("planner", CAMP_ID, "POST", `/api/campaigns/${id}`, { op: "addEntry", creatorId: "CR-0006" }, id);
      await call("planner", CAMP_ID, "POST", `/api/campaigns/${id}`, { op: "addEntry", creatorId: "CR-0005" }, id);
      await call("planner", CAMP_ID, "POST", `/api/campaigns/${id}`, { op: "setStage", creatorId: "CR-0006", stage: "closed" }, id);
      await call("planner", CAMP_ID, "POST", `/api/campaigns/${id}`, { op: "update", autoTrack: true, trackFrom: "2026-12-01", trackTo: "2026-12-20", kpiViews: 20000 }, id);
      const t1 = await call("planner", POSTS, "POST", `/api/campaigns/${id}/posts`, { op: "refresh" }, id);
      expect(t1.status).toBe(200);
      expect(t1.json.result).toMatchObject({ added: 2, creators: 1 });
      expect(t1.json.posts.map((p: { externalId: string }) => p.externalId).sort()).toEqual(["inWindow001", "inWindow002"]);
      // manual post for a TikTok creator in the campaign; not for a creator outside it
      expect((await call("planner", POSTS, "POST", `/api/campaigns/${id}/posts`, { op: "add", creatorId: "CR-0005", url: "https://www.tiktok.com/@x/video/777", views: 4000, likes: 40, postedAt: "2026-12-03" }, id)).status).toBe(200);
      expect((await call("planner", POSTS, "POST", `/api/campaigns/${id}/posts`, { op: "add", creatorId: "CR-0001", url: "https://www.tiktok.com/@x/video/778", views: 1 }, id)).status).toBe(422);
      expect((await call("planner", POSTS, "POST", `/api/campaigns/${id}/posts`, { op: "add", creatorId: "CR-0005", url: "https://www.tiktok.com/@x/video/777", views: 1 }, id)).status).toBe(409);
      // remove an auto post → excluded, and a new refresh does not bring it back
      const auto = t1.json.posts.find((p: { externalId: string }) => p.externalId === "inWindow002");
      await call("planner", POSTS, "POST", `/api/campaigns/${id}/posts`, { op: "remove", id: auto.id }, id);
      views = 8000;
      const t2 = await call("planner", POSTS, "POST", `/api/campaigns/${id}/posts`, { op: "refresh" }, id);
      expect(t2.json.result).toMatchObject({ added: 0, updated: 1 });
      expect(t2.json.posts).toHaveLength(3);
      expect(t2.json.posts.find((p: { id: string }) => p.id === auto.id).excluded).toBe(1);

      const rep = await call("planner", REPORT, "GET", `/api/campaigns/${id}/report`, undefined, id);
      expect(rep.status).toBe(200);
      expect(rep.json.campaign).toMatchObject({ views: 12000, posts: 2, booked: 1, kpiViews: 20000, kpiPct: 60 });
      expect(rep.json.campaign).toHaveProperty("cost");
      expect(rep.json.rows.find((r: { creatorId: string }) => r.creatorId === "CR-0006")).toMatchObject({ views: 8000, booked: true, expectedViews: 3250 }); // re-read after the 2nd refresh: (8000+3000+999+1000)/4
      // hidden campaign: 404 for others, viewer cannot write posts
      expect((await call("plannerOther", REPORT, "GET", `/api/campaigns/${id}/report`, undefined, id)).status).toBe(404);
      expect((await call("plannerOther", POSTS, "GET", `/api/campaigns/${id}/posts`, undefined, id)).status).toBe(404);
      expect((await call("viewer", POSTS, "POST", `/api/campaigns/${id}/posts`, { op: "refresh" }, id)).status).toBe(403);
      setYoutubeFetcherForTests(async () => ({ status: 404, text: "" }));
    });

    it("reports never give a viewer money fields; overview has the team table only for allCampaigns roles", async () => {
      const v = await call("viewer", REPORT, "GET", "/api/campaigns/L1/report", undefined, "L1");
      expect(v.status).toBe(200);
      expect(leaks(v.text)).toEqual([]);
      for (const k of ['"cost"', '"cpv"', '"cpm"', '"budget"', '"budgetPct"']) expect(v.text).not.toContain(k);
      const p = await call("planner", REPORT, "GET", "/api/campaigns/L1/report", undefined, "L1");
      expect(p.text).toContain('"cost"');
      const ov = await call("viewer", OVERVIEW, "GET", "/api/reports");
      expect(leaks(ov.text)).toEqual([]);
      for (const k of ['"cost"', '"cpv"', '"budget"']) expect(ov.text).not.toContain(k);
      expect(ov.json.team).toBeUndefined();
      expect(ov.json.campaigns.every((c: { name: string }) => c.name !== "Tech reviewers")).toBe(true);
      const pl = await call("planner", OVERVIEW, "GET", "/api/reports");
      expect(pl.json.scope).toBe("mine");
      expect(pl.json.team).toBeUndefined();
      expect(pl.text).not.toContain("Tech reviewers");
      const mg = await call("manager", OVERVIEW, "GET", "/api/reports");
      expect(mg.json.scope).toBe("team");
      expect(mg.json.team.length).toBeGreaterThan(0);
      expect(mg.text).toContain("Tech reviewers");
    });
  });

  describe("feedback and admin tools", () => {
    const call = async (as: string, mod: string, method: "GET" | "POST", path: string, body?: unknown) => {
      const m = (await import(mod)) as Record<string, (r: Request) => Promise<Response>>;
      const headers: Record<string, string> = method === "POST" ? { origin: ORIGIN, "x-csrf-token": cookies[as].csrf, "content-type": "application/json" } : {};
      const res = await m[method](req(path, { as, method, headers, body }));
      return { status: res.status, text: await res.clone().text(), json: (await res.json().catch(() => ({}))) as Record<string, any> };
    };
    const FB = "@/app/api/feedback/route";
    const AFB = "@/app/api/admin/feedback/route";

    it("anyone sends feedback and sees only their own; admin triages all", async () => {
      const f = { kind: "ux", prio: "should", doing: "Lọc creator", want: "Sắp theo tier", screen: "Khám phá", route: "#/kham-pha", appVersion: "1.0.0" };
      expect((await call("viewer", FB, "POST", "/api/feedback", f)).status).toBe(201);
      expect((await call("planner", FB, "POST", "/api/feedback", { ...f, want: "Planner muốn X" })).status).toBe(201);
      expect((await call("planner", FB, "POST", "/api/feedback", { ...f, kind: "nope" })).status).toBe(422);
      const mine = (await call("viewer", FB, "GET", "/api/feedback?all=1")).json.feedback;
      expect(mine).toHaveLength(1);
      expect(JSON.stringify(mine)).not.toContain("Planner muốn X");
      const all = (await call("admin", FB, "GET", "/api/feedback?all=1")).json.feedback;
      expect(all.length).toBeGreaterThanOrEqual(2);
      const id = all.find((x: { want: string }) => x.want === "Planner muốn X").id;
      expect((await call("planner", AFB, "POST", "/api/admin/feedback", { op: "update", id, status: "done" })).status).toBe(403);
      const upd = await call("admin", AFB, "POST", "/api/admin/feedback", { op: "update", id, status: "doing", adminNote: "Đang làm" });
      expect(upd.json.feedback.find((x: { id: number }) => x.id === id)).toMatchObject({ status: "doing", adminNote: "Đang làm" });
      expect((await call("planner", FB, "GET", "/api/feedback")).json.feedback[0]).toMatchObject({ status: "doing", adminNote: "Đang làm" });
    });

    it("system status, sync schedule and run-now are admin only; schedule gates the cron", async () => {
      for (const [mod, path] of [["@/app/api/admin/system/route", "/api/admin/system"], ["@/app/api/admin/sync/route", "/api/admin/sync"]]) {
        expect((await call("manager", mod, "GET", path)).status).toBe(403);
        expect((await call("admin", mod, "GET", path)).status).toBe(200);
      }
      const sys = (await call("admin", "@/app/api/admin/system/route", "GET", "/api/admin/system")).json;
      expect(sys.app.rss).toBeGreaterThan(0);
      expect(typeof sys.app.cpuPct).toBe("number");
      // Never the shared physical server's numbers (48 cores / host RAM / host disk) — only the hosting plan (null here).
      expect(sys).not.toHaveProperty("cpu");
      expect(sys).not.toHaveProperty("disk");
      expect(JSON.stringify(sys)).not.toMatch(/hostTotal|hostFree|"cores"/);
      expect(sys.plan === null || typeof sys.plan.cpu.used === "number").toBe(true);
      expect(sys.database.bytes).toBeGreaterThan(0);
      expect(sys.database.feedbackNew).toBeGreaterThanOrEqual(1);
      expect(sys.text ?? JSON.stringify(sys)).not.toMatch(/mysql:\/\/|password|DATABASE_URL/i);
      const SYNC = "@/app/api/admin/sync/route";
      const cur = (await call("admin", SYNC, "GET", "/api/admin/sync")).json.settings;
      expect((await call("admin", SYNC, "POST", "/api/admin/sync", { settings: { ...cur, importMinutes: 7 } })).status).toBe(422);
      expect((await call("manager", SYNC, "POST", "/api/admin/sync", { settings: cur })).status).toBe(403);
      const { isDue } = await import("@/lib/admin/sync-settings");
      expect((await call("admin", SYNC, "POST", "/api/admin/sync", { settings: { ...cur, metricsHours: 0, importMinutes: 0 } })).status).toBe(200);
      expect(await isDue("metrics")).toBe(false);
      expect(await isDue("import")).toBe(false);
      await call("admin", SYNC, "POST", "/api/admin/sync", { settings: { ...cur, metricsHours: 6 } });
      const { recordRun } = await import("@/lib/admin/sync-settings");
      await recordRun("metrics", new Date(Date.now() - 2 * 3600e3), true, { refreshed: 1 });
      expect(await isDue("metrics")).toBe(false); // ran 2 h ago, every 6 h
      expect(await isDue("metrics", new Date(Date.now() + 5 * 3600e3))).toBe(true);
      const snap = JSON.parse((await getText("/api/snapshot", "viewer")).text);
      expect(snap.config).toMatchObject({ clientRefreshMinutes: cur.clientRefreshMinutes, version: expect.any(String) });
      expect((await call("planner", "@/app/api/admin/jobs/route", "POST", "/api/admin/jobs", { job: "metrics" })).status).toBe(403);
    });

    it("roles: first login is viewer whatever the Sheet says; only Admin raises it; Sheet still gates access", async () => {
      const g = await fakeGoogle();
      setGoogleKeysForTests(g.keys);
      const sheet = new Map<string, Employee>([["newbie@markus.test", { email: "newbie@markus.test", name: "Người Mới", role: "admin" }]]);
      const dbDir = new DbDirectory();
      // The Sheet = this map + the seed users (the users table must NOT act as the allow-list here).
      const seeded = new Set<string>(SEED_USERS.map((u) => u.email));
      setDirectoryForTests({ lookup: async (e: string) => sheet.get(e.trim().toLowerCase()) ?? (seeded.has(e.trim().toLowerCase()) ? dbDir.lookup(e) : null) });
      const { POST } = await routes.google();
      const login = async () => {
        const tok = await g.sign({ email: "newbie@markus.test", email_verified: true, name: "Người Mới" }, { aud: process.env.GOOGLE_CLIENT_ID });
        const res = await POST(req("/api/auth/google", { method: "POST", headers: { origin: ORIGIN }, body: { idToken: tok } }));
        const body = await res.json();
        cookies.newbie = { cookie: (res.headers.get("set-cookie") || "").split(";")[0], csrf: body.csrf };
        return body;
      };
      try {
        expect((await login()).user).toMatchObject({ role: "viewer", perms: [] }); // Sheet says Admin → still viewer
        expect(JSON.parse((await getText("/api/auth/session", "newbie")).text).user.role).toBe("viewer");
        expect((await login()).user.role).toBe("viewer"); // second login does not pick up the Sheet role
        const U = "@/app/api/admin/users/route";
        expect((await call("newbie", U, "GET", "/api/admin/users")).status).toBe(403);
        expect((await call("planner", U, "POST", "/api/admin/users", { email: "newbie@markus.test", role: "admin" })).status).toBe(403);
        expect((await call("admin", U, "POST", "/api/admin/users", { email: "newbie@markus.test", role: "boss" })).status).toBe(422);
        expect((await call("admin", U, "POST", "/api/admin/users", { email: "admin@markus.test", role: "viewer" })).status).toBe(409); // not yourself
        const list = (await call("admin", U, "GET", "/api/admin/users")).json.users as { email: string; role: string }[];
        expect(list.find((x) => x.email === "newbie@markus.test")?.role).toBe("viewer");
        expect((await call("admin", U, "POST", "/api/admin/users", { email: "newbie@markus.test", role: "planner" })).status).toBe(200);
        expect(JSON.parse((await getText("/api/auth/session", "newbie")).text).user.role).toBe("planner"); // applies at once
        expect((await login()).user.role).toBe("planner"); // and survives the next login
        const audit = await db().select().from(auditLog).where(eq(auditLog.target, "user:newbie@markus.test"));
        expect(audit.at(-1)).toMatchObject({ action: "user.role", before: "viewer", after: "planner", actorEmail: "admin@markus.test" });
        sheet.delete("newbie@markus.test"); // removed from Employees → session no longer valid
        expect((await getText("/api/auth/session", "newbie")).status).toBe(401);
      } finally {
        setDirectoryForTests(undefined);
      }
    });

    it("roles: bootstrap — with no admin in the database a Sheet admin keeps admin; never remove the last admin", async () => {
      const g = await fakeGoogle();
      setGoogleKeysForTests(g.keys);
      const admins = (await db().select().from(users).where(eq(users.role, "admin"))).map((u) => u.email);
      const dbDir = new DbDirectory();
      setDirectoryForTests({ lookup: async (e: string) => (e.trim().toLowerCase() === "boot@markus.test" ? { email: "boot@markus.test", name: "Boot", role: "admin" } : dbDir.lookup(e)) });
      try {
        await db().update(users).set({ role: "manager" }).where(eq(users.role, "admin"));
        const tok = await g.sign({ email: "boot@markus.test", email_verified: true }, { aud: process.env.GOOGLE_CLIENT_ID });
        const { POST } = await routes.google();
        const body = await (await POST(req("/api/auth/google", { method: "POST", headers: { origin: ORIGIN }, body: { idToken: tok } }))).json();
        expect(body.user.role).toBe("admin");
        const { setUserRole } = await import("@/lib/admin/users");
        await expect(setUserRole("someone@markus.test", "boot@markus.test", "viewer")).rejects.toMatchObject({ status: 409 }); // last admin
      } finally {
        for (const e of admins) await db().update(users).set({ role: "admin" }).where(eq(users.email, e));
        await db().delete(users).where(eq(users.email, "boot@markus.test"));
        setDirectoryForTests(undefined);
      }
    });

    it("tutorial reset: epoch follows the build, admin can reset everyone now or turn off reset-on-deploy", async () => {
      const TUT = "@/app/api/admin/tutorial/route";
      const epoch = async () => JSON.parse((await getText("/api/snapshot", "viewer")).text).config.tutorialEpoch as string;
      expect((await call("manager", TUT, "GET", "/api/admin/tutorial")).status).toBe(403);
      expect((await call("planner", TUT, "POST", "/api/admin/tutorial", { resetNow: true })).status).toBe(403);
      expect((await call("admin", TUT, "POST", "/api/admin/tutorial", { resetNow: "yes" })).status).toBe(422);
      const e0 = await epoch();
      const { buildId } = await import("@/lib/admin/system");
      expect(e0.startsWith(buildId() + "|")).toBe(true); // default: a new build = a new epoch
      const r = await call("admin", TUT, "POST", "/api/admin/tutorial", { resetNow: true });
      expect(r.status).toBe(200);
      const e1 = await epoch();
      expect(e1).not.toBe(e0);
      expect(r.json.epoch).toBe(e1);
      expect((await call("admin", TUT, "POST", "/api/admin/tutorial", { resetOnDeploy: false })).json.settings.resetOnDeploy).toBe(false);
      const e2 = await epoch();
      expect(e2.startsWith("-|")).toBe(true); // no longer tied to the build
      const { tutorialEpoch, getTutorialSettings } = await import("@/lib/admin/tutorial");
      expect(tutorialEpoch(await getTutorialSettings(), "another-build")).toBe(e2);
      await call("admin", TUT, "POST", "/api/admin/tutorial", { resetOnDeploy: true });
    });
  });

  describe("session, CSRF and origin", () => {
    it("session returns role, perms and csrf", async () => {
      const r = JSON.parse((await getText("/api/auth/session", "planner")).text);
      expect(r.user).toMatchObject({ email: emailOf("Ngọc Anh"), role: "planner" });
      expect(r.user.perms).toContain("price");
      expect(r.csrf).toHaveLength(64);
    });

    it("role is re-read on each request (directory change applies at once)", async () => {
      const s = await loginAs(emailOf("Minh Đức"));
      cookies.temp = s;
      await db().update(users).set({ role: "viewer" }).where(eq(users.email, emailOf("Minh Đức")));
      expect(leaks((await getText("/api/creators", "temp")).text)).toEqual([]);
      await db().delete(users).where(eq(users.email, emailOf("Minh Đức")));
      expect((await getText("/api/creators", "temp")).status).toBe(401);
    });

    it("expired sessions are refused", async () => {
      const s = await loginAs(emailOf("Thu Trang"));
      cookies.old = s;
      await db()
        .update(sessions)
        .set({ createdAt: new Date(Date.now() - 25 * 3600_000) })
        .where(eq(sessions.email, emailOf("Thu Trang")));
      expect((await getText("/api/creators", "old")).status).toBe(401);
    });

    it("logout needs same origin and the CSRF token", async () => {
      cookies.out = await loginAs(emailOf("Khánh Vy"));
      const { POST } = await routes.logout();
      const noCsrf = await POST(req("/api/auth/logout", { as: "out", method: "POST", headers: { origin: ORIGIN } }));
      expect(noCsrf.status).toBe(403);
      const badOrigin = await POST(
        req("/api/auth/logout", { as: "out", method: "POST", headers: { origin: "https://evil.example", "x-csrf-token": cookies.out.csrf } }),
      );
      expect(badOrigin.status).toBe(403);
      const ok = await POST(req("/api/auth/logout", { as: "out", method: "POST", headers: { origin: ORIGIN, "x-csrf-token": cookies.out.csrf } }));
      expect(ok.status).toBe(200);
      expect(ok.headers.get("set-cookie")).toMatch(/Max-Age=0/);
      expect((await getText("/api/auth/session", "out")).status).toBe(401);
    });
  });

  describe("Google login", () => {
    it("known employee → session cookie scoped to /v2, HttpOnly", async () => {
      const g = await fakeGoogle();
      setGoogleKeysForTests(g.keys);
      const tok = await g.sign({ email: "NgocAnh@markus.test", email_verified: true, name: "Ngọc Anh" }, { aud: process.env.GOOGLE_CLIENT_ID });
      const { POST } = await routes.google();
      const res = await POST(req("/api/auth/google", { method: "POST", headers: { origin: ORIGIN }, body: { idToken: tok } }));
      expect(res.status).toBe(200);
      const sc = res.headers.get("set-cookie") || "";
      expect(sc).toMatch(/^mkv2_sid=/);
      expect(sc).toMatch(/Path=\/v2/);
      expect(sc).toMatch(/HttpOnly/);
      expect(sc).toMatch(/SameSite=Lax/);
      const body = await res.json();
      expect(body.user.role).toBe("planner");
    });

    it("unknown email → 401 not_authorized; wrong audience → 401; cross-origin → 403", async () => {
      const g = await fakeGoogle();
      setGoogleKeysForTests(g.keys);
      const { POST } = await routes.google();
      const unknown = await g.sign({ email: "stranger@else.test", email_verified: true }, { aud: process.env.GOOGLE_CLIENT_ID });
      const r1 = await POST(req("/api/auth/google", { method: "POST", headers: { origin: ORIGIN }, body: { idToken: unknown } }));
      expect(r1.status).toBe(401);
      expect((await r1.json()).error).toBe("not_authorized");
      const wrongAud = await g.sign({ email: "ngocanh@markus.test", email_verified: true }, { aud: "someone-else" });
      expect((await POST(req("/api/auth/google", { method: "POST", headers: { origin: ORIGIN }, body: { idToken: wrongAud } }))).status).toBe(401);
      const good = await g.sign({ email: "ngocanh@markus.test", email_verified: true }, { aud: process.env.GOOGLE_CLIENT_ID });
      expect((await POST(req("/api/auth/google", { method: "POST", headers: { origin: "https://evil.example" }, body: { idToken: good } }))).status).toBe(403);
    });
  });

  it("health: anonymous gets ok only; admin gets runtime detail", async () => {
    const anon = JSON.parse((await getText("/api/health")).text);
    expect(anon).toEqual({ ok: true, db: { ok: true } });
    const admin = JSON.parse((await getText("/api/health", "admin")).text);
    expect(admin.node).toMatch(/^v\d+/);
    expect(admin.db.version).toMatch(/MariaDB/);
  });
});
