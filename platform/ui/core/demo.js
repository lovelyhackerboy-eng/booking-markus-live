// core/demo.js — DỮ LIỆU MẪU NGẪU NHIÊN cho phần hướng dẫn (core/tour.js) + bộ trả lời API giả.
// Không chứa người thật: tên ghép ngẫu nhiên, handle @demo_…, không số điện thoại / email. Mỗi lần mở hướng dẫn là
// một bộ mới. demoApi() trả lời mọi lời gọi api() khi đang ở chế độ hướng dẫn: GET trả dữ liệu mẫu, ghi thì
// "thành công" trên máy nhưng không gửi gì lên máy chủ.

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rnd = (a, b) => Math.round(a + Math.random() * (b - a));
const HO = ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Võ", "Đặng", "Bùi", "Đỗ", "Ngô"];
const DEM = ["Minh", "Thu", "Gia", "Bảo", "Ngọc", "Khánh", "Hải", "Thảo", "Anh", "Quỳnh"];
const TEN = ["An", "Vy", "Linh", "Nam", "Trang", "Phúc", "Hân", "Long", "Mai", "Tú", "Nhi", "Khoa"];
const CATS = ["Beauty", "Mẹ & bé", "Food", "Lifestyle", "Tech", "Fashion", "Travel", "Fitness"];
const CITIES = ["Thành phố Hồ Chí Minh", "Hà Nội", "Đà Nẵng", "Cần Thơ", "Hải Phòng"];
const PLATS = ["tiktok", "tiktok", "tiktok", "youtube", "facebook", "instagram"];
const day = (n) => new Date(Date.now() - n * 864e5).toISOString();
const ymd = (n) => day(n).slice(0, 10);

let DB = null; // bộ dữ liệu của lần hướng dẫn hiện tại

export function makeDemo() {
  const used = new Set();
  const creators = Array.from({ length: 24 }, (_, i) => {
    let name;
    do name = `${pick(HO)} ${pick(DEM)} ${pick(TEN)}`; while (used.has(name));
    used.add(name);
    const id = `DEMO-${String(i + 1).padStart(3, "0")}`;
    const hero = pick(PLATS);
    const f = pick([rnd(8e3, 9e4), rnd(1e5, 4.5e5), rnd(5e5, 1.2e6)]);
    const views = Math.round(f * (0.08 + Math.random() * 0.4));
    const channels = { [hero]: { url: `https://example.com/@demo_${i + 1}`, label: `@demo_${i + 1}`, followers: f, followersSource: "sheet", followersUpdatedAt: day(rnd(1, 20)) } };
    if (hero !== "tiktok" && Math.random() < 0.5) channels.tiktok = { url: `https://example.com/@demo_${i + 1}_tt`, label: `@demo_${i + 1}`, followers: Math.round(f * 0.6), followersSource: "sheet", followersUpdatedAt: day(5) };
    return {
      id, name, alias: "", tier: f >= 1e6 ? "Celeb" : f >= 5e5 ? "Macro" : f >= 1e5 ? "Mid-Tier" : "Micro",
      primaryCategory: pick(CATS), secondaryCategory: "", creatorType: pick(["KOL", "KOC", "Creator"]), castingProfile: "",
      gender: pick(["Nữ", "Nam"]), yearOfBirth: null, baseLocation: pick(CITIES), representation: pick(["Tự quản lý", "Manager", "MCN"]),
      heroPlatform: hero, relationshipStatus: pick(["Đã hợp tác", "Đã báo giá", "Chưa liên hệ"]), owner: "", note: "",
      channels,
      metrics: { [hero]: { avgViews: views, er: Math.round((2 + Math.random() * 8) * 100) / 100, sampleSize: 10, source: hero === "youtube" ? "auto" : "manual", computedAt: day(rnd(0, 3)), avatarUrl: null, followersSeen: null } },
      rates: [{ platform: hero, sow: "video", amount: Math.round((f / 1000) * rnd(25, 60)) * 1000, amountText: "", terms: "", source: "Demo", updatedAt: day(10) }],
      contact: {}, notes: [], syncedAt: day(1), updatedAt: day(1),
    };
  });
  const ids = creators.map((c) => c.id);
  const steps = [
    { key: "none", label: "Chưa liên hệ", final: false }, { key: "zalo", label: "Đã liên hệ qua Zalo", final: false },
    { key: "manager", label: "Qua Manager / MCN", final: false }, { key: "quoted", label: "Đã báo giá", final: false }, { key: "closed", label: "Đã chốt", final: true },
  ];
  const camp = (id, name, brand, status, cand, ent, extra = {}) => ({
    id, name, brand, owner: "Bạn", members: [], isMine: true, canManage: true, status, steps, kpiViews: extra.kpiViews ?? 2_000_000,
    description: extra.description || "", budget: extra.budget ?? 150_000_000, startDate: extra.startDate || null, endDate: extra.endDate || null,
    autoTrack: !!extra.trackFrom, trackFrom: extra.trackFrom || null, trackTo: extra.trackTo || null, doneAt: extra.doneAt || null,
    candidates: cand.map((c) => ({ creatorId: c, sow: "video" })),
    entries: ent.map(([c, stage], i) => ({ creatorId: c, stage, position: i, addedAt: day(rnd(2, 12)) })),
    createdAt: day(20),
  });
  const campaigns = [
    camp("demo-run", "Demo · Sữa chua Tết 2027", "Brand A", "running", ids.slice(0, 4), [[ids[4], "none"], [ids[5], "none"], [ids[6], "zalo"], [ids[7], "manager"], [ids[8], "quoted"], [ids[9], "closed"], [ids[10], "closed"]],
      { description: "Ví dụ: 6–8 creator mẹ & bé, video 60s, đăng trong tháng 12.", startDate: ymd(10), endDate: ymd(-20), trackFrom: ymd(7), trackTo: ymd(-14) }),
    camp("demo-draft", "Demo · Ra mắt son mới (nháp)", "Brand B", "draft", ids.slice(11, 16), []),
    camp("demo-done", "Demo · Back to school (đã xong)", "Brand C", "done", [], [[ids[16], "closed"], [ids[17], "closed"], [ids[18], "closed"], [ids[19], "quoted"]],
      { startDate: ymd(60), endDate: ymd(30), trackFrom: ymd(55), trackTo: ymd(30), doneAt: day(28), kpiViews: 1_500_000 }),
  ];
  const post = (cid, c, n, plat, views) => ({ id: `po_demo_${cid}_${n}`, campaignId: cid, creatorId: c.id, platform: plat, url: `https://example.com/demo/${c.id}/${n}`, externalId: `${c.id}-${n}`, title: `Clip ${n} · ${c.name}`, postedAt: day(rnd(1, 6)), views, likes: Math.round(views * 0.05), comments: Math.round(views * 0.004), shares: Math.round(views * 0.002), source: plat === "youtube" ? "auto" : "manual", excluded: 0 });
  const byId = new Map(creators.map((c) => [c.id, c]));
  const posts = {
    "demo-run": [post("demo-run", byId.get(ids[9]), 1, byId.get(ids[9]).heroPlatform, rnd(150e3, 450e3)), post("demo-run", byId.get(ids[10]), 1, byId.get(ids[10]).heroPlatform, rnd(80e3, 300e3))],
    "demo-draft": [],
    "demo-done": [16, 17, 18].map((k, i) => post("demo-done", byId.get(ids[k]), i + 1, byId.get(ids[k]).heroPlatform, rnd(200e3, 600e3))),
  };
  DB = { creators, campaigns, posts, byId };
  return { creators, campaigns, bookings: [], activeListId: "demo-run" };
}

const SETTINGS = { sampleSize: 10, maxAgeDays: 90, method: "median", trimPct: 10, minSample: 3, erBase: "views", erLikes: true, erComments: true, erShares: true, autoRefresh: true };
const sum = (xs) => xs.reduce((s, x) => s + (x || 0), 0);

function report(c) {
  const final = "closed";
  const pst = DB.posts[c.id] || [];
  const views = sum(pst.map((p) => p.views)), inter = sum(pst.map((p) => p.likes + p.comments + p.shares));
  const booked = c.entries.filter((e) => e.stage === final);
  const exp = (id) => Object.values(DB.byId.get(id)?.metrics || {})[0]?.avgViews || 0;
  const cost = sum(booked.map((e) => DB.byId.get(e.creatorId)?.rates[0]?.amount));
  const out = { id: c.id, name: c.name, brand: c.brand, status: c.status, kpiViews: c.kpiViews, creators: c.entries.length, booked: booked.length, posts: pst.length,
    expectedViews: sum(booked.map((e) => exp(e.creatorId))), views, interactions: inter, er: views ? Math.round((inter / views) * 10000) / 100 : null,
    kpiPct: c.kpiViews ? Math.round((views / c.kpiViews) * 1000) / 10 : null, budget: c.budget, cost, budgetPct: c.budget ? Math.round((cost / c.budget) * 1000) / 10 : null,
    cpv: views && cost ? Math.round((cost / views) * 100) / 100 : null, cpm: views && cost ? Math.round((cost / views) * 1000) : null };
  return out;
}

export function demoApi(path, method) {
  const fail = (code) => { const e = new Error(code); e.status = 503; e.body = {}; return Promise.reject(e); };
  if (!DB) return fail("demo_off");
  if (path.startsWith("/ai/")) return fail("ai_unavailable"); // AI không chạy trên dữ liệu mẫu → giao diện dùng bộ lọc theo luật
  let m;
  if ((m = path.match(/^\/campaigns\/([^/]+)\/posts$/))) return Promise.resolve({ ok: true, result: { added: 0, updated: 0, creators: 0 }, posts: DB.posts[decodeURIComponent(m[1])] || [] });
  if ((m = path.match(/^\/campaigns\/([^/]+)\/report$/))) {
    const c = DB.campaigns.find((x) => x.id === decodeURIComponent(m[1]));
    if (!c) return fail("not_found");
    const label = new Map(c.steps.map((s) => [s.key, s.label]));
    const rows = c.entries.map((e) => {
      const pst = (DB.posts[c.id] || []).filter((p) => p.creatorId === e.creatorId), v = sum(pst.map((p) => p.views)), it = sum(pst.map((p) => p.likes + p.comments + p.shares));
      const cr = DB.byId.get(e.creatorId), cost = e.stage === "closed" ? cr?.rates[0]?.amount : null;
      return { creatorId: e.creatorId, name: cr?.name || "?", platform: cr?.heroPlatform, stage: e.stage, stageLabel: label.get(e.stage), booked: e.stage === "closed", expectedViews: Object.values(cr?.metrics || {})[0]?.avgViews ?? null, posts: pst.length, views: v, interactions: it, er: v ? Math.round((it / v) * 10000) / 100 : null, cost, cpv: v && cost ? Math.round((cost / v) * 100) / 100 : null };
    });
    const daily = new Map();
    for (const p of DB.posts[c.id] || []) daily.set(p.postedAt.slice(0, 10), (daily.get(p.postedAt.slice(0, 10)) || 0) + p.views);
    return Promise.resolve({ ok: true, campaign: report(c), funnel: c.steps.map((s) => ({ ...s, count: c.entries.filter((e) => e.stage === s.key).length })), rows, daily: [...daily.entries()].sort().map(([d, views]) => ({ day: d, views })), price: true });
  }
  if (path === "/reports") {
    const rows = DB.campaigns.map(report);
    const per = new Map();
    for (const p of Object.values(DB.posts).flat()) { const x = per.get(p.creatorId) || { views: 0, posts: 0, campaigns: new Set() }; x.views += p.views; x.posts++; x.campaigns.add(p.campaignId); per.set(p.creatorId, x); }
    return Promise.resolve({ ok: true, scope: "team", price: true,
      totals: { campaigns: rows.length, byStatus: { draft: 1, running: 1, done: 1 }, creators: new Set(DB.campaigns.flatMap((c) => c.entries.map((e) => e.creatorId))).size, booked: sum(rows.map((r) => r.booked)), posts: sum(rows.map((r) => r.posts)), views: sum(rows.map((r) => r.views)), cost: sum(rows.map((r) => r.cost)), budget: sum(rows.map((r) => r.budget)) },
      campaigns: rows, team: [{ owner: "Bạn", campaigns: 3, running: 1, done: 1, booked: sum(rows.map((r) => r.booked)), views: sum(rows.map((r) => r.views)), cost: sum(rows.map((r) => r.cost)) }],
      topCreators: [...per.entries()].sort((a, b) => b[1].views - a[1].views).slice(0, 10).map(([id, x]) => ({ creatorId: id, name: DB.byId.get(id)?.name || "?", views: x.views, posts: x.posts, campaigns: x.campaigns.size })) });
  }
  if ((m = path.match(/^\/creators\/([^/]+)\/clips$/))) {
    const c = DB.byId.get(decodeURIComponent(m[1]));
    if (!c) return fail("not_found");
    const p = c.heroPlatform, avg = Object.values(c.metrics)[0]?.avgViews || 10000;
    const clips = Array.from({ length: 6 }, (_, i) => { const v = Math.round(avg * (0.6 + Math.random() * 0.8)); return { id: i + 1, platform: p, url: `https://example.com/demo/${c.id}/clip${i + 1}`, title: `Clip mẫu ${i + 1}`, publishedAt: day(i * 4 + 1), views: v, likes: Math.round(v * 0.05), comments: Math.round(v * 0.004), shares: Math.round(v * 0.002), source: p === "youtube" ? "auto" : "manual", fetchedAt: day(1) }; });
    return Promise.resolve({ ok: true, clips, settings: SETTINGS, creator: c });
  }
  if (path === "/admin/metrics") return Promise.resolve({ ok: true, settings: SETTINGS, defaults: SETTINGS, recomputed: 0 });
  if (method !== "GET") return Promise.resolve({ ok: true, demo: true }); // ghi: chỉ đổi trên máy, không lưu
  return fail("demo_no_data");
}
