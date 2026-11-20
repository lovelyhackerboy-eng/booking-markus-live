// core/icons.js — BỘ ICON GIAO DIỆN DUY NHẤT của app (logo nền tảng nằm riêng ở core/platform-icons.js).
//   icon("bookmark")                               → outline, 18px, trang trí (aria-hidden)
//   icon("bookmark", { variant: "fill", size: 16 })→ bản tô đặc cho trạng thái đang chọn / đã bật
//   icon("xmark", { label: "Đóng" })               → icon đứng một mình: role="img" + aria-label
//   icon("plus", 16)                               → viết tắt: tham số số = size
//
// Phong cách: lấy cảm hứng từ ngôn ngữ SF Symbols của Apple — nét tròn đều (round cap / round join), bo góc mềm,
// hình khối tối giản, có cặp outline / fill. TOÀN BỘ hình được TỰ VẼ trên lưới 24×24 cho dự án này;
// KHÔNG sao chép path của SF Symbols (giấy phép Apple chỉ cho dùng SF Symbols trong app trên nền tảng Apple).
//
// "Optical size": cỡ nhỏ thì nét dày hơn một chút để vẫn rõ (xem strokeFor()).
// Thêm icon: thêm 1 mục vào ICONS. o = bản outline (nét). f = bản fill:
//   - chuỗi            → các hình tô đặc
//   - { solid, cut, over } → solid: hình tô đặc · cut: nét bị KHOÉT khỏi hình đặc (qua <mask>) · over: nét vẽ đè lên
// Không có f → bản fill dùng lại outline với nét dày hơn.

let uid = 0;
const dot = (x, y, r = 1) => `<circle cx="${x}" cy="${y}" r="${r}" fill="currentColor" stroke="none"/>`;
const R = (x, y, w, h, rx) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/>`;
const C = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}"/>`;

/* Hình dùng lại */
const STAR4 = (cx, cy, r, k = 0.11) => { // sao 4 cánh cạnh lõm (lấp lánh)
  const a = (r * k).toFixed(2);
  return `<path d="M${cx} ${cy - r}Q${cx + +a} ${cy - +a} ${cx + r} ${cy}Q${cx + +a} ${cy + +a} ${cx} ${cy + r}Q${cx - +a} ${cy + +a} ${cx - r} ${cy}Q${cx - +a} ${cy - +a} ${cx} ${cy - r}z"/>`;
};
const SPARKLES = STAR4(10, 12.5, 7.4) + STAR4(18.3, 5.6, 3.1) + STAR4(18.6, 18.2, 2.2);
const STAR5 = '<path d="M12 3.4l2.55 5.35 5.85.75-4.3 4.05 1.1 5.8L12 16.5l-5.2 2.850 1.1-5.8-4.3-4.05 5.85-.75z"/>';
const BOOKMARK = '<path d="M8 3.5h8a2 2 0 0 1 2 2v14.300a.5.5 0 0 1-.8.4L12 16.300 6.800 20.200a.5.5 0 0 1-.8-.4V5.500a2 2 0 0 1 2-2z"/>';
const BUBBLE = '<path d="M12 4c4.800 0 8.600 3.200 8.600 7.200s-3.800 7.200-8.600 7.200c-1 0-2-.150-2.900-.4L5.300 19.900a.5.5 0 0 1-.7-.55l.75-3.250C4.100 14.800 3.400 13.100 3.400 11.200 3.400 7.200 7.200 4 12 4z"/>';
const TRIANGLE = '<path d="M10.250 4.600 2.850 17.500A2 2 0 0 0 4.600 20.500h14.800a2 2 0 0 0 1.750-3L13.750 4.600a2 2 0 0 0-3.500 0z"/>';
const CAL_BODY = R(3.5, 5, 17, 15.5, 3.800);
const CYL_BODY = '<path d="M5 6.600c0-1.750 3.100-3.100 7-3.100s7 1.350 7 3.100v10.800c0 1.750-3.100 3.100-7 3.100s-7-1.350-7-3.100z"/>';
const CYL_ARCS = '<path d="M5 6.600c0 1.750 3.100 3.100 7 3.100s7-1.350 7-3.100"/><path d="M5 12c0 1.750 3.100 3.100 7 3.100s7-1.350 7-3.100"/>';
const PERSON_HEAD = C(12, 9.700, 3.100), PERSON_BODY = '<path d="M6.300 18.200c1.050-2.400 3.200-3.800 5.700-3.800s4.650 1.400 5.700 3.800"/>';
const LIST_ROWS = '<path d="M11.200 8.700h5.600M11.200 12h5.600M11.200 15.300h3.600"/>';
const LIST_DOTS = dot(7.6, 8.7, 0.95) + dot(7.6, 12, 0.95) + dot(7.6, 15.3, 0.95);
const PALETTE = '<path d="M12 3.400c-4.900 0-8.800 3.750-8.800 8.400 0 4.750 3.800 8.800 8.550 8.800 1.400 0 2.250-.9 2.250-2.050 0-1.300-1.100-1.750-1.100-2.950 0-1.100.9-1.900 2.200-1.900H17c2.150 0 3.800-1.550 3.800-3.650 0-3.850-3.900-6.650-8.800-6.650z"/>';
const PLANE = '<path d="M20.200 3.800 14.300 20a.5.5 0 0 1-.92.050L10.600 13.400 3.950 10.620a.5.5 0 0 1 .05-.92z"/>';
const USERS_FRONT_HEAD = C(9, 8.300, 3.200);
const TRAY_DOWN = '<path d="M4.300 14.300v3.200a3 3 0 0 0 3 3h9.400a3 3 0 0 0 3-3v-3.200"/><path d="M12 3.500v11M7.900 10.600l4.100 4.100 4.100-4.100"/>';
const DOC = '<path d="M7.800 3.200h6.400l4.800 4.800v10a2.800 2.800 0 0 1-2.800 2.800H7.800A2.800 2.800 0 0 1 5 18V6a2.800 2.800 0 0 1 2.800-2.800z"/>';

const ICONS = {
  /* ---------- AI / tìm kiếm ---------- */
  sparkles: { o: SPARKLES, f: SPARKLES },
  similar: { o: C(9, 12, 5.800) + C(15, 12, 5.800), f: { solid: C(9, 12, 6.300) + C(15, 12, 6.300), cut: '<path d="M12 7.300a5.800 5.800 0 0 1 0 9.400a5.800 5.800 0 0 1 0-9.400z"/>' } },

  /* ---------- điều hướng ---------- */
  compass: { o: C(12, 12, 8.800) + '<path d="M15.500 8.500 13.400 13.400 8.500 15.500 10.600 10.600z"/>', f: { solid: C(12, 12, 9.400), cut: '<path d="M15.500 8.500 13.400 13.400 8.500 15.500 10.600 10.600z" fill="#000"/>' } },
  users: { o: USERS_FRONT_HEAD + '<path d="M3 19.300c0-3.300 2.650-5.700 6-5.700s6 2.400 6 5.700"/><path d="M15.700 5.500a3.100 3.100 0 0 1 0 6.200M17.500 14c2.050.75 3.500 2.700 3.500 5.300"/>',
    f: C(9, 8.300, 3.700) + '<path d="M2.400 19.400c0-3.700 2.950-6.300 6.600-6.300s6.600 2.600 6.600 6.300c0 .5-.4.900-.9.900H3.300c-.5 0-.9-.4-.9-.9z"/>' + C(16.900, 8.900, 2.900) + '<path d="M17.300 13.300c2.500.4 4.300 2.550 4.300 5.400 0 .5-.4.850-.9.850h-3.650c.1-.4.150-.8.150-1.200 0-1.950-.75-3.650-2-4.850.65-.15 1.350-.25 2.100-.2z"/>' },
  list: { o: R(3, 4.500, 18, 15, 3.800) + LIST_ROWS + LIST_DOTS, f: { solid: R(2.500, 4, 19, 16, 4.200), cut: LIST_ROWS + '<path d="M7.550 8.700h.1M7.550 12h.1M7.550 15.300h.1" stroke-width="2.100"/>' } },
  calendar: { o: CAL_BODY + '<path d="M3.500 10.200h17M8 3.200v3.600M16 3.200v3.600"/><path d="m9.200 15 2.050 2.050L15 13.200"/>', f: { solid: R(3, 4.500, 18, 16.500, 4.200), cut: '<path d="M3 10.200h18"/><path d="m9.200 15.200 2.050 2.050L15 13.400" stroke-width="1.900"/>', over: '<path d="M8 2.900v3M16 2.900v3"/>' } },
  data: { o: CYL_BODY + CYL_ARCS, f: { solid: '<path d="M4.500 6.600c0-2.100 3.350-3.600 7.500-3.600s7.500 1.500 7.500 3.600v10.800c0 2.100-3.350 3.600-7.500 3.600s-7.500-1.500-7.500-3.600z"/>', cut: '<path d="M4.500 7.200c0 1.800 3.350 3.200 7.500 3.200s7.500-1.400 7.500-3.200M4.500 12.600c0 1.800 3.350 3.200 7.500 3.200s7.500-1.400 7.500-3.200"/>' } },
  sidebar: { o: R(3, 4.500, 18, 15, 3.800) + '<path d="M9.200 4.500v15"/>' + '<path d="M5.800 8.300h.9M5.800 11h.9"/>', f: { solid: R(2.500, 4, 19, 16, 4.200), cut: '<path d="M9.500 4v16"/>' } },
  plus: { o: '<path d="M12 5.200v13.600M5.200 12h13.600"/>' },
  chevR: { o: '<path d="m9.500 5.800 6.200 6.200-6.200 6.200"/>' },
  chevL: { o: '<path d="m14.500 5.800-6.200 6.200 6.200 6.200"/>' },

  /* ---------- topbar ---------- */
  person: { o: C(12, 12, 8.800) + PERSON_HEAD + PERSON_BODY, f: { solid: C(12, 12, 9.400), cut: `<circle cx="12" cy="9.700" r="2.700" fill="#000"/><path d="M6.900 18.600c1-2.300 2.900-3.500 5.100-3.500s4.100 1.200 5.100 3.500" stroke-width="2.200"/>` } },
  palette: { o: PALETTE + dot(7.900, 12.400, 1.150) + dot(9.900, 8.300, 1.150) + dot(14.300, 7.700, 1.150), f: { solid: PALETTE, cut: '<path d="M7.850 12.400h.1M9.850 8.300h.1M14.250 7.700h.1" stroke-width="2.600"/>' } },
  sun: { o: C(12, 12, 3.900) + '<path d="M12 2.900v1.900M12 19.200v1.900M2.900 12h1.900M19.200 12h1.900M5.550 5.550l1.350 1.350M17.100 17.100l1.350 1.350M5.550 18.450l1.350-1.350M17.100 6.900l1.350-1.350"/>',
    f: { solid: C(12, 12, 4.400), over: '<path d="M12 2.900v1.900M12 19.200v1.900M2.900 12h1.900M19.200 12h1.900M5.550 5.550l1.350 1.350M17.100 17.100l1.350 1.350M5.550 18.450l1.350-1.350M17.100 6.900l1.350-1.350"/>' } },
  moon: { o: '<path d="M19.800 14.400A8.200 8.200 0 0 1 9.600 4.200a8.200 8.200 0 1 0 10.200 10.200z"/>', f: '<path d="M20.400 14.100a.6.6 0 0 0-.8-.65A7.600 7.600 0 0 1 10.550 4.400a.6.6 0 0 0-.65-.8A8.800 8.800 0 1 0 20.400 14.100z"/>' },

  /* ---------- hành động ---------- */
  bookmark: { o: BOOKMARK, f: BOOKMARK },
  message: { o: BUBBLE, f: BUBBLE },
  columns: { o: R(3, 4.500, 18, 15, 3.800) + '<path d="M9 4.500v15M15 4.500v15"/>', f: { solid: R(2.500, 4, 19, 16, 4.200), cut: '<path d="M9 4v16M15 4v16"/>' } },
  grid: { o: R(3.500, 3.500, 7.200, 7.200, 2.200) + R(13.300, 3.500, 7.200, 7.200, 2.200) + R(3.500, 13.300, 7.200, 7.200, 2.200) + R(13.300, 13.300, 7.200, 7.200, 2.200),
    f: R(3, 3, 8, 8, 2.500) + R(13, 3, 8, 8, 2.500) + R(3, 13, 8, 8, 2.500) + R(13, 13, 8, 8, 2.500) },
  table: { o: R(3, 4.500, 18, 15, 3.800) + '<path d="M3 9.700h18M3 14.600h18M9.300 9.700v9.800"/>' },
  // Chiều sắp xếp: mũi tên + 3 vạch dài → ngắn (giảm dần) / ngắn → dài (tăng dần).
  sortDesc: { o: '<path d="M7 4.500v15M3.800 16.300 7 19.500l3.200-3.200M13 6.500h7.200M13 12h5.200M13 17.500h3.200"/>' },
  sortAsc: { o: '<path d="M7 19.500v-15M3.800 7.700 7 4.500l3.200 3.200M13 6.500h3.200M13 12h5.200M13 17.500h7.200"/>' },
  listBullet: { o: '<path d="M9.200 6.500h10.600M9.200 12h10.600M9.200 17.500h10.600"/>' + dot(4.800, 6.500, 1.150) + dot(4.800, 12, 1.150) + dot(4.800, 17.500, 1.150) },
  sliders: { o: '<path d="M3.800 7h8.200M16.400 7h3.800M3.800 12h2.200M10.400 12h9.800M3.800 17h9.200M17.400 17h2.800"/>' + C(14.200, 7, 2.200) + C(8.200, 12, 2.200) + C(15.200, 17, 2.200) },
  import: { o: TRAY_DOWN },
  download: { o: TRAY_DOWN },
  export: { o: '<path d="M4.300 14.300v3.200a3 3 0 0 0 3 3h9.400a3 3 0 0 0 3-3v-3.200"/><path d="M12 14.800V3.700M7.900 7.700 12 3.600l4.100 4.100"/>' },
  edit: { o: '<path d="M4.200 19.800l.95-4.150L16.200 4.600a2.250 2.250 0 0 1 3.200 3.200L8.350 18.850z"/><path d="m14.400 6.400 3.200 3.200"/>', f: '<path d="M3.600 20.400l1-4.750 9.500-9.500 3.750 3.750-9.500 9.500z"/><path d="M15.300 4.950l.55-.55a2.650 2.650 0 0 1 3.750 3.750l-.55.55z"/>' },
  check: { o: '<path d="m5.200 12.600 4.300 4.300 9.300-9.800"/>' },
  checkCircle: { o: C(12, 12, 8.800) + '<path d="m8.300 12.300 2.600 2.600 4.800-5.200"/>', f: { solid: C(12, 12, 9.400), cut: '<path d="m8.200 12.300 2.700 2.700 4.900-5.300" stroke-width="1.900"/>' } },
  xmark: { o: '<path d="m6.600 6.600 10.800 10.800M17.400 6.600 6.600 17.400"/>' },
  external: { o: '<path d="M13.200 4.800h6v6M19.200 4.800l-8.400 8.400"/><path d="M10.200 6.300H7.300a3 3 0 0 0-3 3v7.400a3 3 0 0 0 3 3h7.400a3 3 0 0 0 3-3v-2.900"/>' },
  trash: { o: '<path d="M4.300 6.900h15.400M9.300 6.900V5.400a1.900 1.900 0 0 1 1.900-1.900h1.600a1.900 1.900 0 0 1 1.900 1.900v1.500"/><path d="m6.300 6.900.85 11.300a2.500 2.500 0 0 0 2.500 2.300h4.700a2.500 2.500 0 0 0 2.500-2.300l.85-11.300M10.200 11v5.300M13.800 11v5.300"/>' },
  send: { o: PLANE + '<path d="m10.600 13.400 4-4"/>', f: PLANE },
  sync: { o: '<path d="M4.900 10.200A7.400 7.400 0 0 1 18.600 8.300"/><path d="M19.300 4.300v4.400h-4.400"/><path d="M19.100 13.800A7.400 7.400 0 0 1 5.400 15.700"/><path d="M4.700 19.700v-4.400h4.400"/>' },
  doc: { o: DOC + '<path d="M14 3.400v2.800A1.800 1.800 0 0 0 15.800 8h3"/>', f: { solid: DOC, cut: '<path d="M8.800 12.200h6.400M8.800 15.800h4.200"/>' } },
  copy: { o: R(8.500, 8.500, 12, 12, 3) + '<path d="M15.500 5.700v-.2a2.800 2.800 0 0 0-2.800-2.800H6.300a2.800 2.800 0 0 0-2.800 2.800v6.400a2.800 2.800 0 0 0 2.800 2.800h.2"/>' },

  /* ---------- trạng thái ---------- */
  star: { o: STAR5, f: STAR5 },
  alert: { o: TRIANGLE + '<path d="M12 9.300v4.400"/>' + dot(12, 16.900, 1), f: { solid: TRIANGLE, cut: '<path d="M12 9.300v4.200" stroke-width="1.900"/><path d="M11.950 16.900h.1" stroke-width="2.200"/>' } },
  clock: { o: C(12, 12, 8.800) + '<path d="M12 7.200V12l3.200 2"/>', f: { solid: C(12, 12, 9.400), cut: '<path d="M12 7.200V12l3.200 2" stroke-width="1.900"/>' } },
  lock: { o: R(5, 10.500, 14, 10, 3) + '<path d="M8.300 10.500V7.900a3.700 3.700 0 0 1 7.400 0v2.600"/>', f: { solid: R(4.500, 10.200, 15, 10.800, 3.300), over: '<path d="M8.300 10.400V7.900a3.700 3.700 0 0 1 7.400 0v2.500"/>' } },
  mail: { o: R(3, 5.500, 18, 13, 3.400) + '<path d="m4.300 8.300 6.300 4.700a2.300 2.300 0 0 0 2.800 0l6.300-4.700"/>' },
  phone: { o: '<path d="M8.500 4.200H6.400A2.300 2.300 0 0 0 4.100 6.700C4.500 13.800 10.200 19.500 17.300 19.900a2.300 2.300 0 0 0 2.500-2.300v-2.100l-4.400-1.800-1.700 2.100a11 11 0 0 1-5.500-5.500l2.100-1.700z"/>' },
};


/** Nét theo cỡ hiển thị (optical size): icon càng nhỏ nét càng dày tương đối để giữ độ rõ. */
const strokeFor = (size) => (size <= 14 ? 2.050 : size <= 17 ? 1.850 : size <= 21 ? 1.700 : 1.600);

/**
 * @param {string} name
 * @param {number | { size?: number, variant?: "outline"|"fill", label?: string }} [opts]
 */
export function icon(name, opts = {}) {
  const o = typeof opts === "number" ? { size: opts } : opts;
  const size = o.size ?? 18;
  const def = ICONS[name];
  if (!def) { console.warn("icon không tồn tại:", name); return ""; }
  const fill = o.variant === "fill";
  const sw = strokeFor(size);
  const a11y = o.label ? `role="img" aria-label="${String(o.label).replace(/"/g, "&quot;").replace(/</g, "&lt;")}"` : `aria-hidden="true"`;
  const stroke = (w) => `fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
  let body;
  if (!fill || !def.f) {
    body = `<g ${stroke(fill ? sw + 0.450 : sw)}>${def.o}</g>`;
  } else if (typeof def.f === "string") {
    body = `<g fill="currentColor" stroke="currentColor" stroke-width="0.900" stroke-linejoin="round">${def.f}</g>`;
  } else {
    const id = "ic" + ++uid; // mask: trắng = giữ, đen = khoét (đây là giá trị độ sáng của mask, không phải màu giao diện)
    const solid = `<g fill="currentColor" stroke="none">${def.f.solid}</g>`;
    body = (def.f.cut ? `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24"><rect width="24" height="24" fill="#fff"/><g fill="none" stroke="#000" stroke-width="1.650" stroke-linecap="round" stroke-linejoin="round">${def.f.cut}</g></mask><g mask="url(#${id})">${solid}</g>` : solid)
      + (def.f.over ? `<g ${stroke(sw + 0.150)}>${def.f.over}</g>` : "");
  }
  return `<span class="ico ico-${fill ? "fill" : "outline"}"><svg viewBox="0 0 24 24" width="${size}" height="${size}" ${a11y} focusable="false">${body}</svg></span>`;
}

export const ICON_NAMES = Object.keys(ICONS);
