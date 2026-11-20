// Campaign assistant (DeepSeek tool calling). Tools run HERE, with the caller's role and campaign visibility:
//   search_creators — filter the creator base (compact records, no contacts/notes; prices only with `price`)
//   get_campaign    — a campaign the caller can see (name, brand, KPI, candidates, contact stages)
//   propose_candidates — returns suggestions to the UI. Nothing is written: the user confirms in the UI, and the
//                        normal campaign API (with its own checks) adds them.
import { can } from "../auth/roles";
import type { CurrentUser } from "../auth/session";
import { listCampaigns } from "../campaigns/repo";
import { chat, type ChatMessage, type ToolDef } from "./deepseek";
import { catalogOf, compactCreators, matches, type Compact, type Criteria } from "./creators";

export type Proposal = { id: string; name: string; reason: string };
type Actor = Pick<CurrentUser, "email" | "name" | "role">;

const STAGE: Record<string, string> = { none: "Chưa liên hệ", zalo: "Đã liên hệ Zalo", manager: "Qua Manager/MCN", quoted: "Đã báo giá", closed: "Đã chốt" };

function tools(allowPrice: boolean, cat: ReturnType<typeof catalogOf>): ToolDef[] {
  const arr = (items: string[]) => ({ type: "array", items: { type: "string", enum: items } });
  return [
    {
      type: "function",
      function: {
        name: "search_creators",
        description: "Tìm creator trong CSDL của Markus theo tiêu chí. Trả tối đa `limit` creator, xếp theo follower kênh chính giảm dần, kèm tổng số khớp.",
        parameters: {
          type: "object",
          properties: {
            categories: arr(cat.categories),
            regions: arr(cat.regions),
            tiers: arr(cat.tiers),
            heroes: { ...arr(cat.platforms), description: "kênh chính" },
            platforms: { ...arr(cat.platforms), description: "phải có kênh trên các nền tảng này" },
            followersMin: { type: "number" },
            followersMax: { type: "number" },
            ...(allowPrice ? { rateMax: { type: "number", description: "giá VND tối đa / lần booking" }, rateMin: { type: "number" }, rateSow: { type: "string", enum: cat.sowKinds } } : {}),
            relStatus: { ...arr(cat.relStatus), description: "active = đã hợp tác, quoted = đã báo giá, network = chưa liên hệ" },
            text: { type: "string", description: "một phần tên creator" },
            limit: { type: "number", description: "1–20, mặc định 10" },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_campaign",
        description: "Xem campaign: tên, brand, KPI view, ứng viên đang cân nhắc, creator đang liên hệ và tiến độ.",
        parameters: { type: "object", properties: { campaignId: { type: "string" } }, required: ["campaignId"] },
      },
    },
    {
      type: "function",
      function: {
        name: "propose_candidates",
        description: "Đề xuất creator (chỉ id lấy từ kết quả search_creators) để người dùng bấm thêm vào Ứng viên của campaign. Không tự ghi dữ liệu.",
        parameters: {
          type: "object",
          properties: { items: { type: "array", items: { type: "object", properties: { id: { type: "string" }, reason: { type: "string" } }, required: ["id", "reason"] } } },
          required: ["items"],
        },
      },
    },
  ];
}

const forModel = (c: Compact) => {
  const { followers, rateBySow, ...rest } = c;
  return { ...rest, followers, ...(rateBySow ? { rateBySow } : {}) };
};

export async function runAgent(actor: Actor, input: { campaignId?: string | null; messages: { role: "user" | "assistant"; content: string }[] }) {
  const creators = await compactCreators(actor.role);
  const byId = new Map(creators.map((c) => [c.id, c]));
  const cat = catalogOf(creators);
  const campaigns = await listCampaigns(actor);
  const current = input.campaignId ? campaigns.find((c) => c.id === input.campaignId) ?? null : null;
  const allowPrice = can(actor.role, "price");
  const proposals: Proposal[] = [];
  const used: string[] = [];

  const system = `Bạn là trợ lý booking KOL/creator của Markus Agency, làm việc với ${actor.name} (vai trò ${actor.role}).
Nhiệm vụ: giúp lên campaign — hiểu brief, tìm creator phù hợp trong CSDL bằng công cụ, giải thích lựa chọn, đề xuất ứng viên.
Quy tắc:
- Chỉ dùng creator có trong kết quả công cụ. Không bịa tên, số liệu, giá.
- Muốn gợi ý ứng viên cho campaign thì gọi propose_candidates (người dùng sẽ tự bấm thêm). Không nói là đã thêm.
- Bạn KHÔNG tạo, sửa hay xoá campaign. Khi chưa mở campaign, nhắc người dùng tạo campaign ở màn Campaign rồi mở Trợ lý AI trong campaign đó để thêm gợi ý.
- Khi đã đề xuất, liệt kê ngắn tên và lý do trong câu trả lời.
- ${allowPrice ? "Có thể dùng giá (VND) để cân ngân sách; giá trên Sheet là giá tham khảo." : "Người dùng KHÔNG được xem giá: không nhắc tới giá."}
- Dữ liệu chưa có: ER, view trung bình, audience, brand từng làm, tuổi, giới tính. Nói rõ khi brief cần các thông tin này.
- Trả lời tiếng Việt, ngắn gọn, có gạch đầu dòng khi liệt kê.
${current ? `Campaign đang mở: "${current.name}" (id ${current.id}${current.brand ? `, brand ${current.brand}` : ""}${current.kpiViews ? `, KPI ${current.kpiViews} view` : ""}).` : "Chưa mở campaign nào."}`;

  const history: ChatMessage[] = [
    { role: "system", content: system },
    ...input.messages.slice(-12).map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }) as ChatMessage),
  ];
  const defs = tools(allowPrice, cat);

  for (let round = 0; round < 5; round++) {
    const r = await chat({ messages: history, tools: defs, maxTokens: 1500, temperature: 0.3 });
    if (!r.toolCalls.length) return { reply: (r.content || "").trim(), proposals, used };
    history.push({ role: "assistant", content: r.content ?? "", tool_calls: r.toolCalls });
    for (const call of r.toolCalls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        args = {};
      }
      used.push(call.function.name);
      let result: unknown;
      if (call.function.name === "search_creators") {
        const k = args as Criteria & { limit?: number };
        if (!allowPrice) { delete k.rateMax; delete k.rateMin; delete k.rateSow; }
        const hits = creators.filter((c) => matches(c, k)).sort((a, b) => (b.heroFollowers ?? 0) - (a.heroFollowers ?? 0));
        const limit = Math.min(20, Math.max(1, Number(k.limit) || 10));
        result = { total: hits.length, creators: hits.slice(0, limit).map(forModel) };
      } else if (call.function.name === "get_campaign") {
        const c = campaigns.find((x) => x.id === String(args.campaignId ?? ""));
        result = c
          ? {
              id: c.id, name: c.name, brand: c.brand, kpiViews: c.kpiViews,
              candidates: c.candidates.map((x) => ({ id: x.creatorId, name: byId.get(x.creatorId)?.name ?? "?" })),
              contacting: c.entries.map((x) => ({ id: x.creatorId, name: byId.get(x.creatorId)?.name ?? "?", stage: STAGE[x.stage] ?? x.stage })),
            }
          : { error: "Không tìm thấy campaign hoặc bạn không có quyền xem." };
      } else if (call.function.name === "propose_candidates") {
        const items = Array.isArray(args.items) ? (args.items as { id?: unknown; reason?: unknown }[]) : [];
        const added: string[] = [];
        for (const it of items.slice(0, 20)) {
          const c = byId.get(String(it.id ?? ""));
          if (!c || proposals.some((p) => p.id === c.id)) continue;
          proposals.push({ id: c.id, name: c.name, reason: String(it.reason ?? "").slice(0, 300) });
          added.push(c.id);
        }
        result = { shownToUser: added.length, note: "Người dùng sẽ xem và tự bấm thêm vào Ứng viên." };
      } else result = { error: "unknown_tool" };
      history.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result).slice(0, 24000) });
    }
  }
  return { reply: "Mình cần thêm thông tin để thu hẹp tìm kiếm — bạn mô tả rõ hơn brief (ngành, khu vực, kênh, ngân sách)?", proposals, used };
}
