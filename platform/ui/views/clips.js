// views/clips.js — "Clip gần đây & chỉ số" của một kênh: các clip dùng để tính View trung bình và ER.
// YouTube: đọc tự động (mỗi giờ một lượt, hoặc bấm "Đọc lại ngay"). TikTok / Facebook / Instagram: nền tảng chặn đọc
// tự động nên người dùng dán link + số view/like/comment/share của vài clip gần nhất.
// Admin sửa công thức (số clip, trung bình/trung vị/cắt ngọn, ER theo view hay follower…) ở openMetricsSettings().

import { $, esc, icon, delegate, openOverlay, toast, fmtNum, fmtPct, fmtDate } from "../core/ui.js";
import { state, can, emit } from "../core/store.js";
import { api, toCreator } from "../data/live.js";
import { PLATFORMS } from "../data/catalog.js";

const METHOD = { mean: "trung bình cộng", median: "trung vị", trimmed: "trung bình cắt ngọn" };
const ERR = {
  not_a_channel_url: "Link YouTube trên Sheet không phải link kênh (cần dạng youtube.com/@ten-kenh).",
  no_youtube_url: "Creator chưa có link YouTube trên Sheet.", no_channel_id: "Không đọc được kênh từ trang YouTube.",
  bad_request: "Kiểm tra lại link (https://…) và số view.", forbidden: "Vai trò của bạn không sửa được.",
};
const errText = (e) => ERR[e.message] || (/^(page|rss)_/.test(e.message) ? "YouTube không trả dữ liệu (" + e.message + "). Thử lại sau." : "Lỗi " + e.message);

export function formulaText(s) {
  const parts = [s.erLikes && "like", s.erComments && "comment", s.erShares && "share"].filter(Boolean).join(" + ") || "—";
  return `View TB = ${METHOD[s.method]}${s.method === "trimmed" ? ` (bỏ ${s.trimPct}% mỗi đầu)` : ""} của tối đa <strong>${s.sampleSize}</strong> clip gần nhất${s.maxAgeDays ? ` trong ${s.maxAgeDays} ngày` : ""}, cần ít nhất ${s.minSample} clip.
    ER = (${parts}) / ${s.erBase === "views" ? "view của từng clip" : "follower"}, lấy ${METHOD[s.method]}.`;
}

function replaceCreator(raw) {
  if (!raw) return null;
  const c = toCreator(raw);
  const i = state.creators.findIndex((x) => x.id === c.id);
  if (i >= 0) state.creators[i] = c;
  emit("data");
  return c;
}

export async function openClips(c, platform) {
  let data;
  try { data = await api(`/creators/${encodeURIComponent(c.id)}/clips`); } catch (e) { return toast("Chưa tải được clip", errText(e), "danger"); }
  let clips = data.clips, cur = c;
  const s = data.settings;
  const edit = can("edit");
  const yt = platform === "youtube";
  const P = PLATFORMS[platform]?.label || platform;
  const list = () => {
    const mine = clips.filter((x) => x.platform === platform);
    const ch = cur.channels[platform] || {};
    return `<div class="clip-sum">
        <div><span class="faint">View trung bình</span><strong class="num">${fmtNum(ch.avgViews?.value)}</strong></div>
        <div><span class="faint">Engagement rate</span><strong class="num">${fmtPct(ch.er?.value)}</strong></div>
        <div><span class="faint">Số clip đang tính</span><strong class="num">${ch.sample || 0}</strong></div>
      </div>
      ${mine.length ? `<div class="dt-wrap"><table class="dt clip-table"><thead><tr><th>Ngày đăng</th><th>Clip</th><th class="t-right">View</th><th class="t-right">Like</th><th class="t-right">Comment</th><th class="t-right">Share</th><th>Nguồn</th>${edit ? "<th></th>" : ""}</tr></thead><tbody>
        ${mine.map((x) => `<tr><td>${x.publishedAt ? fmtDate(x.publishedAt) : "—"}</td><td class="cell-clip"><a href="${esc(x.url || "#")}" target="_blank" rel="noopener noreferrer">${esc(x.title || x.url || "")}</a></td>
          <td class="t-right num">${fmtNum(x.views)}</td><td class="t-right num">${x.likes == null ? "—" : fmtNum(x.likes)}</td><td class="t-right num">${x.comments == null ? "—" : fmtNum(x.comments)}</td><td class="t-right num">${x.shares == null ? "—" : fmtNum(x.shares)}</td>
          <td><span class="src src-${x.source === "auto" ? "crawler" : "manual"}">${x.source === "auto" ? "Tự động" : "Nhập tay"}</span></td>
          ${edit ? `<td><button class="btn btn-ghost btn-icon btn-sm" type="button" data-rm="${x.id}" aria-label="Xoá clip">${icon("trash", 14)}</button></td>` : ""}</tr>`).join("")}
      </tbody></table></div>` : `<p class="faint">Chưa có clip ${esc(P)} nào.${yt ? " Bấm “Đọc lại từ YouTube” để lấy 15 video mới nhất." : edit ? " Dán link và số liệu của vài clip gần nhất ở dưới." : ""}</p>`}`;
  };
  const form = edit ? `<form class="card card-pad stack clip-form" id="clip-form" data-tour="clip-form">
      <strong>Thêm clip ${esc(P)}</strong>
      <div class="field"><label for="cf-url">Link clip</label><input class="input" id="cf-url" type="url" required placeholder="https://www.${platform === "facebook" ? "facebook.com/…/videos/…" : platform === "instagram" ? "instagram.com/reel/…" : platform === "youtube" ? "youtube.com/watch?v=…" : "tiktok.com/@kenh/video/…"}" /></div>
      <div class="clip-grid">
        <div class="field"><label for="cf-date">Ngày đăng</label><input class="input" id="cf-date" type="date" /></div>
        <div class="field"><label for="cf-views">View</label><input class="input" id="cf-views" type="number" min="0" required /></div>
        <div class="field"><label for="cf-likes">Like</label><input class="input" id="cf-likes" type="number" min="0" /></div>
        <div class="field"><label for="cf-comments">Comment</label><input class="input" id="cf-comments" type="number" min="0" /></div>
        <div class="field"><label for="cf-shares">Share</label><input class="input" id="cf-shares" type="number" min="0" /></div>
      </div>
      <div class="row-wrap"><button class="btn btn-primary" type="submit">${icon("plus", 14)} Thêm clip</button><span class="faint">Dán lại cùng link để cập nhật số liệu.</span></div>
    </form>` : "";
  const o = openOverlay({
    kind: "modal", wide: true, title: `Clip gần đây · ${P} · ${c.name}`,
    body: `<div class="stack">
      <p class="field-hint">${formulaText(s)}${can("admin") ? ` <button class="link-btn" type="button" id="clip-formula">Sửa công thức</button>` : ""}</p>
      ${yt && edit ? `<div class="row-wrap"><button class="btn" type="button" id="clip-refresh">${icon("sync", 14)} Đọc lại từ YouTube</button><span class="faint">Tự động mỗi ngày; RSS của YouTube chỉ trả 15 video mới nhất.</span></div>` : ""}
      <div id="clip-list">${list()}</div>
      ${form}
    </div>`,
    footer: `<span class="spacer"></span><button class="btn" data-close type="button">Đóng</button>`,
  });
  const redraw = () => { $("#clip-list", o.el).innerHTML = list(); };
  const write = async (body, okMsg) => {
    try {
      const r = await api(`/creators/${encodeURIComponent(c.id)}/clips`, { method: "POST", body });
      clips = r.clips; cur = replaceCreator(r.creator) || cur; redraw();
      if (okMsg) toast(okMsg, c.name);
      return true;
    } catch (e) { toast("Chưa lưu được", errText(e), "danger"); return false; }
  };
  $("#clip-refresh", o.el)?.addEventListener("click", async (e) => {
    const b = e.currentTarget; b.disabled = true;
    await write({ op: "refresh" }, "Đã đọc lại kênh YouTube");
    b.disabled = false;
  });
  $("#clip-formula", o.el)?.addEventListener("click", () => openMetricsSettings());
  delegate(o.el, "click", "[data-rm]", (e, b) => write({ op: "remove", id: +b.dataset.rm }, "Đã xoá clip"));
  $("#clip-form", o.el)?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const n = (id) => { const v = $(id, o.el).value; return v === "" ? null : Math.max(0, Math.round(+v)); };
    const url = $("#cf-url", o.el).value.trim();
    if (!/^https:\/\//.test(url)) return toast("Link chưa đúng", "Dán link bắt đầu bằng https://", "danger");
    const ok = await write({ op: "add", platform, url, publishedAt: $("#cf-date", o.el).value || null, views: n("#cf-views") ?? 0, likes: n("#cf-likes"), comments: n("#cf-comments"), shares: n("#cf-shares") }, "Đã thêm clip");
    if (ok) { e.target.reset(); $("#cf-url", o.el).focus(); }
  });
}

/* ---------- Admin: công thức tính chỉ số ---------- */
export async function openMetricsSettings() {
  if (!can("admin")) return;
  let r;
  try { r = await api("/admin/metrics"); } catch (e) { return toast("Chưa tải được cài đặt", "Lỗi " + e.message, "danger"); }
  const s = r.settings;
  const num = (id, label, v, min, max, hint = "") => `<div class="field"><label for="${id}">${label}</label><input class="input" id="${id}" type="number" min="${min}" max="${max}" value="${v}" />${hint ? `<span class="field-hint">${hint}</span>` : ""}</div>`;
  const o = openOverlay({
    kind: "modal", title: "Công thức chỉ số creator",
    body: `<div class="stack">
      <p class="field-hint">Áp dụng cho mọi creator. Lưu xong hệ thống tính lại ngay từ các clip đã có (không cần đọc lại nền tảng).</p>
      <div class="field-row">${num("ms-n", "Số clip gần nhất dùng để tính", s.sampleSize, 3, 30)}${num("ms-min", "Tối thiểu (ít hơn thì không hiện số)", s.minSample, 1, 30)}</div>
      <div class="field-row">${num("ms-age", "Chỉ lấy clip trong (ngày)", s.maxAgeDays, 0, 730, "0 = không giới hạn")}
        <div class="field"><label for="ms-method">Cách lấy trung bình</label><select class="select" id="ms-method">${Object.entries(METHOD).map(([k, l]) => `<option value="${k}" ${k === s.method ? "selected" : ""}>${l}</option>`).join("")}</select></div></div>
      ${num("ms-trim", "Cắt ngọn: bỏ % clip cao nhất và thấp nhất", s.trimPct, 0, 40)}
      <fieldset class="card card-pad stack"><legend><strong>Engagement rate</strong></legend>
        <div class="row-wrap"><label class="check"><input type="checkbox" id="ms-likes" ${s.erLikes ? "checked" : ""} /> Like</label><label class="check"><input type="checkbox" id="ms-comments" ${s.erComments ? "checked" : ""} /> Comment</label><label class="check"><input type="checkbox" id="ms-shares" ${s.erShares ? "checked" : ""} /> Share</label></div>
        <div class="field"><label for="ms-base">Chia cho</label><select class="select" id="ms-base"><option value="views" ${s.erBase === "views" ? "selected" : ""}>View của từng clip (khuyên dùng)</option><option value="followers" ${s.erBase === "followers" ? "selected" : ""}>Số follower của kênh</option></select></div>
      </fieldset>
      <label class="check"><input type="checkbox" id="ms-auto" ${s.autoRefresh ? "checked" : ""} /> Tự động đọc lại kênh YouTube (mỗi giờ một nhóm nhỏ, mỗi kênh khoảng 1 lần/ngày)</label>
    </div>`,
    footer: `<button class="btn btn-ghost" type="button" id="ms-reset">Về mặc định</button><span class="spacer"></span><button class="btn" data-close type="button">Huỷ</button><button class="btn btn-primary" type="button" id="ms-save">Lưu & tính lại</button>`,
  });
  const fill = (x) => {
    $("#ms-n", o.el).value = x.sampleSize; $("#ms-min", o.el).value = x.minSample; $("#ms-age", o.el).value = x.maxAgeDays; $("#ms-method", o.el).value = x.method;
    $("#ms-trim", o.el).value = x.trimPct; $("#ms-likes", o.el).checked = x.erLikes; $("#ms-comments", o.el).checked = x.erComments; $("#ms-shares", o.el).checked = x.erShares;
    $("#ms-base", o.el).value = x.erBase; $("#ms-auto", o.el).checked = x.autoRefresh;
  };
  $("#ms-reset", o.el).addEventListener("click", () => fill(r.defaults));
  $("#ms-save", o.el).addEventListener("click", async (e) => {
    const v = (id) => +$(id, o.el).value;
    const next = { sampleSize: v("#ms-n"), minSample: v("#ms-min"), maxAgeDays: v("#ms-age"), method: $("#ms-method", o.el).value, trimPct: v("#ms-trim"), erBase: $("#ms-base", o.el).value, erLikes: $("#ms-likes", o.el).checked, erComments: $("#ms-comments", o.el).checked, erShares: $("#ms-shares", o.el).checked, autoRefresh: $("#ms-auto", o.el).checked };
    if (next.minSample > next.sampleSize) return toast("Kiểm tra lại", "Số clip tối thiểu không được lớn hơn số clip dùng để tính.", "danger");
    const b = e.currentTarget; b.disabled = true;
    try {
      const res = await api("/admin/metrics", { method: "POST", body: { settings: next } });
      o.close();
      toast("Đã lưu công thức", `Đã tính lại ${res.recomputed} kênh. Tải lại trang để thấy số mới ở mọi màn.`);
    } catch (err) { toast("Chưa lưu được", err.message === "bad_request" ? "Có giá trị ngoài khoảng cho phép." : "Lỗi " + err.message, "danger"); b.disabled = false; }
  });
}
