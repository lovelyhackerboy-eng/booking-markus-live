// core/art.js — minh hoạ SVG sinh theo "hạt giống" (seed) từ id creator: avatar, thumbnail nội dung, cover hồ sơ,
// vòng điểm (ring), đồng hồ working score (gauge), hình minh hoạ cho trạng thái rỗng.
// KHÔNG tải ảnh từ mạng. Màu lấy hoàn toàn từ token (--g1a…--g8b, --art-fg, --art-ink, --primary, --accent…)
// nên mỗi hướng visual tự có bộ minh hoạ riêng mà không phải sửa file này.
// PORT: khi có ảnh thật (avatar / thumbnail do crawler lấy về) → thay avatarArt()/thumbArt() bằng <img loading="lazy">,
//       giữ SVG làm ảnh dự phòng khi ảnh lỗi.

let n = 0;
const uid = (p) => p + ++n; // id gradient / clipPath phải duy nhất trên toàn trang
export const seedOf = (s) => [...String(s)].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 7);
function rng(seed) { let a = seed | 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const grad = (id, tone, x2 = 1, y2 = 1) => `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop offset="0" style="stop-color:var(--g${tone}a)"/><stop offset="1" style="stop-color:var(--g${tone}b)"/></linearGradient>`;
export const toneOf = (c) => (seedOf(c.id + c.name) % 8) + 1;

/* ---------- Avatar: chân dung tối giản (vai, đầu, kiểu tóc theo seed) trên nền gradient ---------- */
const HAIR = {
  long: `<path d="M17 31c0-11.500 6.300-18.500 15-18.500S47 19.500 47 31v13.500c0 2.800-3.300 3.700-5 1.800L40 39H24l-2 7.300c-1.700 1.900-5 1-5-1.800z"/>`,
  bob: `<path d="M18.500 30c0-10.500 5.700-16.500 13.500-16.500S45.500 19.500 45.500 30v7.500c0 1.800-2.300 2.500-3.700 1.300L41 29H23l-.8 9.800c-1.400 1.200-3.700.500-3.700-1.300z"/>`,
  bun: `<circle cx="32" cy="12.500" r="5.200"/>`,
  short: "",
  crop: "",
};
const FRINGE = {
  long: `<path d="M21.300 27.500c0-7.300 4.600-12 10.700-12s10.700 4.700 10.700 12c-3.200-1-6.700-3.600-8.700-6.700-2.600 3.700-7 6.200-12.700 6.700z"/>`,
  bob: `<path d="M21.300 27c0-7 4.600-11.500 10.700-11.500S42.700 20 42.700 27c-4.200-.500-8-2.500-10.700-5.800C29.300 24.500 25.500 26.500 21.300 27z"/>`,
  bun: `<path d="M21.300 26.500c0-6.800 4.600-11 10.700-11s10.700 4.200 10.700 11c-2.800-2.700-6.300-4.200-10.700-4.200s-7.900 1.500-10.700 4.200z"/>`,
  short: `<path d="M21.200 26c.300-7 4.800-11.200 10.800-11.200S42.500 19 42.800 26c-2.300-2.900-5.800-4.300-10.800-4.300S23.500 23.100 21.200 26z"/>`,
  crop: `<path d="M21.300 24.500c.800-6 5.200-9.700 10.700-9.700s9.900 3.700 10.700 9.700c-1.700-1.300-3.200-1.800-4.700-1.800l-1.500-2.200-1.500 2H29l-1.500-2-1.500 2.200c-1.500 0-3 .500-4.700 1.800z"/>`,
};
export function avatarArt(c) {
  const seed = seedOf(c.id + c.name), r = rng(seed);
  const tone = (seed % 8) + 1, bg = uid("av"), clip = uid("avc");
  const kinds = c.gender === "Nam" ? ["short", "crop"] : c.gender === "Nữ" ? ["long", "bob", "bun"] : ["short", "bob"];
  const hair = kinds[seed % kinds.length];
  const glasses = seed % 5 === 0;
  return `<svg class="avatar-art" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <defs>${grad(bg, tone)}<clipPath id="${clip}"><circle cx="32" cy="32" r="32"/></clipPath></defs>
    <g clip-path="url(#${clip})">
      <rect width="64" height="64" fill="url(#${bg})"/>
      <circle cx="${(10 + r() * 44).toFixed(1)}" cy="${(6 + r() * 18).toFixed(1)}" r="${(16 + r() * 10).toFixed(1)}" style="fill:var(--art-fg)" opacity=".13"/>
      <circle cx="${(4 + r() * 20).toFixed(1)}" cy="${(46 + r() * 14).toFixed(1)}" r="${(8 + r() * 8).toFixed(1)}" style="fill:var(--art-fg)" opacity=".1"/>
      <g style="fill:var(--art-ink)">${HAIR[hair]}</g>
      <path d="M9 66c0-14 10-22.500 23-22.500S55 52 55 66z" style="fill:var(--art-fg)"/>
      <rect x="28" y="34" width="8" height="12" rx="3.500" style="fill:var(--art-fg)" opacity=".86"/>
      <circle cx="32" cy="27.500" r="10.700" style="fill:var(--art-fg)"/>
      <g style="fill:var(--art-ink)">${FRINGE[hair]}</g>
      ${glasses ? `<g fill="none" style="stroke:var(--art-ink)" stroke-width="1.300"><circle cx="27.700" cy="29" r="3.300"/><circle cx="36.300" cy="29" r="3.300"/><path d="M31 29h2"/></g>` : ""}
    </g></svg>`;
}

/* ---------- Thumbnail nội dung: nền gradient + hình khối + icon chủ đề (theo ngành) + nút play ---------- */
const TOPIC = { // glyph nét, viewBox 24×24
  "Mẹ & Bé": '<path d="M12 20.500s-7.300-4.500-9.200-9C1.500 8.400 3.200 5.400 6.200 5c2-.300 3.700.800 5.800 3 2.100-2.200 3.800-3.300 5.800-3 3 .400 4.700 3.400 3.400 6.500-1.900 4.500-9.200 9-9.200 9z"/>',
  "Gia đình": '<path d="M3 11.500 12 4l9 7.500"/><path d="M5.500 10v10h13V10"/><path d="M10 20v-5.500h4V20"/>',
  "Beauty": '<path d="M12 3l2.300 6.700L21 12l-6.700 2.300L12 21l-2.300-6.700L3 12l6.700-2.300z"/>',
  "F&B": '<path d="M4.500 8.500h12v4.500a6 6 0 0 1-12 0z"/><path d="M16.500 9.500h1.800a2.700 2.700 0 0 1 0 5.400h-2"/><path d="M8 5.500c0-1 1-1 1-2M12 5.500c0-1 1-1 1-2"/><path d="M4 21h13"/>',
  "Công nghệ": '<rect x="7" y="2.500" width="10" height="19" rx="2.200"/><path d="M10.500 18.500h3"/>',
  "Du lịch": '<path d="m2.500 19.500 6.500-11 4.200 6.800 2.300-3.300 6 7.500z"/><circle cx="17.500" cy="6" r="2.300"/>',
  "Fashion": '<path d="m8.500 3.500 3.500 2 3.500-2 5.500 4-2.800 3.300L16.500 9.500v11h-9v-11L5.800 10.800 3 7.500z"/>',
  "Lifestyle": '<circle cx="12" cy="12" r="4"/><path d="M12 2.500v2.500M12 19v2.500M2.500 12H5M19 12h2.500M5.300 5.300 7 7M17 17l1.700 1.700M5.300 18.700 7 17M17 7l1.700-1.700"/>',
  "Game": '<rect x="2.500" y="7.500" width="19" height="10" rx="5"/><path d="M7 10.500v4M5 12.500h4"/><circle cx="15.500" cy="11.300" r=".9"/><circle cx="18" cy="13.700" r=".9"/>',
  "Giáo dục": '<path d="M3.500 5.500c3-1 5.800-.700 8.500 1 2.700-1.700 5.500-2 8.500-1V19c-3-1-5.800-.700-8.500 1-2.700-1.700-5.500-2-8.500-1z"/><path d="M12 6.500V20"/>',
  "Tài chính": '<path d="M4 20V11M9.300 20V5M14.700 20v-7M20 20V8"/>',
  "Fitness": '<path d="M3 9.500v5M6 7v10M18 7v10M21 9.500v5M6 12h12"/>',
  "Sức khoẻ": '<path d="M12 5v14M5 12h14"/><rect x="3" y="3" width="18" height="18" rx="5"/>',
  "Gia dụng": '<path d="M3 11.500 12 4l9 7.500"/><path d="M5.500 10v10h13V10"/>',
  "Giải trí": '<path d="M12 3l2.700 5.700 6.300.800-4.600 4.300 1.200 6.200L12 17l-5.600 3 1.200-6.200L3 9.500l6.300-.800z"/>',
  "*": '<rect x="3" y="6" width="13" height="12" rx="2.500"/><path d="m16 10.500 5-3v9l-5-3z"/>',
};
export function thumbArt(item, c) {
  const seed = seedOf(c.id + item.title), r = rng(seed), bg = uid("th");
  const topic = TOPIC[c.categories[0]] || TOPIC["*"];
  const rot = Math.round(-14 + r() * 28), gx = Math.round(118 + r() * 34), gy = Math.round(8 + r() * 26);
  return `<svg class="thumb-art" viewBox="0 0 200 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <defs>${grad(bg, item.tone, 1, 1)}</defs>
    <rect width="200" height="120" fill="url(#${bg})"/>
    <circle cx="${Math.round(20 + r() * 60)}" cy="${Math.round(10 + r() * 40)}" r="${Math.round(34 + r() * 26)}" style="fill:var(--thumb-ink)" opacity=".1"/>
    <rect x="${Math.round(-20 + r() * 40)}" y="${Math.round(70 + r() * 20)}" width="150" height="70" rx="18" transform="rotate(${Math.round(-12 + r() * 8)} 60 100)" style="fill:var(--thumb-ink)" opacity=".09"/>
    <g opacity=".34" style="fill:var(--thumb-ink)">${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<circle cx="${14 + (i % 4) * 9}" cy="${96 + Math.floor(i / 4) * 9}" r="1.500"/>`).join("")}</g>
    <g transform="translate(${gx} ${gy}) rotate(${rot} 34 34) scale(2.900)" fill="none" style="stroke:var(--thumb-ink)" stroke-width="1.500" stroke-linecap="round" stroke-linejoin="round" opacity=".5">${topic}</g>
    <circle cx="100" cy="54" r="17" style="fill:var(--thumb-ink)" opacity=".2"/>
    <circle cx="100" cy="54" r="17" fill="none" style="stroke:var(--thumb-ink)" stroke-width="1.200" opacity=".7"/>
    <path d="M95 45v18l15-9z" style="fill:var(--thumb-ink)"/>
  </svg>`;
}

/* ---------- Cover hồ sơ: gradient + sóng + chấm, sinh theo creator ---------- */
export function coverArt(c) {
  const seed = seedOf(c.id + "cover"), r = rng(seed), bg = uid("cv"), glow = uid("cvg");
  const tone = toneOf(c);
  const wave = (y, amp, o) => { const a = y + r() * amp, b = y - r() * amp, d = y + r() * amp; return `<path d="M0 ${a.toFixed(0)}C300 ${b.toFixed(0)} 500 ${(y + amp).toFixed(0)} 760 ${d.toFixed(0)}S1100 ${b.toFixed(0)} 1200 ${a.toFixed(0)}V240H0z" style="fill:var(--thumb-ink)" opacity="${o}"/>`; };
  return `<svg class="cover-art" viewBox="0 0 1200 240" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <defs>${grad(bg, tone, 1, 0.6)}<radialGradient id="${glow}"><stop offset="0" style="stop-color:var(--thumb-ink)" stop-opacity=".34"/><stop offset="1" style="stop-color:var(--thumb-ink)" stop-opacity="0"/></radialGradient></defs>
    <rect width="1200" height="240" fill="url(#${bg})"/>
    <circle cx="${Math.round(780 + r() * 320)}" cy="${Math.round(r() * 80)}" r="${Math.round(170 + r() * 90)}" fill="url(#${glow})"/>
    <circle cx="${Math.round(120 + r() * 260)}" cy="${Math.round(200 + r() * 60)}" r="${Math.round(120 + r() * 80)}" fill="url(#${glow})"/>
    ${wave(150, 46, 0.1)}${wave(182, 34, 0.1)}${wave(210, 22, 0.12)}
    <g style="fill:var(--thumb-ink)" opacity=".3">${Array.from({ length: 40 }, (_, i) => `<circle cx="${900 + (i % 10) * 22}" cy="${28 + Math.floor(i / 10) * 22}" r="1.800"/>`).join("")}</g>
  </svg>`;
}

/* ---------- Ring: điểm phù hợp AI 0–100 dạng vòng tròn ---------- */
export function ring(pct, { size = 46, label = "Độ phù hợp" } = {}) {
  const id = uid("rg");
  return `<span class="ring" style="--p:${Math.max(0, Math.min(100, pct)) / 100};width:${size}px;height:${size}px" role="img" aria-label="${label} ${pct} trên 100" title="${label}: ${pct}/100">
    <svg viewBox="0 0 44 44" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--score-a, var(--accent))"/><stop offset="1" style="stop-color:var(--score-b, var(--ai))"/></linearGradient></defs>
      <circle class="ring-track" cx="22" cy="22" r="18"/><circle class="ring-bar" cx="22" cy="22" r="18" stroke="url(#${id})"/></svg>
    <b class="num">${pct}</b></span>`;
}

/* ---------- Gauge: working score 0–5 dạng đồng hồ tròn ---------- */
export function gauge(score, { max = 5, size = 92, caption = "/ 5" } = {}) {
  const id = uid("gg"), has = score != null && score !== "";
  const text = has ? String(score).replace(".", ",") : "—";
  return `<span class="gauge" style="--p:${has ? score / max : 0};width:${size}px;height:${size}px" role="img" aria-label="Working score ${has ? text + " trên " + max : "chưa có"}">
    <svg viewBox="0 0 88 88" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="1" x2="1" y2="0"><stop offset="0" style="stop-color:var(--ai)"/><stop offset="1" style="stop-color:var(--accent)"/></linearGradient></defs>
      <circle class="gauge-track" cx="44" cy="44" r="36"/><circle class="gauge-bar" cx="44" cy="44" r="36" stroke="url(#${id})"/></svg>
    <span class="gauge-val"><b class="num">${text}</b><small>${has ? caption : "chưa có"}</small></span></span>`;
}

/* ---------- Minh hoạ trạng thái rỗng ---------- */
const EMPTY = {
  search: `<circle cx="52" cy="42" r="22" class="ea-fill"/><circle cx="52" cy="42" r="22" class="ea-line"/><path d="m68 58 16 16" class="ea-line ea-thick"/><path d="M96 14l2.200 6.300L104.500 22.500l-6.300 2.200L96 31l-2.200-6.300-6.300-2.200 6.300-2.200z" class="ea-accent"/><circle cx="20" cy="70" r="3" class="ea-accent"/><path d="M44 42h16M52 34v16" class="ea-line"/>`,
  list: `<rect x="22" y="12" width="76" height="66" rx="10" class="ea-fill"/><rect x="22" y="12" width="76" height="66" rx="10" class="ea-line"/><path d="M36 30h28M36 45h48M36 60h36" class="ea-line"/><circle cx="92" cy="18" r="11" class="ea-accent"/><path d="M92 13v10M87 18h10" class="ea-on"/>`,
  done: `<circle cx="60" cy="45" r="30" class="ea-fill"/><circle cx="60" cy="45" r="30" class="ea-line"/><path d="m46 46 10 10 19-21" class="ea-line ea-thick"/><path d="M100 12l1.800 5.200L107 19l-5.200 1.800L100 26l-1.800-5.200L93 19l5.200-1.800z" class="ea-accent"/><circle cx="18" cy="24" r="3" class="ea-accent"/>`,
  lock: `<rect x="34" y="40" width="52" height="40" rx="9" class="ea-fill"/><rect x="34" y="40" width="52" height="40" rx="9" class="ea-line"/><path d="M45 40V30a15 15 0 0 1 30 0v10" class="ea-line"/><circle cx="60" cy="58" r="4.500" class="ea-accent"/><path d="M60 62v7" class="ea-line"/>`,
};
export const emptyArt = (kind = "search") => `<svg class="empty-art" viewBox="0 0 120 90" width="132" height="99" aria-hidden="true" focusable="false">${EMPTY[kind] || EMPTY.search}</svg>`;
