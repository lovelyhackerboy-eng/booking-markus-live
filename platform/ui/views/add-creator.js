// views/add-creator.js — MÀN 3: Thêm creator. Ba đường vào, MỘT form / một hàm tạo hồ sơ:
//   (a) Dán link / văn bản → AI điền form → kiểm tra trùng → người dùng xác nhận   [đường chính]
//   (b) Import Google Sheet / Excel → AI tự khớp cột → xem trước, bỏ dòng trùng → nhập hàng loạt
//   (c) Nhập tay (chính form của (a) với bản nháp rỗng)
// Brief IV.5 Input Automation: "một form", "tự nhận diện creator đã tồn tại", "nhập profile links một lần, hệ thống tự liên kết các nền tảng".
// Thay cho kolDbForm() + aiFillBox() + aiFillForm() + aiAddMulti() + saveKolDb() trong app.js.

import { $, esc, icon, delegate, toast, fmtNum, fmtVnd, NOW } from "../core/ui.js";
import { state, can, me, addCreatorWithQueue, addCreators } from "../core/store.js";
import { PLATFORMS, TEAM, tierOf } from "../data/catalog.js";
import { CREATOR_TYPES, CATEGORIES, REGIONS, FAMILY, VIA } from "../core/filters.js";
import { extractCreator, findDuplicates, parseCsv, matchColumns, normalizeImportRow, IMPORT_FIELDS } from "../ai/mock-ai.js";
import { post } from "../ai/copilot.js";
import { refresh, go } from "../core/router.js";
import { plat, creatorCell, pageHead, lockedCard, relBadge, emptyArt } from "../core/parts.js";

const SAMPLES = [
  { label: "Link + mô tả (creator mới)", text: "Tên: Phùng Ngọc Ánh - mommy ở Hà Nội, có con nhỏ, ngành mẹ & bé\nhttps://www.tiktok.com/@anhphung.mom 64k follower\nhttps://www.instagram.com/anhphung.mom\nGiá 9tr/video, zalo 0988 555 199, anhphung@example.com" },
  { label: "Chỉ có link", text: "https://www.tiktok.com/@khoa.reviewxe\nhttps://www.youtube.com/@khoa.reviewxe\nhttps://facebook.com/khoa.reviewxe" },
  { label: "Creator đã tồn tại", text: "https://www.tiktok.com/@mesoc.daily\nMẹ Sóc, mommy Hà Nội, 90k follower" },
];
// File mẫu dùng đúng tên cột của Google Sheet CREATOR_DB hiện tại (xem buildCreatorCols() trong app.js).
const SAMPLE_CSV = `Creator_Name,Tier,Primary_Category,Creator_Type,Casting_Profile,Year_Of_Birth,Base_Location,Representation,Contact_Detail,Personal_Email,Hero_Platform,TikTok,Sub_TikTok,Instagram,Sub_IG,YouTube,Sub_YouTube,Video,Relationship_Status
Lưu Thanh Tâm,Micro,Mẹ & Bé,Mommy,Nữ,1993,Hà Nội,Trực tiếp,0966 555 201,tam.luu@example.com,TikTok,https://www.tiktok.com/@tamluu.mom,58K,https://instagram.com/tamluu.mom,9K,,,"9.000.000",Đã báo giá
Nguyễn Thu Hà,Micro,Mẹ & Bé,Mommy,Nữ,1992,Hà Nội,Trực tiếp,0910 555 101,,TikTok,https://www.tiktok.com/@mesoc.daily,86K,,,,,"12.000.000",Đã làm việc
Hồ Minh Quân,Mid-Tier,Công nghệ,Reviewer,Nam,1996,TP.HCM,Trực tiếp,0966 555 203,quan.ho@example.com,YouTube,https://www.tiktok.com/@quanreview,120K,,,https://youtube.com/@quanreview,185K,"22.000.000",TBU
Đoàn Khả Vy,Micro,Beauty,KOC,Nữ,2001,Đà Nẵng,Trực tiếp,0966 555 204,,Instagram,https://www.tiktok.com/@khavy.daily,18K,https://instagram.com/khavy.daily,41K,,,"3.500.000",
Bùi Quỳnh Chi,Mid-Tier,Beauty,Beauty Blogger,Nữ,1998,TP.HCM,Trực tiếp,,,TikTok,https://www.tiktok.com/@chiquynh.skin,380K,,,,,"30.000.000",Đã làm việc
Trịnh Gia Bảo,Micro,F&B,Food Blogger,Nam,1997,Hải Phòng,Trực tiếp,0966 555 206,bao.trinh@example.com,TikTok,https://www.tiktok.com/@baoanhaiphong,72K,,,,,"8.000.000",Đã báo giá
Mai Phương Linh,Mid-Tier,Lifestyle,Lifestyle,Nữ,1995,Cần Thơ,MCN ABC,0966 555 207,booking@abc-mcn.example.com,TikTok,https://www.tiktok.com/@linhmai.life,240K,https://instagram.com/linhmai.life,66K,,,"20.000.000",
,Nano,Fashion,KOC,Nữ,2002,Hà Nội,Trực tiếp,,,TikTok,,4K,,,,,,`;
const STEPS = { ai: ["Dán link hoặc mô tả", "Kiểm tra bản nháp", "Lưu hồ sơ"], import: ["Chọn file / sheet", "Khớp cột & xem trước", "Nhập xong"] };
const fresh = (mode = "ai") => ({ mode, step: 0, text: "", draft: null, dups: [], ack: false, savedId: "", queued: 0, imp: null, result: null });

// Trạng thái wizard (giữ ở module để đổi vai trò / vẽ lại không mất bản nháp)
let st = fresh();
let root = null;

export function render(el, params = {}) {
  root = el;
  if (!can("edit")) { root.innerHTML = `<div class="page">${pageHead("Thêm creator", "Thêm hồ sơ mới vào CSDL.")}${lockedCard("Chức năng thêm creator")}</div>`; return; }
  if (params.mode === "import" && st.step === 0) st.mode = "import";
  root.innerHTML = `
  <div class="page add">
    ${pageHead("Thêm creator", "Dán link, import bảng tính hoặc nhập tay — AI điền sẵn, bạn kiểm tra rồi lưu.")}
    ${st.step === 0 ? `<div class="segmented" role="group" aria-label="Cách thêm creator" style="align-self:flex-start">
      <button type="button" data-mode="ai" aria-pressed="${st.mode === "ai"}">${icon("sparkles", 14)} Dán link / văn bản</button>
      <button type="button" data-mode="import" aria-pressed="${st.mode === "import"}">${icon("import", 14)} Import Google Sheet / Excel</button>
    </div>` : ""}
    <ol class="stepper" aria-label="Các bước">${STEPS[st.mode].map((s, i) => `<li class="${i < st.step ? "is-done" : ""}" ${i === st.step ? 'aria-current="step"' : ""}><span>${s}</span></li>`).join("")}</ol>
    <div id="step"></div>
  </div>`;
  delegate(root, "click", "[data-mode]", (e, b) => { st = fresh(b.dataset.mode); history.replaceState(null, "", "#/them-creator"); refresh(); });
  (st.mode === "import" ? [stepUpload, stepMapping, stepImported] : [stepPaste, stepReview, stepDone])[st.step]();
}
// Mọi lần đổi bước đều vẽ lại qua router.refresh() (root mới → không cộng dồn listener).
const goStep = (n) => { st.step = n; refresh(); window.scrollTo(0, 0); };

/* ====================================================================
   Hàm tạo hồ sơ dùng chung cho cả 3 đường vào.
   v = { name, handle?, type, category, region, gender, yob, family, hero, via, phone, email, owner, rate, note,
         channels: { platform: { handle, followers, er?, avgViews?, ai? } } }  — ai = số do AI đọc, chưa ai sửa
   metricSource: nguồn ghi cho chỉ số không phải AI ("manual" khi người dùng gõ, "manual" + chưa xác minh khi lấy từ sheet).
   ==================================================================== */
function buildRecord(id, v, { verify = "verified", createdNote }) {
  const now = NOW.toISOString();
  const mainHandle = (v.handle || v.channels[v.hero]?.handle || v.name.toLowerCase().replace(/\s+/g, ".")).replace(/^@/, "");
  const channels = {}, queue = [];
  Object.entries(v.channels).forEach(([p, ch]) => {
    if (!ch.followers) return;
    const m = (value) => ({ value, source: ch.ai ? "ai" : "manual", updatedAt: now, verify: ch.ai ? "pending" : verify });
    channels[p] = { url: PLATFORMS[p].base + (ch.handle || mainHandle), handle: "@" + (ch.handle || mainHandle), tier: tierOf(ch.followers),
      followers: m(ch.followers), er: m(ch.er || 0), avgViews: m(ch.avgViews || 0), growth: Array(8).fill(ch.followers), growthPct: 0 };
    if (ch.ai) queue.push({ id: `RQ-${id}-${p}`, creatorId: id, platform: p, metric: "followers", proposed: ch.followers, source: "ai", at: now, confidence: 0.6, isNew: true });
  });
  const record = {
    id, name: v.name, alias: "", handle: "@" + mainHandle, yob: v.yob || null, age: v.yob ? NOW.getFullYear() - v.yob : null, gender: v.gender || "Chưa rõ",
    family: v.family || "", familyNote: "", job: "Chưa rõ", region: v.region, type: v.type, categories: [v.category], formats: [], hero: v.hero, tier: channels[v.hero].tier,
    channels, audience: { female: 50, age: "chưa có dữ liệu", cities: [v.region], tags: [] }, labels: [], content: [],
    rates: v.rate ? [{ platform: v.hero, sow: "Video ngắn", amount: v.rate, updatedAt: now, source: createdNote }] : [],
    terms: { usage: "Chưa thoả thuận", excl: "Chưa thoả thuận", cond: "Chưa thoả thuận" },
    rel: { status: "network", owner: v.owner || me(), via: v.via || "direct", manager: "", score: null, resp: "Chưa có dữ liệu", nego: "Chưa có dữ liệu", channel: "Zalo",
      contact: { person: v.name, phone: v.phone || "Chưa có", email: v.email || "Chưa có", zalo: v.phone || "Chưa có" } },
    brands: [], notes: [{ at: now, by: me(), text: createdNote + (v.note ? ` Ghi chú gốc: “${v.note}”.` : ""), kind: "" }],
    lastSynced: now, createdAt: now,
  };
  return { record, queue };
}
const nextId = (offset = 0) => "CR-" + String(state.creators.length + 1 + offset).padStart(4, "0");

/* ====================================================================
   (a) AI: Bước 1 — dán
   ==================================================================== */
function stepPaste() {
  $("#step", root).innerHTML = `
  <div class="add-grid">
    <section class="card card-pad stack" style="border-color:var(--ai-border)">
      <h2>${icon("sparkles", 16)} Dán link hoặc văn bản</h2>
      <div class="field">
        <label for="paste">Link TikTok / Facebook / Instagram / YouTube / Threads, rate card, tin nhắn Zalo, brief…</label>
        <textarea class="textarea" id="paste" style="min-height:160px" placeholder="https://www.tiktok.com/@ten.creator&#10;https://www.instagram.com/ten.creator&#10;Mommy ở Hà Nội, 60k follower, giá 8tr/video…">${esc(st.text)}</textarea>
      </div>
      <div class="row-wrap"><span class="faint">Thử với:</span>${SAMPLES.map((s, i) => `<button class="chip" type="button" data-sample="${i}">${esc(s.label)}</button>`).join("")}</div>
      <div class="row-wrap">
        <button class="btn btn-primary" type="button" id="btn-extract">${icon("sparkles", 16)} AI đọc & điền form</button>
        <button class="btn btn-ghost" type="button" id="btn-manual">Bỏ qua, nhập tay</button>
      </div>
    </section>
    <aside class="card card-pad stack">
      <h2>AI sẽ làm gì?</h2>
      <ul class="bullets">
        <li>Nhận diện nền tảng từ từng link và <strong>liên kết về một hồ sơ</strong>.</li>
        <li>Đọc tên, ngành, khu vực, giá, liên hệ từ văn bản.</li>
        <li>Ước tính follower từ trang công khai — đánh dấu <strong>“Chờ duyệt”</strong>, không coi là chính xác.</li>
        <li>So với CSDL để cảnh báo <strong>creator có thể đã tồn tại</strong>.</li>
      </ul>
      <p class="faint">Không có gì được lưu cho tới khi bạn bấm “Lưu hồ sơ” ở bước 2.</p>
    </aside>
  </div>`;
  delegate($("#step", root), "click", "[data-sample]", (e, b) => { $("#paste", root).value = SAMPLES[+b.dataset.sample].text; $("#paste", root).focus(); });
  $("#btn-extract", root).addEventListener("click", () => {
    st.text = $("#paste", root).value;
    if (!st.text.trim()) return $("#paste", root).focus();
    st.draft = extractCreator(st.text);
    st.dups = findDuplicates(st.draft, state.creators);
    st.ack = false;
    goStep(1);
  });
  $("#btn-manual", root).addEventListener("click", () => { st.text = ""; st.draft = { fields: {}, links: {}, metrics: {}, missing: [], found: 0, manual: true }; st.dups = []; st.ack = false; goStep(1); });
}

/* ====================================================================
   (a) AI: Bước 2 — xem lại bản nháp
   ==================================================================== */
function stepReview() {
  const d = st.draft;
  const F = d.fields;
  const v = (k) => (F[k] ? F[k].value : "");
  // 1 trường form: viền tím nếu AI điền (kèm độ tin cậy + nguồn), viền vàng nếu bắt buộc mà còn trống.
  const field = (key, label, control, { required = false } = {}) => {
    const ai = F[key] && !F[key].byUser ? F[key] : null;
    return `<div class="field ${ai ? "is-ai" : ""} ${required && !F[key] ? "is-missing" : ""}" data-field="${key}" data-required="${required}">
      <label for="in-${key}">${label}${required ? " *" : ""}</label>${control}
      <span class="field-hint">${ai ? `${icon("sparkles", 12)} AI điền · tin cậy ${Math.round(ai.conf * 100)}% · ${esc(ai.from)}` : required && !F[key] ? "Cần nhập" : "&nbsp;"}</span></div>`;
  };
  const input = (key, attrs = "") => `<input class="input" id="in-${key}" name="${key}" value="${esc(v(key))}" ${attrs} />`;
  const select = (key, options, labels = {}) => `<select class="select" id="in-${key}" name="${key}"><option value="">— Chọn —</option>${options.map((o) => `<option value="${esc(o)}" ${String(v(key)) === String(o) ? "selected" : ""}>${esc(labels[o] || o)}</option>`).join("")}</select>`;
  const filled = Object.values(F).filter((x) => !x.byUser).length;

  $("#step", root).innerHTML = `
  <form id="creator-form" class="stack" novalidate>
    ${st.dups.length ? `<div class="banner banner-danger" role="alert">${icon("alert")}<div>
        <strong>Creator có thể đã tồn tại</strong>
        <div class="stack" style="margin-top:8px">${st.dups.map((x) => `<div class="card card-pad dup-card"><div class="sim-row">${creatorCell(x.c)}<span class="score score-mid">${Math.round(x.score * 100)}% trùng</span></div>
          <div class="row-wrap" style="margin-top:8px"><span class="muted">${esc(x.reasons.join(" · "))}</span>${relBadge(x.c.rel.status)}<span class="spacer"></span>
          <a class="btn btn-sm btn-primary" href="#/creator/${x.c.id}">Mở hồ sơ có sẵn</a></div></div>`).join("")}</div>
        <label class="check" style="margin-top:12px"><input type="checkbox" id="dup-ack" ${st.ack ? "checked" : ""} /> Tôi đã kiểm tra, đây là creator khác — vẫn tạo hồ sơ mới</label>
      </div></div>` : d.manual ? "" : `<div class="banner banner-success">${icon("check")}<div><strong>Không thấy trùng trong CSDL</strong>Đã so handle, tên và số điện thoại với ${state.creators.length} hồ sơ.</div></div>`}
    ${d.manual ? `<div class="banner">${icon("edit")}<div><strong>Nhập tay</strong>Điền các trường có dấu *. Hệ thống vẫn kiểm tra trùng khi lưu.</div></div>`
      : `<div class="banner banner-ai">${icon("sparkles")}<div><strong>AI đã điền ${filled} trường${d.missing.length ? `, còn ${d.missing.length} trường bắt buộc cần bạn nhập` : ""}</strong>Ô viền tím là do AI điền — hãy kiểm tra. Ô viền vàng là trường bắt buộc còn trống.</div></div>`}

    <section class="card">
      <div class="card-head"><h2>Kênh mạng xã hội</h2><span class="faint">Một hồ sơ — nhiều nền tảng</span></div>
      <div class="card-pad stack">
        ${Object.keys(PLATFORMS).map((p) => { const l = d.links[p], m = d.metrics[p]; return `<div class="ch-row">
          ${plat(p)}<span class="ch-row-name">${PLATFORMS[p].label}</span>
          <input class="input" name="handle_${p}" aria-label="Handle ${PLATFORMS[p].label}" placeholder="handle hoặc link" value="${esc(l ? l.handle : "")}" />
          <input class="input" name="followers_${p}" type="number" min="0" aria-label="Follower ${PLATFORMS[p].label}" placeholder="Follower" value="${m ? m.followers : ""}" />
          <span class="ch-row-src">${m ? (m.source === "ai" ? `<span class="src src-ai">AI đọc</span> <span class="verify verify-pending">● Chờ duyệt</span>` : `<span class="src src-manual">Bạn nhập</span>`) : ""}</span></div>`; }).join("")}
        <div class="field-row">
          ${field("hero", "Hero platform", select("hero", Object.keys(PLATFORMS), Object.fromEntries(Object.entries(PLATFORMS).map(([k, x]) => [k, x.label]))), { required: true })}
          <div class="field"><span class="field-label">Overall tier</span><div class="input" id="tier-out" style="display:flex;align-items:center">${esc(v("tier") || "Tự tính từ follower")}</div><span class="field-hint">Tự tính, không cần nhập</span></div>
        </div>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h2>Chân dung</h2></div>
      <div class="card-pad form-grid">
        ${field("name", "Tên creator", input("name"), { required: true })}
        ${field("handle", "Handle chính", input("handle", 'placeholder="@handle"'))}
        ${field("type", "Creator type", select("type", CREATOR_TYPES), { required: true })}
        ${field("category", "Ngành nội dung chính", select("category", CATEGORIES), { required: true })}
        ${field("region", "Khu vực", select("region", REGIONS), { required: true })}
        ${field("gender", "Giới tính", select("gender", ["Nữ", "Nam"]))}
        ${field("yob", "Năm sinh", input("yob", 'type="number" min="1950" max="2012" placeholder="VD: 1995"'))}
        ${field("family", "Gia đình", select("family", Object.keys(FAMILY), FAMILY))}
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h2>Thương mại & liên hệ</h2></div>
      <div class="card-pad form-grid">
        ${field("rate", "Giá tham chiếu (triệu ₫ / video)", `<input class="input" id="in-rate" name="rate" type="number" min="0" step="0.5" value="${F.rate ? F.rate.value / 1e6 : ""}" />`)}
        ${field("via", "Kênh làm việc", select("via", Object.keys(VIA), VIA))}
        ${field("phone", "Zalo / SĐT", input("phone", 'inputmode="tel"'))}
        ${field("email", "Email", input("email", 'type="email"'))}
        <div class="field"><label for="in-owner">Người phụ trách</label><select class="select" id="in-owner" name="owner">${TEAM.map((t) => `<option ${t === me() ? "selected" : ""}>${esc(t)}</option>`).join("")}</select><span class="field-hint">&nbsp;</span></div>
      </div>
    </section>

    <div class="form-foot">
      <button class="btn" type="button" id="btn-back">${icon("chevL", 16)} Quay lại</button>
      <span class="spacer"></span>
      <span class="faint" id="save-hint"></span>
      <button class="btn btn-primary" type="submit" id="btn-save">${icon("check", 16)} Lưu hồ sơ</button>
    </div>
  </form>`;

  const form = $("#creator-form", root);
  const syncSave = () => {
    const blocked = st.dups.length && !st.ack;
    $("#btn-save", root).disabled = !!blocked;
    $("#save-hint", root).textContent = blocked ? "Hãy xử lý cảnh báo trùng ở trên trước." : "";
  };
  syncSave();
  $("#btn-back", root).addEventListener("click", () => goStep(0));
  delegate(form, "change", "#dup-ack", (e, cb) => { st.ack = cb.checked; syncSave(); });
  // Người dùng sửa 1 ô AI điền → bỏ viền tím (đã được con người xác nhận)
  form.addEventListener("input", (e) => {
    const wrap = e.target.closest("[data-field]");
    if (wrap) { wrap.classList.remove("is-ai"); wrap.classList.toggle("is-missing", wrap.dataset.required === "true" && !e.target.value); $(".field-hint", wrap).textContent = e.target.value ? "Đã sửa tay" : wrap.dataset.required === "true" ? "Cần nhập" : ""; }
    const hero = form.elements.hero.value;
    const f = hero ? +form.elements["followers_" + hero].value : 0;
    $("#tier-out", root).textContent = f ? tierOf(f) : "Tự tính từ follower";
  });
  form.addEventListener("submit", (e) => { e.preventDefault(); save(form); });
}

/** Chép mọi giá trị đang có trên form vào bản nháp để vẽ lại (ví dụ khi hiện cảnh báo trùng) không mất dữ liệu đã gõ. */
function capture(form) {
  const F = st.draft.fields;
  ["name", "handle", "type", "category", "region", "gender", "yob", "family", "via", "phone", "email", "hero"].forEach((k) => {
    const val = form.elements[k].value.trim();
    if (!val) delete F[k];
    else if (!F[k] || String(F[k].value) !== val) F[k] = { value: val, conf: 1, from: "Bạn nhập", byUser: true };
  });
  const rate = +form.elements.rate.value * 1e6;
  if (!rate) delete F.rate; else if (!F.rate || F.rate.value !== rate) F.rate = { value: rate, conf: 1, from: "Bạn nhập", byUser: true };
  Object.keys(PLATFORMS).forEach((p) => {
    const h = form.elements["handle_" + p].value.trim().replace(/^.*[@/]/, "");
    if (h) st.draft.links[p] = { handle: h, url: PLATFORMS[p].base + h }; else delete st.draft.links[p];
    const fl = +form.elements["followers_" + p].value;
    const old = st.draft.metrics[p];
    if (!fl) delete st.draft.metrics[p];
    else if (!old || old.followers !== fl) st.draft.metrics[p] = { er: null, avgViews: null, ...(old || {}), followers: fl, source: "manual" };
  });
}

function save(form) {
  capture(form);
  const d = st.draft, val = (k) => (d.fields[k] ? d.fields[k].value : "");
  const required = [["name", "Tên creator"], ["type", "Creator type"], ["category", "Ngành nội dung"], ["region", "Khu vực"], ["hero", "Hero platform"]];
  const miss = required.filter(([k]) => !val(k));
  if (miss.length) { form.elements[miss[0][0]].focus(); return toast("Còn thiếu trường bắt buộc", miss.map((m) => m[1]).join(", "), "warning"); }
  const hero = val("hero");
  if (!d.metrics[hero]) { form.elements["followers_" + hero].focus(); return toast("Thiếu follower của hero platform", `Nhập follower ${PLATFORMS[hero].label} để tính tier.`, "warning"); }

  // Kiểm tra trùng lần cuối trên dữ liệu ĐÃ SỬA (bắt cả trường hợp nhập tay).
  const dups = findDuplicates(d, state.creators);
  if (dups.length && !st.ack) { st.dups = dups; toast("Creator có thể đã tồn tại", dups[0].c.name, "danger"); return goStep(1); }

  const channels = {};
  Object.entries(d.metrics).forEach(([p, m]) => { channels[p] = { handle: d.links[p]?.handle || "", followers: m.followers, er: m.er, avgViews: m.avgViews, ai: m.source === "ai" }; });
  const id = nextId();
  const { record, queue } = buildRecord(id, {
    name: val("name"), handle: val("handle"), type: val("type"), category: val("category"), region: val("region"), gender: val("gender"), yob: +val("yob") || null,
    family: val("family"), hero, via: val("via"), phone: val("phone"), email: val("email"), owner: form.elements.owner.value, rate: +val("rate") || 0, channels,
  }, { createdNote: d.manual ? "Tạo hồ sơ bằng form nhập tay." : "Tạo hồ sơ từ link / văn bản dán vào (AI điền, đã được người dùng kiểm tra)." });
  const name = record.name;
  st = { ...fresh("ai"), step: 2, savedId: id, queued: queue.length };
  toast("Đã tạo hồ sơ creator", `${name} · ${id}`);
  addCreatorWithQueue(record, queue); // phát "data" → router vẽ lại → hiện bước 3
}

/* ---------- (a) Bước 3: xong ---------- */
function stepDone() {
  const c = state.creators.find((x) => x.id === st.savedId);
  $("#step", root).innerHTML = `<div class="card empty">${emptyArt("done")}
    <strong>Đã lưu hồ sơ ${esc(c ? c.name : "")}</strong>
    ${c ? `${esc(c.id)} · ${esc(c.type)} · ${esc(c.tier)} · ${fmtNum(c.channels[c.hero].followers.value)} follower ${PLATFORMS[c.hero].label}` : ""}
    ${st.queued ? `<p style="margin-top:8px">${st.queued} chỉ số do AI đọc đang ở trạng thái <span class="verify verify-pending">● Chờ duyệt</span> — duyệt tại <a href="#/du-lieu">Dữ liệu & đồng bộ</a>.</p>` : ""}
    <div class="row-wrap" style="justify-content:center">
      ${c ? `<a class="btn btn-primary" href="#/creator/${c.id}">Mở hồ sơ</a>` : ""}
      <button class="btn" type="button" id="btn-again">${icon("plus", 16)} Thêm creator khác</button>
      <a class="btn btn-ghost" href="#/kham-pha">Về Khám phá</a>
    </div></div>`;
  $("#btn-again", root).addEventListener("click", () => { st = fresh("ai"); refresh(); });
}

/* ====================================================================
   (b) Import: Bước 1 — chọn file / dán link sheet
   ==================================================================== */
function loadTable(text, fileName) {
  const { headers, rows } = parseCsv(text);
  if (!headers.length || !rows.length) return toast("Không đọc được dữ liệu", "File cần có dòng tiêu đề và ít nhất 1 dòng dữ liệu.", "warning");
  st.imp = { fileName, headers, rows, mapping: matchColumns(headers), skip: null };
  goStep(1);
}
function stepUpload() {
  $("#step", root).innerHTML = `
  <div class="add-grid">
    <section class="card card-pad stack">
      <h2>${icon("import", 16)} Đưa bảng tính creator vào hệ thống</h2>
      <div class="dropzone" id="dz">
        ${icon("import", 28)}
        <strong>Kéo thả file vào đây</strong>
        <span class="faint">CSV hoặc XLSX xuất từ Google Sheet / Excel</span>
        <label class="btn btn-primary" for="file">Chọn file</label>
        <input class="sr-only" type="file" id="file" accept=".csv,.tsv,.txt,.xlsx,.xls" />
      </div>
      <div class="field"><label for="sheet-url">Hoặc dán link Google Sheet</label>
        <div class="range-row"><input class="input" id="sheet-url" type="url" placeholder="https://docs.google.com/spreadsheets/d/…" /><button class="btn" type="button" id="btn-sheet">Đọc sheet</button></div>
        <span class="field-hint">Prototype: link sheet và file XLSX được giả lập bằng dữ liệu mẫu có cấu trúc của CREATOR_DB.</span></div>
      <div><button class="btn btn-ghost" type="button" id="btn-sample">${icon("sparkles", 16)} Dùng file mẫu CREATOR_DB</button> <span class="faint">8 dòng, có dòng trùng và dòng thiếu tên</span></div>
    </section>
    <aside class="card card-pad stack">
      <h2>Biến bảng tính thành danh sách sống</h2>
      <ul class="bullets">
        <li><strong>Tự khớp cột</strong> — AI nhận ra Creator_Name, Sub_TikTok, Base_Location… và ghép vào đúng trường.</li>
        <li><strong>Tự phát hiện trùng</strong> — dòng trùng handle / tên với CSDL được bỏ qua mặc định.</li>
        <li><strong>Luôn cập nhật</strong> — sau khi nhập, follower và engagement được crawler làm mới; số từ sheet được ghi nguồn “Nhập tay · chưa xác minh”.</li>
        <li><strong>Không ghi đè</strong> — hồ sơ đã có giữ nguyên lịch sử, ghi chú và booking.</li>
      </ul>
    </aside>
  </div>`;
  const dz = $("#dz", root);
  const readFile = (file) => {
    if (!file) return;
    if (/\.xlsx?$/i.test(file.name)) { toast("Prototype chưa đọc XLSX", "Đang dùng dữ liệu mẫu thay cho " + file.name, "warning"); return loadTable(SAMPLE_CSV, file.name); }
    const fr = new FileReader();
    fr.onload = () => loadTable(String(fr.result), file.name);
    fr.readAsText(file);
  };
  $("#file", root).addEventListener("change", (e) => readFile(e.target.files[0]));
  ["dragenter", "dragover"].forEach((t) => dz.addEventListener(t, (e) => { e.preventDefault(); dz.classList.add("is-over"); }));
  ["dragleave", "drop"].forEach((t) => dz.addEventListener(t, (e) => { e.preventDefault(); dz.classList.remove("is-over"); }));
  dz.addEventListener("drop", (e) => readFile(e.dataTransfer.files[0]));
  $("#btn-sample", root).addEventListener("click", () => loadTable(SAMPLE_CSV, "CREATOR_DB-mau.csv"));
  $("#btn-sheet", root).addEventListener("click", () => { if (!$("#sheet-url", root).value.trim()) return $("#sheet-url", root).focus(); loadTable(SAMPLE_CSV, "Google Sheet: CREATOR_DB"); });
}

/* ---------- (b) Bước 2: khớp cột + xem trước ---------- */
const LISTS = { types: CREATOR_TYPES, categories: CATEGORIES, regions: REGIONS };
function previewRows() {
  const imp = st.imp;
  return imp.rows.map((row, i) => {
    const n = normalizeImportRow(row, imp.mapping, LISTS);
    const dup = n.problems.length ? null : findDuplicates(n.draft, state.creators)[0] || null;
    return { i, ...n, dup, status: n.problems.length ? "invalid" : dup ? "dup" : "new" };
  });
}
function stepMapping() {
  const imp = st.imp;
  const rows = previewRows();
  if (!imp.skip) imp.skip = new Set(rows.filter((r) => r.status !== "new").map((r) => r.i)); // mặc định bỏ dòng trùng / lỗi
  const matched = imp.mapping.filter((m) => m.target).length;
  const willImport = rows.filter((r) => r.status !== "invalid" && !imp.skip.has(r.i));
  $("#step", root).innerHTML = `
  <div class="stack">
    <div class="banner banner-ai">${icon("sparkles")}<div><strong>AI đã khớp ${matched}/${imp.headers.length} cột của “${esc(imp.fileName)}”</strong>Kiểm tra lại cột có độ tin cậy thấp. Cột không khớp sẽ bị bỏ qua, không mất dữ liệu ở file gốc.</div></div>
    <section class="card">
      <div class="card-head"><h2>Khớp cột</h2><span class="faint">${imp.rows.length} dòng dữ liệu</span></div>
      <div class="dt-wrap" style="border:0;border-radius:0"><table class="dt map-table">
        <thead><tr><th>Cột trong file</th><th>Dữ liệu mẫu</th><th>Khớp với trường</th><th>Độ tin cậy</th></tr></thead>
        ${imp.mapping.map((m, i) => `<tbody><tr>
          <td class="t-main"><strong>${esc(m.header)}</strong></td>
          <td data-label="Dữ liệu mẫu"><div class="map-sample" title="${esc(imp.rows.map((r) => r[i]).filter(Boolean).slice(0, 2).join(" · "))}">${esc(imp.rows.map((r) => r[i]).filter(Boolean).slice(0, 2).join(" · ") || "—")}</div></td>
          <td data-label="Khớp với trường"><select class="select" data-map="${i}" aria-label="Trường cho cột ${esc(m.header)}"><option value="">— Bỏ qua cột này —</option>${Object.entries(IMPORT_FIELDS).map(([k, l]) => `<option value="${k}" ${m.target === k ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></td>
          <td data-label="Độ tin cậy">${m.target ? (m.conf ? `<span class="badge ${m.conf < 0.8 ? "badge-warning" : "badge-ai"}">${icon("sparkles", 12)} ${Math.round(m.conf * 100)}%</span>` : `<span class="badge">Bạn chọn</span>`) : `<span class="faint">${esc(m.reason || "Bỏ qua")}</span>`}</td>
        </tr></tbody>`).join("")}
      </table></div>
    </section>
    <section class="card">
      <div class="card-head"><h2>Xem trước</h2><span class="row-wrap"><span class="badge badge-success">${rows.filter((r) => r.status === "new").length} mới</span><span class="badge badge-warning">${rows.filter((r) => r.status === "dup").length} có thể trùng</span><span class="badge badge-danger">${rows.filter((r) => r.status === "invalid").length} thiếu dữ liệu</span></span></div>
      <div class="dt-wrap" style="border:0;border-radius:0"><table class="dt">
        <thead><tr><th class="t-check"><span class="sr-only">Nhập</span></th><th>Creator</th><th>Hero platform</th><th>Type · Ngành · Khu vực</th><th class="t-right">Giá video</th><th>Kết quả kiểm tra</th></tr></thead>
        ${rows.map((r) => { const v = r.values; return `<tbody class="${r.status === "invalid" ? "is-flagged" : ""}"><tr>
          <td class="t-check"><label class="check"><input type="checkbox" data-row="${r.i}" ${r.status === "invalid" ? "disabled" : ""} ${!imp.skip.has(r.i) && r.status !== "invalid" ? "checked" : ""} aria-label="Nhập dòng ${r.i + 2}" /></label></td>
          <td class="t-main"><strong>${esc(v.name || "(không có tên)")}</strong><span class="dt-sub">Dòng ${r.i + 2} · ${esc(Object.values(v.channels).map((c) => c.handle).filter(Boolean)[0] || "chưa có handle")}</span></td>
          <td data-label="Hero platform">${v.hero ? `<span class="row" style="gap:6px">${plat(v.hero)} <strong class="num">${fmtNum(v.channels[v.hero].followers)}</strong> <span class="faint">${tierOf(v.channels[v.hero].followers)}</span></span>` : `<span class="faint">—</span>`}</td>
          <td data-label="Type · Ngành · Khu vực">${esc([v.type, v.category, v.region].filter(Boolean).join(" · ") || "—")}</td>
          <td data-label="Giá video" class="t-right">${v.rate ? fmtVnd(v.rate) : "—"}</td>
          <td data-label="Kết quả kiểm tra" class="t-full">${r.status === "new" ? `<span class="badge badge-success">✓ Mới</span>` : r.status === "dup" ? `<span class="badge badge-warning">Có thể trùng</span> <a href="#/creator/${r.dup.c.id}">${esc(r.dup.c.name)}</a><span class="dt-sub">${esc(r.dup.reasons.join(" · "))}</span>` : `<span class="badge badge-danger">Không nhập được</span><span class="dt-sub">${esc(r.problems.join(", "))}</span>`}</td>
        </tr></tbody>`; }).join("")}
      </table></div>
    </section>
    <div class="form-foot">
      <button class="btn" type="button" id="btn-back">${icon("chevL", 16)} Chọn file khác</button>
      <span class="spacer"></span>
      <span class="faint">Dòng trùng được bỏ qua mặc định — tick lại nếu bạn chắc chắn là creator khác.</span>
      <button class="btn btn-primary" type="button" id="btn-import" ${willImport.length ? "" : "disabled"}>${icon("check", 16)} Nhập ${willImport.length} creator</button>
    </div>
  </div>`;
  const step = $("#step", root);
  delegate(step, "change", "[data-map]", (e, s) => {
    const i = +s.dataset.map;
    imp.mapping.forEach((m, k) => { if (k !== i && s.value && m.target === s.value) { m.target = ""; m.conf = 0; m.reason = "Đã chuyển sang cột khác"; } }); // 1 trường chỉ nhận 1 cột
    imp.mapping[i] = { ...imp.mapping[i], target: s.value, conf: 0, reason: s.value ? "" : "Bạn bỏ qua" };
    imp.skip = null;
    refresh();
  });
  delegate(step, "change", "[data-row]", (e, cb) => { cb.checked ? imp.skip.delete(+cb.dataset.row) : imp.skip.add(+cb.dataset.row); refresh(); });
  $("#btn-back", root).addEventListener("click", () => { st.imp = null; goStep(0); });
  $("#btn-import", root).addEventListener("click", () => {
    const records = willImport.map((r, k) => buildRecord(nextId(k), { ...r.values, owner: me() }, { verify: "unverified", createdNote: `Nhập từ bảng tính “${imp.fileName}” (dòng ${r.i + 2}).` }).record);
    st = { ...fresh("import"), step: 2, result: { n: records.length, skipped: rows.length - records.length, file: imp.fileName, names: records.map((r) => r.name) } };
    toast("Đã nhập bảng tính", `${records.length} creator mới`);
    addCreators(records); // phát "data" → vẽ lại → bước 3
  });
}

/* ---------- (b) Bước 3: xong ---------- */
function stepImported() {
  const r = st.result || { n: 0, skipped: 0, file: "", names: [] };
  $("#step", root).innerHTML = `<div class="card empty">${emptyArt("done")}
    <strong>Đã nhập ${r.n} creator từ “${esc(r.file)}”</strong>
    ${esc(r.names.join(", "))}
    <p style="margin-top:8px">${r.skipped} dòng bị bỏ qua (trùng hoặc thiếu dữ liệu). Chỉ số từ bảng tính được ghi nguồn <span class="src src-manual">Nhập tay</span> <span class="verify verify-unverified">● Chưa xác minh</span> và sẽ được crawler làm mới ở lần đồng bộ tới.</p>
    <div class="row-wrap" style="justify-content:center">
      <a class="btn btn-primary" href="#/kham-pha">Xem ở Khám phá</a>
      <a class="btn" href="#/du-lieu?tab=creator">Mở Dữ liệu & đồng bộ</a>
      <button class="btn btn-ghost" type="button" id="btn-again">Nhập file khác</button>
    </div></div>`;
  $("#btn-again", root).addEventListener("click", () => { st = fresh("import"); refresh(); });
}

export function copilot() {
  return {
    label: "Thêm creator",
    actions: [
      { label: "Cần dán gì để AI điền tốt nhất?", match: /dan gi|huong dan|cach/, run: () => post(`<strong>Để AI điền chính xác nhất, hãy dán:</strong><ul><li>Link hồ sơ trên từng nền tảng (mỗi dòng 1 link).</li><li>Dòng “Tên: …” nếu tên thật khác handle.</li><li>Mô tả ngắn: type, ngành, khu vực, có con nhỏ…</li><li>Rate card dạng “9tr/video”, SĐT / email liên hệ.</li></ul>`) },
      { label: "Kiểm tra trùng hoạt động thế nào?", match: /trung|ton tai/, run: () => post(`AI so <strong>handle</strong> trên mọi nền tảng, <strong>tên / alias</strong> và <strong>số điện thoại</strong> với toàn bộ CSDL. Nếu nghi trùng, nút Lưu bị khoá cho tới khi bạn mở hồ sơ có sẵn hoặc xác nhận đây là creator khác. Khi import bảng tính, dòng trùng được bỏ qua mặc định.`) },
      { label: "Import Google Sheet hiện tại", match: /import|sheet|excel/, run: () => post(`Chọn tab <strong>Import Google Sheet / Excel</strong>, đưa file CSV xuất từ sheet CREATOR_DB (hoặc dùng file mẫu). AI tự khớp cột, bạn xem trước rồi mới nhập.`, [{ label: "Mở import", primary: true, run: () => { st = fresh("import"); go("#/them-creator?mode=import"); } }]) },
    ],
  };
}
