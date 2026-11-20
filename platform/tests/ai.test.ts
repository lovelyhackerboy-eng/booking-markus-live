// AI endpoints with a fake DeepSeek: what we SEND (never contacts/notes, cache-friendly prefix) and what we accept back
// (validated, nothing written to campaigns), plus the deterministic ranking and the saved campaign thread.
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setDirectoryForTests } from "@/lib/auth/directory";
import { createSession } from "@/lib/auth/session";
import { setFetcherForTests } from "@/lib/ai/deepseek";
import { validate } from "@/lib/ai/search";
import { rankForBrief } from "@/lib/ai/rank";
import { catalogOf, type Compact } from "@/lib/ai/creators";
import { closeDb, db, pool } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";
import { assertLocalDatabase, SEED_USERS, seedAll } from "@/lib/db/seed-data";

const TEST_DB = process.env.TEST_DATABASE_URL;
const ORIGIN = "http://localhost:3100";

const mk = (id: string, over: Partial<Compact>): Compact => ({ id, name: id, tier: "Micro", categories: ["Beauty"], region: "Hà Nội", hero: "tiktok", heroFollowers: 50000, followers: { tiktok: 50000 }, rateFrom: 5000000, rateBySow: { video: 5000000 }, relationship: "Chưa liên hệ", ...over });

describe("validate (AI search answer)", () => {
  const cat = catalogOf([mk("a", { categories: ["Beauty", "F&B Review"] })]);
  it("keeps only allowed values; unknown ones go to unsupported", () => {
    const r = validate({ categories: ["beauty", "Gaming"], regions: ["Hà Nội", "Paris"], tiers: ["Micro"], rateMax: 20000000 }, cat, "planner");
    expect(r.patch.categories).toEqual(["Beauty"]);
    expect(r.patch.regions).toEqual(["Hà Nội"]);
    expect(r.patch.rateMax).toBe(20000000);
    expect(r.unsupported).toEqual(expect.arrayContaining(["Gaming", "Paris"]));
  });
  it("drops price criteria for a viewer and says so", () => {
    const r = validate({ rateMax: 20000000, rateSow: "video" }, cat, "viewer");
    expect(r.patch.rateMax).toBeUndefined();
    expect(r.priceSkipped).toBe(true);
  });
  it("survives garbage", () => expect(validate("nope", cat, "admin").patch.categories).toEqual([]));
});

describe("rankForBrief (deterministic)", () => {
  const list = [
    mk("big-expensive", { heroFollowers: 1_000_000, rateFrom: 40_000_000 }),
    mk("mid-cheap-worked", { heroFollowers: 300_000, rateFrom: 6_000_000, relationship: "Đã hợp tác" }),
    mk("small", { heroFollowers: 20_000, rateFrom: 2_000_000 }),
    mk("no-price", { heroFollowers: 200_000, rateFrom: null }),
    mk("other-city", { region: "TP.HCM", heroFollowers: 900_000 }),
    mk("in-campaign", { heroFollowers: 800_000, rateFrom: 3_000_000 }),
  ];
  const brief = { categories: ["Beauty"], regions: ["Hà Nội"], budgetPerCreator: 10_000_000, count: 3, excludeIds: ["in-campaign"] };
  it("applies hard filters (region, budget, exclusions) and ranks with reasons", () => {
    const r = rankForBrief(list, brief, true);
    const ids = r.items.map((x) => x.id);
    expect(ids).not.toContain("big-expensive");
    expect(ids).not.toContain("other-city");
    expect(ids).not.toContain("in-campaign");
    expect(ids[0]).toBe("mid-cheap-worked");
    expect(r.items[0].why.join(" ")).toMatch(/Đã hợp tác/);
    expect(rankForBrief(list, brief, true)).toEqual(r); // same brief → same answer
  });
  it("without price permission: no budget filter, no price in the output", () => {
    const r = rankForBrief(list, { ...brief, budgetPerCreator: 1 }, false);
    expect(r.items.map((x) => x.id)).toContain("big-expensive");
    expect(JSON.stringify(r)).not.toMatch(/"price"|Giá từ/);
  });
});

describe.skipIf(!TEST_DB)("AI endpoints (fake DeepSeek)", () => {
  const sent: { messages: { role: string; content: string }[] }[] = [];
  let script: unknown[] = [];
  const cookies: Record<string, { cookie: string; csrf: string }> = {};
  const login = async (email: string) => {
    const u = SEED_USERS.find((x) => x.email === email)!;
    const { cookie, csrf } = await createSession({ email: u.email, name: u.name, role: u.role as "admin" | "manager" | "planner" | "viewer" });
    return { cookie: cookie.split(";")[0], csrf };
  };
  const call = async (as: string, route: string, method: string, body?: unknown, query = "") => {
    const mod = (await import(route)) as Record<string, (r: Request) => Promise<Response>>;
    const headers: Record<string, string> = { cookie: cookies[as].cookie, "x-csrf-token": cookies[as].csrf, origin: ORIGIN, "content-type": "application/json" };
    return mod[method](new Request(ORIGIN + "/v2/api/x" + query, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }));
  };
  const AGENT = "@/app/api/ai/agent/route";
  const SEARCH = "@/app/api/ai/search/route";
  const reply = (message: Record<string, unknown>) => Response.json({ model: "deepseek-v4-flash", choices: [{ message }], usage: { prompt_tokens: 1000, prompt_cache_hit_tokens: 800, completion_tokens: 50 } });

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    process.env.APP_ORIGIN = ORIGIN;
    process.env.DIRECTORY = "db";
    process.env.DEEPSEEK_API_KEY = "test-key";
    assertLocalDatabase(TEST_DB, process.env.NODE_ENV);
    setDirectoryForTests(undefined);
    await migrate(db(), { migrationsFolder: path.resolve(__dirname, "..", "drizzle") });
    await seedAll(db());
    cookies.planner = await login("ngocanh@markus.test");
    cookies.manager = await login("haiyen@markus.test");
    cookies.viewer = await login("khach@markus.test");
  });
  beforeEach(() => {
    sent.length = 0;
    script = [];
    setFetcherForTests((async (_u: unknown, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body ?? "{}")));
      return reply((script.shift() as Record<string, unknown>) ?? { content: "ok" });
    }) as typeof fetch);
  });
  afterAll(async () => {
    setFetcherForTests(null);
    delete process.env.DEEPSEEK_API_KEY;
    await closeDb();
  });

  const PRIVATE = [/555 1\d\d/, /example\.com/i, /lumi-mcn/i, /Giao bài sớm/, /Thương lượng:/, /Cọc 50%/];
  const text = () => JSON.stringify(sent);

  it("AI search: only the query + allowed values go out; same question again is served from cache", async () => {
    script = [{ content: JSON.stringify({ categories: ["Mẹ & Bé", "Không có"], regions: ["Hà Nội"] }) }];
    const j = await (await call("planner", SEARCH, "POST", { query: "mẹ bỉm  Hà Nội" })).json();
    expect(j.patch.categories).toEqual(["Mẹ & Bé"]);
    expect(j.unsupported).toContain("Không có");
    expect(j.cached).toBe(false);
    for (const re of PRIVATE) expect(text()).not.toMatch(re);
    expect(text()).not.toMatch(/Nguyễn Thu Hà/);
    const again = await (await call("planner", SEARCH, "POST", { query: "MẸ BỈM hà nội" })).json();
    expect(again.cached).toBe(true);
    expect(again.patch).toEqual(j.patch);
    expect(sent).toHaveLength(1);
    const [row] = await db().select().from(auditLog).where(eq(auditLog.action, "ai.search")).orderBy(desc(auditLog.id)).limit(2);
    expect(row.after).toMatch(/"cached":true/);
  });

  it("agent in a campaign: ranks on the server, proposes only real creators, saves the thread, writes nothing to the campaign", async () => {
    const before = (await pool().query("SELECT (SELECT COUNT(*) FROM campaign_candidates) a, (SELECT COUNT(*) FROM campaign_entries) b"))[0];
    script = [
      { content: null, tool_calls: [{ id: "t1", type: "function", function: { name: "rank_for_brief", arguments: JSON.stringify({ categories: ["Mẹ & Bé"], count: 3, budgetPerCreator: 30000000 }) } }, { id: "t0", type: "function", function: { name: "save_brief", arguments: JSON.stringify({ categories: ["Mẹ & Bé"], count: 3 }) } }] },
      { content: null, tool_calls: [{ id: "t2", type: "function", function: { name: "propose_candidates", arguments: JSON.stringify({ items: [{ id: "CR-0003", reason: "Mẹ bỉm Hà Nội" }, { id: "CR-FAKE", reason: "bịa" }] }) } }] },
      { content: "Lê Phương Thảo — mẹ bỉm Hà Nội." },
    ];
    const res = await call("planner", AGENT, "POST", { campaignId: "L1", messages: [{ role: "user", content: "Tìm 3 mẹ bỉm cho Vinamilk" }] });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.proposals.map((p: { id: string }) => p.id)).toEqual(["CR-0003"]);
    expect(j.brief).toMatchObject({ categories: ["Mẹ & Bé"], count: 3 });
    // ranking result went to the model; creators already in L1 (CR-0001 entry, CR-0026 candidate) were excluded
    const toolMsg = sent[1].messages.find((m) => m.role === "tool")!.content;
    expect(toolMsg).toMatch(/"score"/);
    expect(toolMsg).not.toMatch(/"CR-0001"|"CR-0026"/);
    for (const re of PRIVATE) expect(text()).not.toMatch(re);
    const after = (await pool().query("SELECT (SELECT COUNT(*) FROM campaign_candidates) a, (SELECT COUNT(*) FROM campaign_entries) b"))[0];
    expect(after).toEqual(before);
    // thread saved and shared: the manager sees it
    const t = await (await call("manager", AGENT, "GET", undefined, "?campaignId=L1")).json();
    expect(t.messages.map((m: { role: string }) => m.role)).toEqual(["user", "assistant"]);
    expect(t.messages[1].proposals[0].id).toBe("CR-0003");
    expect(t.brief.count).toBe(3);
    // tokens recorded
    const [row] = await db().select().from(auditLog).where(eq(auditLog.action, "ai.agent")).orderBy(desc(auditLog.id)).limit(1);
    expect(row.after).toMatch(/"tokens":\{"prompt":3000,"cacheHit":2400,"completion":150\}/);
  });

  it("follow-up question: history and brief come from the server thread; the system prompt prefix is identical across users", async () => {
    script = [{ content: "Thêm 1 người nữa nhé." }];
    await call("manager", AGENT, "POST", { campaignId: "L1", messages: [{ role: "user", content: "Còn ai khác không?" }] });
    const body = sent[0].messages;
    expect(body.map((m) => m.content).join("\n")).toContain("Tìm 3 mẹ bỉm cho Vinamilk"); // earlier turn by the planner
    expect(body[1].content).toContain("Brief đã lưu");
    sent.length = 0;
    script = [{ content: "ok" }];
    await call("planner", AGENT, "POST", { campaignId: "L4", messages: [{ role: "user", content: "hi" }] });
    const other = sent[0].messages;
    expect(other[0].content).toBe(body[0].content); // same fixed prefix → DeepSeek cache hit
    expect(other[1].content).not.toBe(body[1].content);
  });

  it("hidden campaign → 404 (GET and POST); viewer → 403; clearing works", async () => {
    expect((await call("planner", AGENT, "POST", { campaignId: "L3", messages: [{ role: "user", content: "x" }] })).status).toBe(404);
    expect((await call("planner", AGENT, "GET", undefined, "?campaignId=L3")).status).toBe(404);
    expect((await call("viewer", AGENT, "POST", { messages: [{ role: "user", content: "hi" }] })).status).toBe(403);
    expect((await call("viewer", AGENT, "GET", undefined, "?campaignId=L1")).status).toBe(403);
    expect(sent).toHaveLength(0);
    expect((await call("planner", AGENT, "DELETE", undefined, "?campaignId=L1")).status).toBe(200);
    expect((await (await call("planner", AGENT, "GET", undefined, "?campaignId=L1")).json()).messages).toEqual([]);
  });

  it("viewer AI search: the model is told not to use prices, and prices are stripped", async () => {
    script = [{ content: JSON.stringify({ categories: ["Beauty"], rateMax: 10000000 }) }];
    const j = await (await call("viewer", SEARCH, "POST", { query: "beauty dưới 10 triệu" })).json();
    expect(j.patch.rateMax).toBeUndefined();
    expect(j.priceSkipped).toBe(true);
    expect(text()).toContain("KHÔNG dùng giá");
  });

  it("DeepSeek down → 502 ai_unavailable (client falls back to rules)", async () => {
    setFetcherForTests((async () => new Response("err", { status: 500 })) as typeof fetch);
    const res = await call("planner", SEARCH, "POST", { query: "fitness hà nội" });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("ai_unavailable");
  });
});
