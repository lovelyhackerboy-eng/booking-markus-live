// Campaign assistant (DeepSeek tool calling). Tools run HERE, with the caller's role and campaign visibility:
//   rank_for_brief     — the main tool: the model states the brief, lib/ai/rank.ts filters and scores deterministically
//   search_creators    — find creators by (part of) a name, or a quick filter
//   get_campaign       — a campaign the caller can see (name, brand, KPI, candidates, contact stages, saved brief)
//   save_brief         — store the campaign brief so later questions (and teammates) reuse it
//   propose_candidates — suggestions for the UI. Nothing is written to the campaign: the user confirms in the UI.
// Token economy: a fixed system prompt first (DeepSeek reuses cached prefixes), per-request context after it; tool
// results are slim (no per-platform breakdown), and the model answers with names + one reason — the UI shows numbers
// straight from the database.
import { eq } from "drizzle-orm";
import { can } from "../auth/roles";
import type { CurrentUser } from "../auth/session";
import { listCampaigns } from "../campaigns/repo";
import { db } from "../db/client";
import { aiThreads } from "../db/schema";
import { addUsage, chat, NO_USAGE, type ChatMessage, type ToolDef, type Usage } from "./deepseek";
import { catalogOf, compactCreators, matches, type Compact, type Criteria } from "./creators";
import { rankForBrief, type Brief } from "./rank";

export type Proposal = { id: string; name: string; reason: string };
export type ThreadMessage = { role: "user" | "assistant"; content: string; proposals?: Proposal[]; at?: string; by?: string };
type Actor = Pick<CurrentUser, "email" | "name" | "role">;
type SavedBrief = Brief & { notes?: string };

const MAX_THREAD = 30;

// Fixed text: identical for every user and campaign with the same price permission → cache-friendly prefix.
export const systemPrompt = (allowPrice: boolean) => `Bạn là trợ lý booking KOL/creator của Markus Agency. Nhiệm vụ: giúp lên campaign — hiểu brief, chọn creator phù hợp trong CSDL bằng công cụ, giải thích ngắn gọn, đề xuất ứng viên.
Công cụ:
- rank_for_brief: công cụ CHÍNH. Khai brief (ngành, khu vực, kênh, follower, ${allowPrice ? "ngân sách/người, " : ""}số lượng); máy chủ lọc và chấm điểm, đã loại sẵn người có trong campaign.
- search_creators: chỉ khi tìm theo tên hoặc cần lọc nhanh.
- get_campaign: xem campaign đang mở. save_brief: lưu brief khi người dùng nêu rõ yêu cầu (để lần sau và đồng đội dùng lại).
- propose_candidates: đưa gợi ý cho người dùng tự bấm thêm vào Ứng viên.
Quy tắc:
- Chỉ dùng creator có trong kết quả công cụ. Không bịa tên, số liệu, giá.
- Bạn KHÔNG tạo, sửa, xoá campaign và KHÔNG tự thêm ứng viên. Chưa mở campaign thì nhắc người dùng tạo/mở campaign ở màn Campaign.
- ${allowPrice ? "Có thể cân ngân sách bằng giá tham khảo trên Sheet." : "Người dùng KHÔNG được xem giá: không nhắc tới giá, không khai ngân sách."}
- Dữ liệu chưa có: ER, view trung bình, audience, brand từng làm, tuổi, giới tính, creator type. Nói rõ khi brief cần các thông tin này.
- Trả lời tiếng Việt, ngắn. Khi đề xuất: mỗi người một dòng "Tên — lý do"; KHÔNG chép lại số follower hay giá (giao diện tự hiện từ CSDL).`;

function tools(allowPrice: boolean, cat: ReturnType<typeof catalogOf>, inCampaign: boolean): ToolDef[] {
  const arr = (items: string[], description?: string) => ({ type: "array", items: { type: "string", enum: items }, ...(description ? { description } : {}) });
  const briefProps = {
    categories: arr(cat.categories),
    regions: arr(cat.regions),
    heroes: arr(cat.platforms, "kênh chính"),
    platforms: arr(cat.platforms, "phải có kênh trên các nền tảng này"),
    followersMin: { type: "number" },
    followersMax: { type: "number" },
    ...(allowPrice ? { budgetPerCreator: { type: "number", description: "ngân sách VND cho mỗi creator" } } : {}),
    count: { type: "number", description: "số creator cần (mặc định 6)" },
    preferWorked: { type: "boolean", description: "ưu tiên người đã hợp tác" },
  };
  const defs: ToolDef[] = [
    { type: "function", function: { name: "rank_for_brief", description: "Lọc + chấm điểm creator theo brief, trả danh sách đã xếp hạng kèm lý do.", parameters: { type: "object", properties: briefProps } } },
    {
      type: "function",
      function: {
        name: "search_creators",
        description: "Tìm creator theo tên (text) hoặc lọc nhanh. Tối đa 10 kết quả.",
        parameters: { type: "object", properties: { text: { type: "string" }, categories: arr(cat.categories), regions: arr(cat.regions), tiers: arr(cat.tiers), heroes: arr(cat.platforms) } },
      },
    },
    {
      type: "function",
      function: {
        name: "propose_candidates",
        description: "Đề xuất creator (id từ kết quả công cụ) để người dùng bấm thêm vào Ứng viên.",
        parameters: { type: "object", properties: { items: { type: "array", items: { type: "object", properties: { id: { type: "string" }, reason: { type: "string" } }, required: ["id", "reason"] } } }, required: ["items"] },
      },
    },
  ];
  if (inCampaign) {
    defs.push(
      { type: "function", function: { name: "get_campaign", description: "Xem campaign đang mở.", parameters: { type: "object", properties: {} } } },
      { type: "function", function: { name: "save_brief", description: "Lưu brief của campaign đang mở.", parameters: { type: "object", properties: { ...briefProps, notes: { type: "string", description: "yêu cầu khác bằng lời" } } } } },
    );
  }
  return defs;
}

const slim = (c: Compact, allowPrice: boolean) => ({
  id: c.id, name: c.name, tier: c.tier, cat: c.categories[0] ?? null, region: c.region, hero: c.hero, followers: c.heroFollowers,
  ...(allowPrice ? { price: c.rateFrom ?? null } : {}),
  ...(c.relationship !== undefined ? { rel: c.relationship } : {}),
});

export async function loadThread(campaignId: string): Promise<{ messages: ThreadMessage[]; brief: SavedBrief | null }> {
  const [t] = await db().select().from(aiThreads).where(eq(aiThreads.campaignId, campaignId)).limit(1);
  if (!t) return { messages: [], brief: null };
  return { messages: JSON.parse(t.messages) as ThreadMessage[], brief: t.brief ? (JSON.parse(t.brief) as SavedBrief) : null };
}
async function saveThread(campaignId: string, messages: ThreadMessage[], brief: SavedBrief | null, by: string) {
  const row = { messages: JSON.stringify(messages.slice(-MAX_THREAD)), brief: brief ? JSON.stringify(brief) : null, updatedBy: by, updatedAt: new Date() };
  await db().insert(aiThreads).values({ campaignId, ...row }).onDuplicateKeyUpdate({ set: row });
}
export async function clearThread(campaignId: string) {
  await db().delete(aiThreads).where(eq(aiThreads.campaignId, campaignId));
}

export async function runAgent(actor: Actor, input: { campaignId?: string | null; messages: { role: "user" | "assistant"; content: string }[] }) {
  const creators = await compactCreators(actor.role);
  const byId = new Map(creators.map((c) => [c.id, c]));
  const cat = catalogOf(creators);
  const campaigns = await listCampaigns(actor);
  const current = input.campaignId ? (campaigns.find((c) => c.id === input.campaignId) ?? null) : null;
  const allowPrice = can(actor.role, "price");
  const proposals: Proposal[] = [];
  const used: string[] = [];
  let usage: Usage = NO_USAGE;

  // Campaign: history and brief come from the server-side thread (shared with teammates); the client sends only the
  // new message. No campaign: the client keeps the history for the session.
  const thread = current ? await loadThread(current.id) : { messages: [] as ThreadMessage[], brief: null as SavedBrief | null };
  let brief = thread.brief;
  const newMsg = input.messages[input.messages.length - 1];
  const history = current ? [...thread.messages, { role: "user" as const, content: newMsg.content }] : input.messages;
  const excludeIds = current ? [...current.candidates.map((x) => x.creatorId), ...current.entries.map((x) => x.creatorId)] : [];

  const context = `Người dùng: ${actor.name} (vai trò ${actor.role}). ${
    current
      ? `Campaign đang mở: "${current.name}" (id ${current.id}${current.brand ? `, brand ${current.brand}` : ""}${current.kpiViews ? `, KPI ${current.kpiViews} view` : ""}; ${current.candidates.length} ứng viên, ${current.entries.length} đang liên hệ).${brief ? ` Brief đã lưu: ${JSON.stringify(brief)}.` : ""}`
      : "Chưa mở campaign nào."
  }`;
  const msgs: ChatMessage[] = [
    { role: "system", content: systemPrompt(allowPrice) },
    { role: "system", content: context },
    ...history.slice(-12).map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }) as ChatMessage),
  ];
  const defs = tools(allowPrice, cat, !!current);
  let reply = "";

  for (let round = 0; round < 5 && !reply; round++) {
    const r = await chat({ messages: msgs, tools: defs, maxTokens: 900, temperature: 0.3 });
    usage = addUsage(usage, r.usage);
    if (!r.toolCalls.length) {
      reply = (r.content || "").trim();
      break;
    }
    msgs.push({ role: "assistant", content: r.content ?? "", tool_calls: r.toolCalls });
    for (const call of r.toolCalls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        args = {};
      }
      used.push(call.function.name);
      let result: unknown;
      switch (call.function.name) {
        case "rank_for_brief": {
          const b: Brief = { ...(args as Brief), excludeIds };
          if (!allowPrice) delete b.budgetPerCreator;
          result = rankForBrief(creators, b, allowPrice);
          break;
        }
        case "search_creators": {
          const k = args as Criteria;
          const hits = creators.filter((c) => matches(c, k)).sort((a, b) => (b.heroFollowers ?? 0) - (a.heroFollowers ?? 0));
          result = { total: hits.length, creators: hits.slice(0, 10).map((c) => slim(c, allowPrice)) };
          break;
        }
        case "get_campaign":
          result = current
            ? {
                name: current.name, brand: current.brand, kpiViews: current.kpiViews, brief,
                candidates: current.candidates.map((x) => byId.get(x.creatorId)?.name ?? "?"),
                contacting: current.entries.map((x) => `${byId.get(x.creatorId)?.name ?? "?"}: ${current.steps.find((st) => st.key === x.stage)?.label ?? x.stage}`),
              }
            : { error: "Chưa mở campaign." };
          break;
        case "save_brief":
          if (current) {
            const b = { ...(args as SavedBrief) };
            if (!allowPrice) delete b.budgetPerCreator;
            delete b.excludeIds;
            brief = b;
            result = { saved: true };
          } else result = { error: "Chưa mở campaign." };
          break;
        case "propose_candidates": {
          const items = Array.isArray(args.items) ? (args.items as { id?: unknown; reason?: unknown }[]) : [];
          let n = 0;
          for (const it of items.slice(0, 20)) {
            const c = byId.get(String(it.id ?? ""));
            if (!c || proposals.some((p) => p.id === c.id)) continue;
            proposals.push({ id: c.id, name: c.name, reason: String(it.reason ?? "").slice(0, 300) });
            n++;
          }
          result = { shownToUser: n };
          break;
        }
        default:
          result = { error: "unknown_tool" };
      }
      msgs.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result).slice(0, 16000) });
    }
  }
  if (!reply) reply = "Mình cần thêm thông tin để thu hẹp — bạn mô tả rõ hơn brief (ngành, khu vực, kênh, ngân sách, số lượng)?";

  if (current) {
    const now = new Date().toISOString();
    const next: ThreadMessage[] = [
      ...thread.messages,
      { role: "user", content: newMsg.content, at: now, by: actor.name },
      { role: "assistant", content: reply, proposals, at: now },
    ];
    await saveThread(current.id, next, brief, actor.email);
  }
  return { reply, proposals, used, usage, brief };
}
