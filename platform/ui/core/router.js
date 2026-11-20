// core/router.js — hash router tối giản. Tương đương router() + currentView() trong app.js hiện tại.
// Mỗi view là 1 module: export function render(root, params) [+ export function copilot(params)].
// Mỗi lần đổi route, <main> nhận 1 <div> mới → listener của màn cũ tự mất, không rò rỉ.

import { animateCounts } from "./ui.js";

const routes = []; // { pattern: ["creator", ":id"], view, nav }
let mainEl, onChange, active = null;

/** route("creator/:id", viewModule, "kham-pha") — nav = id mục menu được tô sáng. */
export function route(path, view, nav) { routes.push({ parts: path.split("/"), view, nav }); }

function parse() {
  const [path, query = ""] = location.hash.replace(/^#\/?/, "").split("?");
  const segs = path.split("/").filter(Boolean);
  for (const r of routes) {
    if (r.parts.length !== segs.length) continue;
    const params = Object.fromEntries(new URLSearchParams(query));
    if (r.parts.every((p, i) => (p[0] === ":" ? ((params[p.slice(1)] = decodeURIComponent(segs[i])), true) : p === segs[i]))) return { ...r, params };
  }
  return null;
}

function render(isNavigation = false) {
  const hit = parse();
  if (!hit) { location.hash = "#/kham-pha"; return; }
  active = hit;
  const root = document.createElement("div");
  mainEl.replaceChildren(root);
  hit.view.render(root, hit.params);
  // Hiệu ứng chỉ chạy khi ĐỔI MÀN (không chạy lại mỗi lần dữ liệu thay đổi để tránh nháy).
  if (isNavigation) { root.querySelector(".page")?.classList.add("is-entering"); animateCounts(root); }
  onChange(hit);
}

export function start(el, cb) {
  mainEl = el; onChange = cb;
  window.addEventListener("hashchange", () => { render(true); window.scrollTo(0, 0); mainEl.focus({ preventScroll: true }); });
  render(true);
}
/** Vẽ lại màn hiện tại (sau khi đổi vai trò / dữ liệu) — giữ nguyên vị trí cuộn. */
export function refresh() { if (active) { const y = window.scrollY; render(); window.scrollTo(0, y); } }
export const current = () => active;
export const go = (hash) => { if (location.hash === hash) refresh(); else location.hash = hash; };
/** Đổi query (?tab=…) mà không tạo mục lịch sử mới và không vẽ lại. */
export const setQuery = (path, query) => history.replaceState(null, "", "#/" + path + (query ? "?" + new URLSearchParams(query) : ""));
