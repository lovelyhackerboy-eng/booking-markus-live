// AI endpoints with a fake DeepSeek: what we SEND (never contacts/notes) and what we accept back (validated, no writes).
import path from "node:path";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setDirectoryForTests } from "@/lib/auth/directory";
import { createSession } from "@/lib/auth/session";
import { setFetcherForTests } from "@/lib/ai/deepseek";
import { validate } from "@/lib/ai/search";
import { catalogOf, type Compact } from "@/lib/ai/creators";
import { closeDb, db, pool } from "@/lib/db/client";
import { assertLocalDatabase, SEED_USERS, seedAll } from "@/lib/db/seed-data";

const TEST_DB = process.env.TEST_DATABASE_URL;
const ORIGIN = "http://localhost:3100";

describe("validate (AI search answer)", () => {
  const cat = catalogOf([
    { id: "a", name: "A", tier: "Micro", categories: ["Beauty", "F&B Review"], region: "Hà Nội", hero: "tiktok", heroFollowers: 1, followers: {} } as Compact,
  ]);
  it("keeps only allowed values; unknown ones go to unsupported", () => {
    const r = validate({ categories: ["beauty", "Gaming"], regions: ["Hà Nội", "Paris"], tiers: ["Micro"], rateMax: 20000000, understood: ["x"] }, cat, "planner");
    expect(r.patch.categories).toEqual(["Beauty"]);
    expect(r.patch.regions).toEqual(["Hà Nội"]);
    expect(r.patch.rateMax).toBe(20000000);
    expect(r.unsupported).toEqual(expect.arrayContaining(["Gaming", "Paris"]));
  });
  it("drops price criteria for a viewer and says so", () => {
    const r = validate({ rateMax: 20000000, rateSow: "video" }, cat, "viewer");
    expect(r.patch.rateMax).toBeUndefined();
    expect(r.patch.rateSow).toBeUndefined();
    expect(r.priceSkipped).toBe(true);
  });
  it("survives garbage", () => {
    expect(validate("nope", cat, "admin").patch.categories).toEqual([]);
  });
});

describe.skipIf(!TEST_DB)("AI endpoints (fake DeepSeek)", () => {
  const sent: string[] = [];
  let script: unknown[] = [];
  const cookies: Record<string, { cookie: string; csrf: string }> = {};
  const login = async (email: string) => {
    const u = SEED_USERS.find((x) => x.email === email)!;
    const { cookie, csrf } = await createSession({ email: u.email, name: u.name, role: u.role as "admin" | "manager" | "planner" | "viewer" });
    return { cookie: cookie.split(";")[0], csrf };
  };
  const post = async (as: string, route: string, body: unknown) => {
    const mod = (await import(route)) as { POST: (r: Request) => Promise<Response> };
    return mod.POST(new Request(ORIGIN + "/v2/api/x", { method: "POST", headers: { cookie: cookies[as].cookie, "x-csrf-token": cookies[as].csrf, origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify(body) }));
  };
  const reply = (message: Record<string, unknown>) => Response.json({ model: "deepseek-v4-flash", choices: [{ message }] });

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
    cookies.viewer = await login("khach@markus.test");
    setFetcherForTests((async (_u: unknown, init?: RequestInit) => {
      sent.push(String(init?.body ?? ""));
      const next = script.shift();
      return reply((next as Record<string, unknown>) ?? { content: "ok" });
    }) as typeof fetch);
  });
  beforeEach(() => {
    sent.length = 0;
    script = [];
  });
  afterAll(async () => {
    setFetcherForTests(null);
    delete process.env.DEEPSEEK_API_KEY;
    await closeDb();
  });

  const PRIVATE = [/555 1\d\d/, /example\.com/i, /lumi-mcn/i, /Giao bài sớm/, /Thương lượng:/, /Cọc 50%/];

  it("AI search: only the query and allowed values go out; answer is validated", async () => {
    script = [{ content: JSON.stringify({ categories: ["Mẹ & Bé", "Không có"], regions: ["Hà Nội"], understood: ["Mẹ & bé ở Hà Nội"] }) }];
    const res = await post("planner", "@/app/api/ai/search/route", { query: "mẹ bỉm hà nội" });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.patch.categories).toEqual(["Mẹ & Bé"]);
    expect(j.unsupported).toContain("Không có");
    expect(sent).toHaveLength(1);
    for (const re of PRIVATE) expect(sent[0]).not.toMatch(re);
    expect(sent[0]).not.toMatch(/Nguyễn Thu Hà/); // no creator names either
  });

  it("agent: tools run server-side, proposals limited to real creators, contacts never sent, nothing written", async () => {
    const before = await pool().query("SELECT (SELECT COUNT(*) FROM campaign_candidates) a, (SELECT COUNT(*) FROM campaign_entries) b");
    script = [
      { content: null, tool_calls: [{ id: "t1", type: "function", function: { name: "search_creators", arguments: JSON.stringify({ categories: ["Mẹ & Bé"], limit: 5 }) } }] },
      { content: null, tool_calls: [{ id: "t2", type: "function", function: { name: "get_campaign", arguments: JSON.stringify({ campaignId: "L3" }) } }, { id: "t3", type: "function", function: { name: "propose_candidates", arguments: JSON.stringify({ items: [{ id: "CR-0001", reason: "Mẹ bỉm Hà Nội" }, { id: "CR-FAKE", reason: "bịa" }] }) } }] },
      { content: "Gợi ý: Nguyễn Thu Hà." },
    ];
    const res = await post("planner", "@/app/api/ai/agent/route", { campaignId: "L1", messages: [{ role: "user", content: "Tìm mẹ bỉm cho Vinamilk" }] });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.reply).toContain("Nguyễn Thu Hà");
    expect(j.proposals.map((p: { id: string }) => p.id)).toEqual(["CR-0001"]);
    // what the model received: search results, a refusal for the hidden campaign L3, no private data
    const all = sent.join("\n");
    expect(all).toContain("Nguyễn Thu Hà");
    expect(all).toContain("Không tìm thấy campaign");
    expect(all).not.toContain("Tech reviewers");
    for (const re of PRIVATE) expect(all).not.toMatch(re);
    const after = await pool().query("SELECT (SELECT COUNT(*) FROM campaign_candidates) a, (SELECT COUNT(*) FROM campaign_entries) b");
    expect(after[0]).toEqual(before[0]);
  });

  it("agent is for edit roles only; viewer gets 403 without any AI call", async () => {
    const res = await post("viewer", "@/app/api/ai/agent/route", { messages: [{ role: "user", content: "hi" }] });
    expect(res.status).toBe(403);
    expect(sent).toHaveLength(0);
  });

  it("viewer AI search: the model is told not to use prices, and prices are stripped", async () => {
    script = [{ content: JSON.stringify({ categories: ["Beauty"], rateMax: 10000000 }) }];
    const j = await (await post("viewer", "@/app/api/ai/search/route", { query: "beauty dưới 10 triệu" })).json();
    expect(j.patch.rateMax).toBeUndefined();
    expect(j.priceSkipped).toBe(true);
    expect(sent[0]).toContain("KHÔNG dùng giá");
  });

  it("DeepSeek down → 502 ai_unavailable (client falls back to rules)", async () => {
    setFetcherForTests((async () => new Response("err", { status: 500 })) as typeof fetch);
    const res = await post("planner", "@/app/api/ai/search/route", { query: "beauty" });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("ai_unavailable");
  });
});
