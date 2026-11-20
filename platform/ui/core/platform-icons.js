// core/platform-icons.js — biểu tượng nền tảng mạng xã hội, SVG inline, dùng chung cho MỌI màn.
//   platformIcon("tiktok", { size: 22, variant: "color" })
// variant:
//   "color" — màu thương hiệu chính thức (hằng số trong tokens.css, KHÔNG đổi theo style / theme);
//             TikTok & Threads tự đảo nền (đen ↔ trắng) theo theme để luôn nổi trên nền tối.
//   "mono"  — một màu theo currentColor; dùng khi nằm trên nền gradient (thumbnail) hoặc cỡ rất nhỏ.
// Mỗi icon có <title> = tên nền tảng. Không tải asset từ mạng.
// Thêm nền tảng mới: thêm 1 mục vào ICONS (glyph viewBox 24×24) + màu trong tokens.css.

let uid = 0;

/* Glyph đơn sắc, viewBox 0 0 24 24 */
const GLYPH = {
  // Nốt nhạc TikTok
  tiktok: '<path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>',
  // YouTube: khung bo góc + tam giác play (tam giác là phần khoét)
  youtube: '<path fill-rule="evenodd" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>',
  // Instagram: khung camera bo góc + ống kính + chấm đèn (dựng hình học)
  instagram: '<path fill-rule="evenodd" d="M7.2 1.5h9.6a5.7 5.7 0 0 1 5.7 5.7v9.6a5.7 5.7 0 0 1-5.7 5.7H7.2a5.7 5.7 0 0 1-5.7-5.7V7.2a5.7 5.7 0 0 1 5.7-5.7zm0 2.1a3.6 3.6 0 0 0-3.6 3.6v9.6a3.6 3.6 0 0 0 3.6 3.6h9.6a3.6 3.6 0 0 0 3.6-3.6V7.2a3.6 3.6 0 0 0-3.6-3.6H7.2z"/><path fill-rule="evenodd" d="M12 6.7a5.3 5.3 0 1 1 0 10.6 5.3 5.3 0 0 1 0-10.6zm0 2.1a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.400z"/><circle cx="17.7" cy="6.3" r="1.3"/>',
  // Facebook: chữ "f" trong hình tròn (chữ f là phần khoét)
  facebook: '<path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z"/>',
  // Threads: ký tự "@" cách điệu
  threads: '<path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 0 1 3.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.586-1.308-.883-2.359-.89h-.029c-.844 0-1.992.232-2.721 1.32L7.734 7.847c.98-1.454 2.568-2.256 4.478-2.256h.044c3.194.02 5.097 1.975 5.287 5.388.108.046.216.094.321.142 1.49.7 2.58 1.761 3.154 3.07.797 1.82.871 4.79-1.548 7.158-1.85 1.81-4.094 2.628-7.277 2.65Zm1.003-11.69c-.242 0-.487.007-.739.021-1.836.103-2.98.946-2.916 2.143.067 1.256 1.452 1.839 2.784 1.767 1.224-.065 2.818-.543 3.086-3.71a10.5 10.5 0 0 0-2.215-.221z"/>',
  // Zalo: bong bóng chat bo góc có đuôi + chữ "Zalo" (chữ là phần khoét ở bản mono → dùng nét Z)
  zalo: '<path fill-rule="evenodd" d="M6.2 2h11.6A4.2 4.2 0 0 1 22 6.2v9.100a4.2 4.2 0 0 1-4.2 4.2H10.100L5.500 22.600a.6.6 0 0 1-.98-.47V19.300A4.2 4.2 0 0 1 2 15.300V6.200A4.2 4.2 0 0 1 6.2 2zm2.300 5.300v1.900h4.500l-4.700 5.600v1.400h7.400v-1.900h-4.700l4.700-5.600V7.300H8.500z"/>',
};

export const PLATFORM_ICON_LABELS = { tiktok: "TikTok", youtube: "YouTube", instagram: "Instagram", facebook: "Facebook", threads: "Threads", zalo: "Zalo" };

/* Bản màu: mỗi nền tảng tự vẽ đủ nền + glyph trong viewBox 24×24. Màu lấy từ biến --brand-* (tokens.css). */
const COLOR = {
  // Ô bo góc đen (theme tối: trắng) + nốt nhạc có viền lệch cyan / đỏ
  tiktok: () => `<rect width="24" height="24" rx="6" style="fill:var(--brand-tiktok-tile)"/>
    <g transform="translate(12 12) scale(.56) translate(-12 -12)">
      <g transform="translate(-.9 -.7)" style="fill:var(--brand-tiktok-cyan)">${GLYPH.tiktok}</g>
      <g transform="translate(.9 .7)" style="fill:var(--brand-tiktok-red)">${GLYPH.tiktok}</g>
      <g style="fill:var(--brand-tiktok-glyph)">${GLYPH.tiktok}</g>
    </g>`,
  // Nút play đỏ bo góc, tam giác trắng
  youtube: () => `<path d="M9.3 8.2v7.6l6.800-3.800z" style="fill:var(--brand-white)"/><g style="fill:var(--brand-youtube)">${GLYPH.youtube}</g>`,
  // Ô bo góc gradient vàng → cam → hồng → tím, camera trắng
  instagram: (id) => `<defs><radialGradient id="${id}" cx="0.28" cy="1.05" r="1.35">
      <stop offset="0" style="stop-color:var(--brand-ig-1)"/><stop offset=".22" style="stop-color:var(--brand-ig-2)"/>
      <stop offset=".48" style="stop-color:var(--brand-ig-3)"/><stop offset=".74" style="stop-color:var(--brand-ig-4)"/><stop offset="1" style="stop-color:var(--brand-ig-5)"/>
    </radialGradient></defs>
    <rect width="24" height="24" rx="6.2" fill="url(#${id})"/>
    <g transform="translate(12 12) scale(.66) translate(-12 -12)" style="fill:var(--brand-white)">${GLYPH.instagram}</g>`,
  // Hình tròn xanh, chữ f trắng
  facebook: () => `<circle cx="12" cy="12" r="11" style="fill:var(--brand-white)"/><g style="fill:var(--brand-facebook)">${GLYPH.facebook}</g>`,
  // Ô tròn đen (theme tối: trắng) + ký tự Threads
  threads: () => `<circle cx="12" cy="12" r="12" style="fill:var(--brand-threads-tile)"/>
    <g transform="translate(12 12) scale(.6) translate(-12 -12)" style="fill:var(--brand-threads-glyph)">${GLYPH.threads}</g>`,
  // Ô bo góc xanh Zalo, bong bóng trắng, chữ Z xanh
  zalo: () => `<rect width="24" height="24" rx="6" style="fill:var(--brand-zalo)"/>
    <g transform="translate(12 12.300) scale(.74) translate(-12 -12)"><path d="M6.2 2h11.6A4.2 4.2 0 0 1 22 6.2v9.100a4.2 4.2 0 0 1-4.2 4.2H10.100L5.500 22.600a.6.6 0 0 1-.98-.47V19.300A4.2 4.2 0 0 1 2 15.300V6.200A4.2 4.2 0 0 1 6.2 2z" style="fill:var(--brand-white)"/>
    <path d="M8.5 7.300v1.900h4.500l-4.700 5.600v1.400h7.400v-1.900h-4.700l4.700-5.600V7.300H8.500z" style="fill:var(--brand-zalo)"/></g>`,
};

/**
 * @param {"tiktok"|"youtube"|"instagram"|"facebook"|"threads"|"zalo"} key
 * @param {{ size?: number, variant?: "color"|"mono", label?: boolean }} opts  label=false → icon trang trí (aria-hidden)
 */
export function platformIcon(key, { size = 22, variant = "color", label = true } = {}) {
  if (!GLYPH[key]) return "";
  const name = PLATFORM_ICON_LABELS[key];
  const a11y = label ? `role="img" aria-label="${name}"` : `aria-hidden="true"`;
  const title = label ? `<title>${name}</title>` : "";
  const body = variant === "mono" ? `<g fill="currentColor">${GLYPH[key]}</g>` : COLOR[key]("pi-" + ++uid);
  return `<svg class="pi pi-${variant} pi-${key}" viewBox="0 0 24 24" width="${size}" height="${size}" ${a11y}>${title}${body}</svg>`;
}
