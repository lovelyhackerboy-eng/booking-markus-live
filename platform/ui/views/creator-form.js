// views/creator-form.js — sửa / thêm creator, GHI VÀO GOOGLE SHEET trước (Sheet vẫn là nguồn chính), rồi máy chủ nạp lại.
// Chỉ hiện khi máy chủ bật ghi Sheet (FEATURES.sheetWrite). Tên và link kênh không sửa ở đây: app cũ nhận diện creator
// qua chúng. Trường giá cần quyền "price", trường liên hệ / ghi chú cần quyền "contact" (máy chủ kiểm lại).
import { $, esc, icon, openOverlay, toast } from "../core/ui.js";
import { can, state, getCreator, emit } from "../core/store.js";
import { api, toCreator, regionShort } from "../data/live.js";
import { CATEGORIES } from "../core/filters.js";

const PLATS = [["tiktok", "TikTok"], ["facebook", "Facebook"], ["instagram", "Instagram"], ["youtube", "YouTube"]];
const TIERS = ["Nano", "Micro", "Mid-Tier", "Macro", "Celeb"];
const RELS = ["Đã hợp tác", "Đã báo giá", "Chưa liên hệ"];
const SOWS = [["photo", "Photo Post"], ["video", "Video Post"], ["event", "Tham gia sự kiện"], ["brandvideo", "Tham gia video của nhãn hàng"], ["live", "Livestream"]];
const ERR = {
  conflict: "Sheet vừa được sửa ở các ô dưới đây (giá trị mới đã nạp lại). Xem lại rồi lưu lần nữa.",
  not_on_sheet: "Creator này không có trên Google Sheet (dữ liệu mẫu hoặc tạo ở v2).",
  sheet_unavailable: "Chưa ghi được vào Google Sheet (máy chủ không gọi được Sheet). Thử lại sau.",
  row_moved: "Hàng của creator trên Sheet vừa bị dời (sắp xếp / chèn hàng). Thử lại sau ít giây.",
  name_taken: "Tên này đã có trên Sheet.",
  url_taken: "Link kênh này đã thuộc một creator khác trên Sheet",
  bad_link: "Link kênh không hợp lệ (cần dạng https://…/tên-kênh).",
  link_required: "Cần ít nhất một link kênh.",
  sheet_write_disabled: "Ghi Google Sheet đang tắt trên máy chủ.",
  forbidden: "Vai trò của bạn không sửa được trường này.",
  bad_email: "Email không hợp lệ.",
  bad_value: "Có giá trị không hợp lệ.",
};
const LABEL = { "followers.tiktok": "Follower TikTok", "followers.facebook": "Follower Facebook", "followers.instagram": "Follower Instagram", "followers.youtube": "Follower YouTube" };

const input = (id, label, value, attrs = "") => `<div class="field"><label for="cf-${id}">${esc(label)}</label><input class="input" id="cf-${id}" data-f="${id}" value="${esc(value ?? "")}" ${attrs} /></div>`;
const area = (id, label, value) => `<div class="field"><label for="cf-${id}">${esc(label)}</label><textarea class="input" id="cf-${id}" data-f="${id}" rows="2">${esc(value ?? "")}</textarea></div>`;
// Giá trị đang có mà không nằm trong danh sách vẫn được giữ làm 1 lựa chọn — để không vô tình xoá nó khi lưu.
const select = (id, label, value, options) => `<div class="field"><label for="cf-${id}">${esc(label)}</label><select class="select" id="cf-${id}" data-f="${id}"><option value="">—</option>${[...options, ...(value && !options.some(([v]) => v === String(value)) ? [[String(value), String(value)]] : [])].map(([v, t]) => `<option value="${esc(v)}" ${String(value ?? "") === v ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></div>`;
const group = (title, inner) => `<fieldset class="cf-group"><legend>${esc(title)}</legend><div class="field-row cf-grid">${inner}</div></fieldset>`;

// Giá trị hiện có của 1 creator, đúng như trên Sheet (dữ liệu thô từ API).
function current(c) {
  const r = c.raw || {};
  const v = {
    tier: r.tier ?? "", primaryCategory: r.primaryCategory ?? "", secondaryCategory: r.secondaryCategory ?? "", creatorType: r.creatorType ?? "",
    castingProfile: r.castingProfile ?? "", yearOfBirth: r.yearOfBirth ?? "", baseLocation: r.baseLocation ?? "", representation: r.representation ?? "",
    heroPlatform: r.heroPlatform ?? "", relationshipStatus: r.relationshipStatus ?? "", note: r.note ?? "",
  };
  PLATS.forEach(([p]) => { v["followers." + p] = c.channels[p] && c.channels[p].followers.value != null ? c.channels[p].followers.value : ""; });
  const ct = r.contact || {};
  ["contactPerson", "contactChannel", "contactDetail", "companyEmail", "companyPhone", "companyWebsite", "personalEmail", "personalPhone"].forEach((k) => { v[k] = ct[k] ?? ""; });
  SOWS.forEach(([s]) => { const rt = (c.rates || []).find((x) => x.sowKey === s); v["rate." + s] = rt ? rt.text : ""; });
  return v;
}

function formHtml(v, isNew) {
  const cats = [...new Set([...(CATEGORIES || []), v.primaryCategory, v.secondaryCategory].filter(Boolean))];
  return `<form id="cf" class="stack cf-form" novalidate>
    ${isNew ? group("Creator", `${input("name", "Tên creator *", "", 'required maxlength="190"')}
      ${PLATS.map(([p, t]) => input("link." + p, `Link ${t}`, "", 'placeholder="https://…"')).join("")}
      <p class="field-hint" style="grid-column:1/-1">Cần ít nhất 1 link kênh. Hệ thống chặn nếu tên hoặc link đã có trên Sheet.</p>`) : ""}
    ${group("Thông tin", `${select("tier", "Tier", v.tier, TIERS.map((t) => [t, t]))}
      ${select("heroPlatform", "Kênh chính", v.heroPlatform, PLATS)}
      ${input("primaryCategory", "Ngành chính", v.primaryCategory, 'list="cf-cats"')}${input("secondaryCategory", "Ngành phụ", v.secondaryCategory, 'list="cf-cats"')}
      <datalist id="cf-cats">${cats.map((c) => `<option value="${esc(c)}">`).join("")}</datalist>
      ${input("castingProfile", "Casting profile", v.castingProfile)}${input("creatorType", "Creator type", v.creatorType)}
      ${input("baseLocation", "Khu vực", v.baseLocation)}${input("yearOfBirth", "Năm sinh", v.yearOfBirth, 'inputmode="numeric" maxlength="4"')}
      ${input("representation", "Đại diện (Self-managed / Manager / MCN…)", v.representation)}`)}
    ${group("Follower (kênh chính hiện trên Khám phá)", PLATS.map(([p, t]) => input("followers." + p, t, v["followers." + p], 'inputmode="numeric" placeholder="vd 86000 hoặc 86K"')).join(""))}
    ${can("contact") ? group("Liên hệ & quan hệ (nội bộ)", `${select("relationshipStatus", "Trạng thái quan hệ", v.relationshipStatus, RELS.map((r) => [r, r]))}
      ${input("contactPerson", "Người liên hệ", v.contactPerson)}${input("contactChannel", "Kênh liên hệ", v.contactChannel)}
      ${input("personalPhone", "SĐT cá nhân", v.personalPhone)}${input("personalEmail", "Email cá nhân", v.personalEmail)}
      ${input("contactDetail", "Chi tiết liên hệ", v.contactDetail)}${input("companyPhone", "SĐT công ty", v.companyPhone)}
      ${input("companyEmail", "Email công ty", v.companyEmail)}${input("companyWebsite", "Website công ty", v.companyWebsite)}
      ${area("note", "Ghi chú (cột Note)", v.note)}`) : ""}
    ${can("price") ? group("Báo giá (ghi đúng như trên Sheet, vd “1 video: 12,000,000”)", SOWS.map(([s, t]) => area("rate." + s, t, v["rate." + s])).join("")) : ""}
    <p class="faint cf-msg" id="cf-msg" role="alert" hidden></p>
  </form>`;
}

const readForm = (el) => Object.fromEntries([...el.querySelectorAll("[data-f]")].map((x) => [x.dataset.f, x.value.trim()]));
const showErr = (el, html) => { const m = $("#cf-msg", el); m.innerHTML = html; m.hidden = false; m.scrollIntoView({ block: "nearest" }); };

function putCreator(raw) {
  if (!raw) return null;
  const c = toCreator(raw);
  const i = state.creators.findIndex((x) => x.id === c.id);
  if (i >= 0) state.creators[i] = c; else state.creators.unshift(c);
  emit("data");
  return c;
}

/** Sửa creator: chỉ gửi các ô đã đổi. */
export function openEditCreator(c) {
  if (!can("edit")) return;
  const before = current(c);
  const o = openOverlay({
    kind: "drawer", wide: true, title: `Sửa thông tin · ${c.name}`,
    body: `<p class="muted" style="margin-bottom:12px">${icon("data", 14)} Lưu sẽ ghi thẳng vào Google Sheet CREATOR_DB, rồi cập nhật lại app ngay. Tên và link kênh sửa trên Sheet.</p>${formHtml(before, false)}`,
    footer: `<span class="spacer"></span><button class="btn" data-close type="button">Huỷ</button><button class="btn btn-primary" type="button" id="cf-save">${icon("check", 16)} Lưu vào Sheet</button>`,
  });
  const saveBtn = $("#cf-save", o.el);
  saveBtn.addEventListener("click", async () => {
    const now = readForm(o.el);
    const changes = {};
    Object.keys(now).forEach((k) => { if (String(now[k]) !== String(before[k] ?? "")) changes[k] = now[k]; });
    if (!Object.keys(changes).length) return o.close();
    saveBtn.disabled = true;
    try {
      const r = await api(`/creators/${encodeURIComponent(c.id)}/edit`, { method: "POST", body: { changes } });
      putCreator(r.creator);
      o.close();
      toast("Đã lưu vào Google Sheet", `${Object.keys(changes).length} ô · ${c.name}`);
    } catch (err) {
      saveBtn.disabled = false;
      const body = err.body || {};
      if (body.creator) putCreator(body.creator);
      const list = (body.conflicts || []).map((x) => `<li>${esc(LABEL[x.field] || x.field)}: trên Sheet hiện là “${esc(x.sheet || "(trống)")}”</li>`).join("");
      showErr(o.el, `${esc(ERR[err.message] || "Chưa lưu được (" + err.message + ").")}${list ? `<ul class="bullets">${list}</ul>` : ""}`);
    }
  });
}

/** Màn Thêm creator (#/them-creator). */
export function render(el) {
  if (!can("edit")) { el.innerHTML = `<div class="card empty"><strong>Vai trò Viewer không thêm được creator.</strong></div>`; return; }
  el.innerHTML = `<div class="page-head"><h1>Thêm creator</h1><p class="muted">Ghi một hàng mới vào Google Sheet CREATOR_DB; creator hiện trong app sau vài giây.</p></div>
    <section class="card card-pad">${formHtml(Object.fromEntries(Object.keys(current({ channels: {}, rates: [] })).map((k) => [k, ""])), true)}
    <div class="row" style="margin-top:12px"><span class="spacer"></span><button class="btn btn-primary" type="button" id="cf-create">${icon("plus", 16)} Thêm vào Sheet</button></div></section>`;
  const norm = (u) => String(u || "").trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
  const createBtn = $("#cf-create", el);
  createBtn.addEventListener("click", async () => {
    const v = readForm(el);
    const links = Object.fromEntries(PLATS.map(([p]) => [p, v["link." + p]]).filter(([, u]) => u));
    if (!v.name) return showErr(el, "Cần tên creator.");
    if (!Object.keys(links).length) return showErr(el, esc(ERR.link_required));
    const dup = state.creators.find((c) => Object.values(c.channels).some((ch) => ch.url && Object.values(links).some((u) => norm(u) === norm(ch.url))));
    if (dup) return showErr(el, `${esc(ERR.url_taken)}: <a href="#/creator/${esc(dup.id)}">${esc(dup.name)}</a>.`);
    const fields = {};
    Object.entries(v).forEach(([k, val]) => { if (val && k !== "name" && !k.startsWith("link.")) fields[k] = val; });
    createBtn.disabled = true;
    try {
      const r = await api("/creators", { method: "POST", body: { name: v.name, links, labels: {}, fields } });
      const c = putCreator(r.creator);
      toast("Đã thêm vào Google Sheet", v.name);
      location.hash = c ? `#/creator/${c.id}` : "#/kham-pha";
    } catch (err) {
      createBtn.disabled = false;
      showErr(el, esc(ERR[err.message] || "Chưa thêm được (" + err.message + ").") + (err.body && err.body.existing ? `: ${esc(err.body.existing)}` : ""));
    }
  });
}
export const copilot = () => ({ label: "Thêm creator", actions: [] });
export { regionShort };
