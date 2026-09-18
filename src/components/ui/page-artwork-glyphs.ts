// Bộ hình minh họa dùng chung cho thanh tiêu đề: PageArtwork vẽ bản nhỏ đứng
// cạnh chữ, PageBannerArt phóng to chính hình đó làm nền cho khoảng trống bên
// phải. Tách ra một chỗ để hai nơi không bao giờ lệch nhau.
//
// Vì sao là SVG viết tay chứ không phải ảnh: app có hơn 20 màn hình, mỗi màn
// một ảnh PNG/WebP là thêm khoảng 1 MB phải tải về trên GitHub Pages, lại phải
// làm hai bản sáng/tối. Cả bộ dưới đây chưa tới 5 KB, nằm trong bundle nên
// không có request nào, nét ở mọi độ phân giải, và ăn theo biến màu của theme.

// Khung chung giữ cả bộ thành một họ: cùng độ dày nét, cùng kiểu bo đầu.
const S = 'fill="none" stroke="var(--art-ink)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"'
const soft = 'fill="var(--art-ink)" opacity=".22"'

export const PAGE_GLYPHS: Record<string, string> = {
  // ── HS / cán sự ──────────────────────────────────────────────────────────
  homework: `<path d="M15 18h29v34H15z" ${S}/><path d="M22 27h15M22 34h10" ${S}/><path d="M38 37l7-4 8 4-8 4z" ${soft}/><path d="M39 44l4 4 9-10" ${S}/>`,
  dashboard: `<rect x="14" y="16" width="36" height="28" rx="6" ${S}/><path d="M22 38v-8M31 38v-14M40 38v-5" ${S}/><circle cx="45" cy="21" r="3.4" ${soft}/><path d="M20 50h24" ${S}/>`,
  register: `<path d="M18 14h22a4 4 0 0 1 4 4v30a4 4 0 0 1-4 4H18z" ${S}/><path d="M18 14v38" ${S}/><path d="M25 25h12M25 32h12M25 39h7" ${S}/><path d="M44 40l6-6 4 4-6 6-5 1z" ${soft}/>`,
  issues: `<path d="M32 15l17 30H15z" ${S}/><path d="M32 27v8" ${S}/><circle cx="32" cy="40" r="1.9" fill="var(--art-ink)"/><circle cx="47" cy="20" r="4" ${soft}/>`,
  history: `<circle cx="32" cy="33" r="16" ${S}/><path d="M32 24v9l6 4" ${S}/><path d="M16 33a16 16 0 0 1 5-11" ${S}/><path d="M15 18v7h7" ${S}/>`,
  comments: `<path d="M13 20h26a4 4 0 0 1 4 4v11a4 4 0 0 1-4 4H24l-8 6v-6h-3a4 4 0 0 1-4-4V24a4 4 0 0 1 4-4z" ${S}/><path d="M48 28h3a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3h-1v5l-6-5" ${S}/><path d="M19 27h14M19 33h9" ${S}/>`,
  statistics: `<path d="M15 48V19M15 48h34" ${S}/><path d="M22 42v-9M30 42v-16M38 42v-6M46 42v-19" ${S}/><circle cx="46" cy="19" r="4" ${soft}/>`,

  // ── Giáo viên ────────────────────────────────────────────────────────────
  review: `<rect x="17" y="14" width="30" height="38" rx="6" ${S}/><path d="M26 14h12v6H26z" ${S}/><path d="M24 33l5 5 11-12" ${S}/><circle cx="47" cy="45" r="5" ${soft}/>`,
  tracking: `<circle cx="21" cy="24" r="5" ${S}/><circle cx="38" cy="21" r="5" ${S}/><path d="M13 40c0-5 4-8 8-8s8 3 8 8" ${S}/><path d="M30 37c0-5 4-8 8-8s8 3 8 8" ${S}/><path d="M16 50h32" ${S}/><path d="M16 50h19" stroke="var(--art-ink)" stroke-width="4.5" stroke-linecap="round" fill="none"/>`,
  weeks: `<rect x="13" y="18" width="38" height="32" rx="6" ${S}/><path d="M13 28h38M22 14v8M42 14v8" ${S}/><rect x="27" y="33" width="10" height="9" rx="3" ${soft}/><path d="M19 36h3M43 36h2M19 44h3" ${S}/>`,
  schedule: `<rect x="12" y="16" width="27" height="32" rx="6" ${S}/><path d="M18 25h15M18 32h15M18 39h9" ${S}/><circle cx="45" cy="41" r="10" ${S}/><path d="M45 35v6l4 3" ${S}/>`,
  students: `<circle cx="26" cy="23" r="7" ${S}/><path d="M14 46c0-7 5-12 12-12s12 5 12 12" ${S}/><circle cx="45" cy="27" r="5" ${soft}/><path d="M38 46c0-6 3-9 7-9s7 3 7 9" ${S}/>`,
  settings: `<path d="M16 22h32M16 33h32M16 44h32" ${S}/><circle cx="27" cy="22" r="4.2" ${S}/><circle cx="39" cy="33" r="4.2" ${S}/><circle cx="23" cy="44" r="4.2" ${S}/>`,

  // ── Admin ────────────────────────────────────────────────────────────────
  'admin-overview': `<rect x="13" y="15" width="17" height="17" rx="5" ${S}/><rect x="34" y="15" width="17" height="17" rx="5" ${soft}/><rect x="13" y="36" width="17" height="17" rx="5" ${soft}/><path d="M42 36l9 4v6c0 4-4 6-9 8-5-2-9-4-9-8v-6z" ${S}/>`,
  'admin-years': `<rect x="12" y="18" width="40" height="33" rx="7" ${S}/><path d="M12 29h40M22 13v9M42 13v9" ${S}/><circle cx="32" cy="40" r="7" ${S}/><path d="M29 40l2.5 2.5L36 38" ${S}/>`,
  'admin-classes': `<path d="M14 50V26l18-11 18 11v24z" ${S}/><rect x="26" y="34" width="12" height="16" rx="3" ${soft}/><path d="M22 30h5M37 30h5" ${S}/>`,
  'admin-students': `<path d="M32 15l19 9-19 9-19-9z" ${S}/><path d="M21 29v10c0 4 5 7 11 7s11-3 11-7V29" ${S}/><path d="M48 26v11" ${S}/><circle cx="48" cy="40" r="2.6" ${soft}/>`,
  'admin-teachers': `<rect x="12" y="14" width="30" height="22" rx="5" ${S}/><path d="M19 22h14M19 28h9" ${S}/><circle cx="41" cy="41" r="6" ${S}/><path d="M30 54c0-6 5-9 11-9s11 3 11 9" ${S}/>`,
  'admin-permissions': `<path d="M31 12l16 7v12c0 10-7 16-16 20-9-4-16-10-16-20V19z" ${S}/><circle cx="31" cy="30" r="4.5" ${S}/><path d="M31 34.5V41" ${S}/>`,
  'admin-recycle': `<path d="M10 30h24M18 30v-5h8v5" ${S}/><path d="M13 30l2 21a4 4 0 0 0 4 3.6h10a4 4 0 0 0 4-3.6L31 30" ${S}/><circle cx="22" cy="42" r="4" ${soft}/><path d="M36 21a9 9 0 1 0 3-6.7L36 17" ${S}/><path d="M36 12v5h5" ${S}/>`,
  // Hai đĩa xếp chồng + vạch mức: dung lượng, không phải một biểu tượng file.
  'admin-storage': `<rect x="12" y="16" width="40" height="14" rx="6" ${S}/><rect x="12" y="36" width="40" height="14" rx="6" ${S}/><circle cx="20" cy="23" r="2.4" fill="var(--art-ink)"/><circle cx="20" cy="43" r="2.4" fill="var(--art-ink)"/><rect x="27" y="20" width="17" height="6" rx="3" ${soft}/><path d="M27 43h11" ${S}/>`,
  'admin-audit': `<path d="M17 13h22l8 8v30a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3V16a3 3 0 0 1 3-3z" ${S}/><path d="M38 13v9h9" ${S}/><path d="M21 30h13M21 37h9" ${S}/><circle cx="41" cy="41" r="6.5" ${S}/><path d="M46 46l5 5" ${S}/>`,
}
