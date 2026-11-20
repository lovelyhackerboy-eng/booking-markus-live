// views/lookalike.js — Drawer "Tìm creator tương tự" (Lookalike Discovery, brief IV.2).
// Mở được từ từng kết quả ở Khám phá và từ hồ sơ creator. Kết quả luôn quy về bộ lọc nhìn thấy được
// ("Mở trong Khám phá") để người dùng tự nới / siết tiếp.

import { $, esc, icon, delegate, openOverlay, fmtNum, fmtPct } from "../core/ui.js";
import { state, setFilters } from "../core/store.js";
import { emptyFilters, heroCh, rateFor } from "../core/filters.js";
import { lookalike } from "../ai/mock-ai.js";
import { plat, money, creatorCell, brandStack } from "../core/parts.js";
import { openSaveMenu, saveLabel } from "./lists.js";

export function openLookalike(c) {
  const sims = lookalike(c, state.creators, 6);
  const o = openOverlay({
    kind: "drawer", title: `Creator tương tự ${c.name}`,
    body: `<p class="muted" style="margin-bottom:12px">${icon("sparkles", 14)} AI so khớp theo type, ngành, tier, hero platform và audience. Creator Do-Not-Recommend đã được loại.</p>
      <div class="stack stagger">${sims.map((x) => `<div class="card card-pad lift"><div class="sim-row">${creatorCell(x.c)}<span class="score" title="Độ tương đồng">${x.similarity}%</span></div>
        <div class="why" style="margin:8px 0">${x.why.map((w) => `<span class="why-ok">${esc(w)}</span>`).join("")}</div>
        <div class="row-wrap"><span class="muted num">${plat(x.c.hero)} ${fmtNum(heroCh(x.c).followers.value)} · ER ${fmtPct(heroCh(x.c).er.value)} · ${rateFor(x.c) ? money(rateFor(x.c).amount) : "chưa có giá"}</span>${brandStack(x.c, 3)}<span class="spacer"></span>
        <button class="btn btn-sm btn-primary" type="button" data-save="${x.c.id}" aria-haspopup="menu">${saveLabel(x.c.id)}</button></div></div>`).join("") || `<p class="faint">Chưa tìm thấy creator đủ giống.</p>`}</div>`,
    footer: `<button class="btn" type="button" id="sim-discover">${icon("sliders", 16)} Mở trong Khám phá</button><span class="spacer"></span><button class="btn btn-primary" data-close type="button">Xong</button>`,
  });
  delegate(o.el, "click", "[data-save]", (e, b) => openSaveMenu(b, b.dataset.save));
  $("#sim-discover", o.el).addEventListener("click", () => {
    setFilters({ ...emptyFilters(), types: [c.type], categories: [c.categories[0]], heroes: [c.hero] }, { query: `Tương tự ${c.name}`, leftover: [], priceSkipped: false });
    o.close();
    location.hash = "#/kham-pha";
  });
}
