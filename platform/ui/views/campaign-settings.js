// views/campaign-settings.js — hộp "Cài đặt campaign": thông tin, ngân sách, thời gian chạy, khung theo dõi bài đăng
// và các BƯỚC liên hệ (đổi tên, thêm, xoá, kéo thả sắp xếp, chọn bước "chốt booking").
// Xoá bước còn creator → phải chọn bước nhận họ (server cũng chặn: 409 step_has_entries).

import { $, esc, icon, delegate, openOverlay, toast } from "../core/ui.js";
import { can, canManageList, getList, updateCampaign, saveSteps } from "../core/store.js";
import { BRAND_NAMES } from "../core/filters.js";

const day = (v) => v || "";

export function openCampaignSettings(listId, focus = "") {
  const l = getList(listId);
  if (!l || !can("edit")) return;
  const manage = canManageList(l);
  let steps = l.steps.map((s) => ({ ...s, orig: s.key }));
  const used = (k) => l.entries.filter((e) => e.stage === k).length;

  const stepRows = () => steps.map((s, i) => `<li class="step-row" data-i="${i}" ${manage ? 'draggable="true"' : ""}>
      ${manage ? `<span class="step-grip" aria-hidden="true" title="Kéo để sắp xếp">${icon("grip", 16)}</span>` : ""}
      <label class="sr-only" for="st-${i}">Tên bước ${i + 1}</label>
      <input class="input" id="st-${i}" data-label="${i}" value="${esc(s.label)}" maxlength="80" ${manage ? "" : "disabled"} />
      <label class="step-final" title="Creator ở bước này được tính là đã chốt booking"><input type="radio" name="st-final" data-final="${i}" ${s.final ? "checked" : ""} ${manage ? "" : "disabled"} /> Chốt</label>
      <span class="faint num" title="Số creator đang ở bước này">${s.orig ? used(s.orig) : 0}</span>
      ${manage ? `<span class="step-move"><button class="btn btn-ghost btn-icon btn-sm" type="button" data-up="${i}" aria-label="Đưa bước ${esc(s.label)} lên" ${i ? "" : "disabled"}>${icon("chevU", 14)}</button><button class="btn btn-ghost btn-icon btn-sm" type="button" data-down="${i}" aria-label="Đưa bước ${esc(s.label)} xuống" ${i < steps.length - 1 ? "" : "disabled"}>${icon("chevD", 14)}</button><button class="btn btn-ghost btn-icon btn-sm" type="button" data-del="${i}" aria-label="Xoá bước ${esc(s.label)}" ${steps.length > 1 ? "" : "disabled"}>${icon("trash", 14)}</button></span>` : ""}
    </li>`).join("");

  const o = openOverlay({
    kind: "modal", wide: true, title: `Cài đặt · ${l.name}`,
    body: `<div class="stack settings-form">
      <div class="field-row">
        <div class="field"><label for="cs-name">Tên campaign</label><input class="input" id="cs-name" value="${esc(l.name)}" maxlength="190" /></div>
        <div class="field"><label for="cs-brand">Brand</label><select class="select" id="cs-brand"><option value="">— Không gắn brand —</option>${[...new Set([...BRAND_NAMES, l.brand].filter(Boolean))].map((b) => `<option ${b === l.brand ? "selected" : ""}>${esc(b)}</option>`).join("")}</select></div>
      </div>
      <div class="field"><label for="cs-desc">Mô tả / brief</label><textarea class="input" id="cs-desc" rows="3" maxlength="4000" placeholder="Mục tiêu, thông điệp, yêu cầu nội dung…">${esc(l.description)}</textarea></div>
      <div class="field-row">
        <div class="field"><label for="cs-kpi">KPI view mục tiêu</label><input class="input" id="cs-kpi" type="number" min="0" value="${l.kpiViews || ""}" /></div>
        ${can("price") ? `<div class="field"><label for="cs-budget">Ngân sách (VND)</label><input class="input" id="cs-budget" type="number" min="0" step="100000" value="${l.budget ?? ""}" /></div>` : ""}
      </div>
      <div class="field-row">
        <div class="field"><label for="cs-start">Ngày bắt đầu</label><input class="input" id="cs-start" type="date" value="${day(l.startDate)}" /></div>
        <div class="field"><label for="cs-end">Ngày kết thúc</label><input class="input" id="cs-end" type="date" value="${day(l.endDate)}" /></div>
      </div>
      <fieldset class="card card-pad stack" id="cs-track-box">
        <legend><strong>Theo dõi bài đăng</strong></legend>
        <label class="check"><input type="checkbox" id="cs-auto" ${l.autoTrack ? "checked" : ""} /> Tự động tìm bài đăng / clip của creator đã chốt trong khoảng ngày bên dưới</label>
        <div class="field-row">
          <div class="field"><label for="cs-tfrom">Theo dõi từ ngày</label><input class="input" id="cs-tfrom" type="date" value="${day(l.trackFrom)}" /></div>
          <div class="field"><label for="cs-tto">Đến ngày</label><input class="input" id="cs-tto" type="date" value="${day(l.trackTo)}" /></div>
        </div>
        <p class="field-hint">YouTube cập nhật tự động mỗi ngày. TikTok, Facebook, Instagram: dán link bài đăng và nhập số liệu ở tab Theo dõi (nền tảng chặn đọc tự động).</p>
      </fieldset>
      <fieldset class="card card-pad stack" id="cs-steps-box">
        <legend><strong>Các bước liên hệ</strong> <span class="faint">(cột của kanban)</span></legend>
        ${manage ? "" : `<p class="field-hint">Chỉ người phụ trách, Quản lý và Admin sửa được các bước.</p>`}
        <ol class="step-list" id="cs-steps">${stepRows()}</ol>
        ${manage ? `<div class="row-wrap"><button class="btn btn-sm" type="button" id="cs-add">${icon("plus", 14)} Thêm bước</button><span class="faint">Kéo ${icon("grip", 12)} để sắp xếp. Bước “Chốt” là bước tính booking trong báo cáo.</span></div>` : ""}
        <div id="cs-move" class="field" hidden></div>
      </fieldset>
    </div>`,
    footer: `<span class="spacer"></span><button class="btn" data-close type="button">Huỷ</button><button class="btn btn-primary" type="button" id="cs-save">Lưu cài đặt</button>`,
  });
  const box = $("#cs-steps", o.el);
  const redraw = () => { box.innerHTML = stepRows(); moveField(); };
  const removedWithEntries = () => l.steps.filter((s) => !steps.some((x) => x.orig === s.key) && used(s.key) > 0);
  function moveField() {
    const lost = removedWithEntries(), f = $("#cs-move", o.el);
    f.hidden = !lost.length;
    if (!lost.length) return (f.innerHTML = "");
    const keep = steps.filter((x) => x.orig);
    f.innerHTML = `<label for="cs-moveto">${lost.reduce((n, s) => n + used(s.key), 0)} creator đang ở bước bị xoá (${esc(lost.map((s) => s.label).join(", "))}). Chuyển họ sang:</label>
      <select class="select" id="cs-moveto">${keep.map((x) => `<option value="${esc(x.orig)}">${esc(x.label)}</option>`).join("")}</select>
      ${keep.length ? "" : `<p class="field-hint">Giữ lại ít nhất một bước cũ để nhận creator, hoặc lưu bước mới trước.</p>`}`;
  }
  if (focus === "steps") $("#cs-steps-box", o.el).scrollIntoView({ block: "start" });
  if (focus === "track") $("#cs-track-box", o.el).scrollIntoView({ block: "start" });

  delegate(o.el, "input", "[data-label]", (e, inp) => { steps[+inp.dataset.label].label = inp.value; });
  delegate(o.el, "change", "[data-final]", (e, r) => { steps.forEach((s, i) => (s.final = i === +r.dataset.final)); });
  const swap = (i, j) => { [steps[i], steps[j]] = [steps[j], steps[i]]; redraw(); box.querySelector(`[data-i="${j}"] input`)?.focus(); };
  delegate(o.el, "click", "[data-up]", (e, b) => swap(+b.dataset.up, +b.dataset.up - 1));
  delegate(o.el, "click", "[data-down]", (e, b) => swap(+b.dataset.down, +b.dataset.down + 1));
  delegate(o.el, "click", "[data-del]", (e, b) => { const [gone] = steps.splice(+b.dataset.del, 1); if (gone.final && steps.length) steps[steps.length - 1].final = true; redraw(); });
  delegate(o.el, "click", "#cs-add", () => { const fi = steps.findIndex((s) => s.final); steps.splice(fi < 0 ? steps.length : fi, 0, { label: "Bước mới", final: false, orig: "" }); redraw(); const n = box.querySelectorAll("input[data-label]"); const inp = n[fi < 0 ? n.length - 1 : fi]; inp?.focus(); inp?.select(); });
  // Kéo thả sắp xếp bước
  let from = -1;
  box.addEventListener("dragstart", (e) => { const li = e.target.closest("[data-i]"); if (!li) return; from = +li.dataset.i; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(from)); li.classList.add("is-dragging"); });
  box.addEventListener("dragover", (e) => { if (from < 0) return; e.preventDefault(); const li = e.target.closest("[data-i]"); box.querySelectorAll(".is-over").forEach((n) => n.classList.remove("is-over")); li?.classList.add("is-over"); });
  box.addEventListener("dragend", () => { from = -1; box.querySelectorAll(".is-dragging,.is-over").forEach((n) => n.classList.remove("is-dragging", "is-over")); });
  box.addEventListener("drop", (e) => { const li = e.target.closest("[data-i]"); if (from < 0 || !li) return; e.preventDefault(); const to = +li.dataset.i; const [m] = steps.splice(from, 1); steps.splice(to, 0, m); from = -1; redraw(); });

  $("#cs-save", o.el).addEventListener("click", async () => {
    const v = (id) => $(id, o.el)?.value ?? "";
    const name = v("#cs-name").trim();
    if (!name) return $("#cs-name", o.el).focus();
    const tf = v("#cs-tfrom") || null, tt = v("#cs-tto") || null;
    if (tf && tt && tf > tt) return toast("Kiểm tra lại ngày", "Ngày bắt đầu theo dõi phải trước ngày kết thúc.", "danger");
    const sd = v("#cs-start") || null, ed = v("#cs-end") || null;
    if (sd && ed && sd > ed) return toast("Kiểm tra lại ngày", "Ngày bắt đầu phải trước ngày kết thúc.", "danger");
    if ($("#cs-auto", o.el).checked && !tf) return toast("Thiếu ngày theo dõi", "Chọn “Theo dõi từ ngày” để bật theo dõi tự động.", "danger");
    const fields = { name, brand: v("#cs-brand"), description: v("#cs-desc").trim(), kpiViews: +v("#cs-kpi") || 0, startDate: sd, endDate: ed, autoTrack: $("#cs-auto", o.el).checked, trackFrom: tf, trackTo: tt };
    if (can("price")) fields.budget = v("#cs-budget") === "" ? null : Math.round(+v("#cs-budget"));
    const btn = $("#cs-save", o.el);
    btn.disabled = true;
    const ok = await updateCampaign(l.id, fields);
    if (ok && manage) {
      const clean = steps.map((s) => ({ ...(s.orig ? { key: s.orig } : {}), label: s.label.trim() || "Bước", final: !!s.final }));
      const changed = JSON.stringify(clean) !== JSON.stringify(l.steps.map((s) => ({ key: s.key, label: s.label, final: !!s.final })));
      if (changed && !(await saveSteps(l.id, clean, removedWithEntries().length ? v("#cs-moveto") : ""))) { btn.disabled = false; return; }
    }
    btn.disabled = false;
    if (!ok) return;
    o.close();
    toast("Đã lưu cài đặt campaign", name);
  });
}
