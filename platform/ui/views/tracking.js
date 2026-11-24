// views/tracking.js — Campaign, bước 3 "Theo dõi": bài đăng / clip creator đã giao cho campaign và số liệu của chúng.
// YouTube: tự tìm video đăng trong khoảng ngày theo dõi của creator ở bước "chốt" (bật trong Cài đặt). Mọi nền tảng:
// dán link + nhập số view / like / comment / share; sửa số ngay trên bảng (mỗi lần sửa lưu một mốc để vẽ tiến độ).
// Bỏ một bài tự động = loại khỏi báo cáo (giữ lại để lượt tự động sau không thêm lại).

import { $, esc, icon, delegate, openOverlay, toast, fmtNum, fmtPct, fmtDate } from "../core/ui.js";
import { can, getCreator } from "../core/store.js";
import { api, stepLabel, finalStep } from "../data/live.js";
import { creatorCell, plat } from "../core/parts.js";
import { refresh } from "../core/router.js";
import { openCampaignSettings } from "./campaign-settings.js";
import { invalidate as invalidateReport } from "./reports.js";

const cache = new Map(); // campaignId → posts
const loading = new Map();
const ERR = { creator_not_in_campaign: "Creator này chưa ở bước Liên hệ của campaign.", unknown_platform: "Không nhận ra nền tảng từ link — chọn nền tảng.", post_exists: "Bài này đã có trong campaign.", bad_request: "Kiểm tra lại link (https://…) và các số.", forbidden: "Vai trò của bạn không sửa được." };
const errText = (e) => ERR[e.message] || "Lỗi " + e.message;
const sum = (xs) => xs.reduce((s, x) => s + (x || 0), 0);

export async function load(listId, force = false) {
  if (!force && cache.has(listId)) return cache.get(listId);
  const r = await api(`/campaigns/${encodeURIComponent(listId)}/posts`);
  cache.set(listId, r.posts);
  return r.posts;
}
async function op(l, body, okMsg) {
  try {
    const r = await api(`/campaigns/${encodeURIComponent(l.id)}/posts`, { method: "POST", body });
    cache.set(l.id, r.posts);
    invalidateReport(l.id);
    if (okMsg) toast(okMsg, typeof okMsg === "string" ? l.name : "");
    return r;
  } catch (e) { toast("Chưa lưu được", errText(e), "danger"); return null; }
}

export function render(el, l) {
  if (!cache.has(l.id)) {
    el.innerHTML = `<div class="card empty"><strong>Đang tải bài đăng…</strong></div>`;
    if (!loading.has(l.id)) {
      loading.set(l.id, load(l.id).finally(() => loading.delete(l.id)));
      loading.get(l.id).then(() => refresh()).catch((e) => { el.innerHTML = `<div class="card empty"><strong>Chưa tải được bài đăng</strong><span>${esc(errText(e))}</span></div>`; });
    }
    return;
  }
  const posts = cache.get(l.id);
  const live = posts.filter((p) => !p.excluded);
  const final = finalStep(l);
  const edit = can("edit");
  const views = sum(live.map((p) => p.views)), inter = sum(live.map((p) => sum([p.likes, p.comments, p.shares])));
  const k = l.kpiViews ? Math.round((views / l.kpiViews) * 100) : null;
  // Creator đã chốt trước, rồi tới creator khác có bài.
  const ids = [...new Set([...l.entries.filter((e) => e.stage === final).map((e) => e.id), ...posts.map((p) => p.creatorId)])];
  const win = l.trackFrom ? `${fmtDate(l.trackFrom)} → ${l.trackTo ? fmtDate(l.trackTo) : "…"}` : "";
  el.innerHTML = `
    <div class="card card-pad track-head" data-tour="track-head">
      <div class="track-kpi">
        <div><span class="faint">View đã giao</span><strong class="num">${fmtNum(views)}</strong>${l.kpiViews ? `<span class="bar ${k >= 100 ? "bar-success" : k >= 60 ? "" : "bar-warning"}"><i style="width:${Math.min(100, k)}%"></i></span><span class="dt-sub">${k}% KPI ${fmtNum(l.kpiViews)}</span>` : `<span class="dt-sub">Chưa đặt KPI view</span>`}</div>
        <div><span class="faint">Bài đăng</span><strong class="num">${live.length}</strong><span class="dt-sub">${posts.length - live.length ? `${posts.length - live.length} bài đã loại` : "&nbsp;"}</span></div>
        <div><span class="faint">Tương tác</span><strong class="num">${fmtNum(inter)}</strong><span class="dt-sub">ER ${views ? fmtPct(Math.round((inter / views) * 10000) / 100) : "—"}</span></div>
      </div>
      <div class="row-wrap">
        <span class="faint">${win ? `${icon("eye", 14)} Theo dõi ${win}${l.autoTrack ? " · YouTube tự động mỗi giờ" : " · chưa bật tự động"}` : `${icon("eye", 14)} Chưa đặt khoảng ngày theo dõi`}</span>
        ${edit ? `<button class="link-btn" type="button" data-act="track-settings">${win ? "Đổi" : "Đặt khoảng ngày"}</button>` : ""}
        <span class="spacer"></span>
        ${edit && l.trackFrom ? `<button class="btn" type="button" data-act="track-refresh">${icon("sync", 16)} Tìm video YouTube ngay</button>` : ""}
        ${edit ? `<button class="btn btn-primary" type="button" data-act="post-add" data-tour="post-add">${icon("plus", 16)} Thêm bài đăng</button>` : ""}
      </div>
    </div>
    ${ids.length ? `<div class="track-list">${ids.map((id) => creatorBlock(l, id, posts.filter((p) => p.creatorId === id), edit)).join("")}</div>`
      : `<div class="card empty"><strong>Chưa có creator ở bước “${esc(stepLabel(l, final))}”</strong><span>Kéo creator tới bước chốt ở tab Liên hệ, rồi thêm link bài đăng của họ ở đây.</span></div>`}`;

  delegate(el, "click", "[data-act=track-settings]", () => openCampaignSettings(l.id, "track"));
  delegate(el, "click", "[data-act=post-add]", (e, b) => openAddPost(l, b.dataset.creator || ""));
  delegate(el, "click", "[data-act=track-refresh]", async (e, b) => {
    b.disabled = true;
    const r = await op(l, { op: "refresh" });
    if (r) toast("Đã tìm video YouTube", `${r.result?.added || 0} bài mới · ${r.result?.updated || 0} bài cập nhật số liệu`);
    refresh();
  });
  delegate(el, "change", "[data-num]", async (e, inp) => {
    const v = inp.value === "" ? null : Math.max(0, Math.round(+inp.value));
    if (await op(l, { op: "update", id: inp.dataset.post, [inp.dataset.num]: v })) { toast("Đã lưu số liệu", ""); refresh(); }
  });
  delegate(el, "click", "[data-exclude]", async (e, b) => { if (await op(l, { op: "exclude", id: b.dataset.exclude, excluded: b.dataset.on === "1" })) refresh(); });
  delegate(el, "click", "[data-rmpost]", async (e, b) => { if (await op(l, { op: "remove", id: b.dataset.rmpost }, "Đã bỏ bài đăng")) refresh(); });
}

function creatorBlock(l, id, posts, edit) {
  const c = getCreator(id);
  const e = l.entries.find((x) => x.id === id);
  const v = sum(posts.filter((p) => !p.excluded).map((p) => p.views));
  const exp = c?.channels[c.hero]?.avgViews?.value;
  const num = (p, k) => edit && !(p.source === "auto" && (k === "views" || k === "likes"))
    ? `<input class="input input-sm num" type="number" min="0" value="${p[k] ?? ""}" data-num="${k}" data-post="${p.id}" aria-label="${k} của bài ${esc(p.title || p.url)}" />`
    : `<span class="num">${p[k] == null ? "—" : fmtNum(p[k])}</span>`;
  return `<section class="card track-creator">
    <header class="track-c-head">${c ? creatorCell(c, `${e ? esc(stepLabel(l, e.stage)) : "Không còn trong campaign"}${exp ? ` · view TB ${fmtNum(exp)}` : ""}`) : `<strong>${esc(id)}</strong>`}
      <span class="spacer"></span><span class="track-c-total"><strong class="num">${fmtNum(v)}</strong><span class="dt-sub">view · ${posts.filter((p) => !p.excluded).length} bài</span></span>
      ${edit ? `<button class="btn btn-sm" type="button" data-act="post-add" data-creator="${id}">${icon("plus", 14)} Bài đăng</button>` : ""}</header>
    ${posts.length ? `<div class="dt-wrap"><table class="dt track-table"><thead><tr><th>Bài đăng</th><th>Ngày</th><th class="t-right">View</th><th class="t-right">Like</th><th class="t-right">Comment</th><th class="t-right">Share</th><th>Nguồn</th>${edit ? "<th></th>" : ""}</tr></thead><tbody>
      ${posts.map((p) => `<tr class="${p.excluded ? "is-excluded" : ""}">
        <td class="cell-clip">${plat(p.platform, 16)} <a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.title || p.url)}</a></td>
        <td>${p.postedAt ? fmtDate(p.postedAt) : "—"}</td>
        ${["views", "likes", "comments", "shares"].map((k) => `<td class="t-right">${num(p, k)}</td>`).join("")}
        <td><span class="src src-${p.source === "auto" ? "crawler" : "manual"}">${p.source === "auto" ? "Tự động" : "Nhập tay"}</span>${p.excluded ? ` <span class="badge">Đã loại</span>` : ""}</td>
        ${edit ? `<td class="t-nowrap">${p.source === "auto"
          ? `<button class="btn btn-ghost btn-sm" type="button" data-exclude="${p.id}" data-on="${p.excluded ? "0" : "1"}">${p.excluded ? "Tính lại" : "Loại"}</button>`
          : `<button class="btn btn-ghost btn-icon btn-sm" type="button" data-rmpost="${p.id}" aria-label="Xoá bài đăng">${icon("trash", 14)}</button>`}</td>` : ""}
      </tr>`).join("")}</tbody></table></div>` : `<p class="faint track-none">Chưa có bài đăng.${edit ? " Bấm “+ Bài đăng” để dán link." : ""}</p>`}
  </section>`;
}

function openAddPost(l, creatorId) {
  const final = finalStep(l);
  const opts = l.entries.slice().sort((a, b) => (b.stage === final) - (a.stage === final)).map((e) => getCreator(e.id)).filter(Boolean);
  if (!opts.length) return toast("Chưa có creator", "Duyệt creator sang bước Liên hệ trước.", "danger");
  const o = openOverlay({
    kind: "modal", title: `Thêm bài đăng · ${l.name}`,
    body: `<form class="stack" id="pa-form">
      <div class="field"><label for="pa-creator">Creator</label><select class="select" id="pa-creator">${opts.map((c) => `<option value="${c.id}" ${c.id === creatorId ? "selected" : ""}>${esc(c.name)} — ${esc(stepLabel(l, l.entries.find((e) => e.id === c.id).stage))}</option>`).join("")}</select></div>
      <div class="field"><label for="pa-url">Link bài đăng</label><input class="input" id="pa-url" type="url" required placeholder="https://www.tiktok.com/@kenh/video/…" /><span class="field-hint">Nền tảng nhận theo link (TikTok, Facebook, Instagram, YouTube, Threads).</span></div>
      <div class="field-row"><div class="field"><label for="pa-title">Tiêu đề / ghi chú (không bắt buộc)</label><input class="input" id="pa-title" maxlength="300" /></div>
        <div class="field"><label for="pa-date">Ngày đăng</label><input class="input" id="pa-date" type="date" /></div></div>
      <div class="clip-grid">${[["views", "View"], ["likes", "Like"], ["comments", "Comment"], ["shares", "Share"]].map(([k, t]) => `<div class="field"><label for="pa-${k}">${t}</label><input class="input" id="pa-${k}" type="number" min="0" /></div>`).join("")}</div>
      <p class="field-hint">Chưa có số? Để trống và cập nhật sau ngay trên bảng.</p>
    </form>`,
    footer: `<span class="spacer"></span><button class="btn" data-close type="button">Huỷ</button><button class="btn btn-primary" type="button" id="pa-save">Thêm bài đăng</button>`,
  });
  $("#pa-save", o.el).addEventListener("click", async (e) => {
    const url = $("#pa-url", o.el).value.trim();
    if (!/^https:\/\//.test(url)) return toast("Link chưa đúng", "Dán link bắt đầu bằng https://", "danger");
    const n = (k) => { const v = $("#pa-" + k, o.el).value; return v === "" ? null : Math.max(0, Math.round(+v)); };
    const b = e.currentTarget; b.disabled = true;
    const r = await op(l, { op: "add", creatorId: $("#pa-creator", o.el).value, url, title: $("#pa-title", o.el).value.trim() || undefined, postedAt: $("#pa-date", o.el).value || null, views: n("views"), likes: n("likes"), comments: n("comments"), shares: n("shares") }, "Đã thêm bài đăng");
    b.disabled = false;
    if (r) { o.close(); refresh(); }
  });
}
