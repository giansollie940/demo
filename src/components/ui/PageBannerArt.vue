<script setup lang="ts">
// Khoảng trống bên phải thanh tiêu đề.
//
// Bản đầu phóng to **đúng hình của trang đó** ra bên phải. Sai: một thanh tiêu
// đề khi ấy có cùng một biểu tượng nói hai lần, chỉ khác cỡ. Lặp lại không nói
// thêm điều gì, mà mắt vẫn phải xử lý nó — nhìn ra là hai icon trái phải.
//
// Ba nguyên tắc thay thế:
//  1. **Một trang một biểu tượng.** Dấu nhận diện là tấm thẻ nhỏ bên trái, nằm
//     sát tiêu đề, sắc nét ở 66px. Bên phải không được có biểu tượng thứ hai.
//  2. **Phân cấp phải khác nhau về *loại*, không phải về cỡ.** Bên trái là một
//     dấu sắc nét; bên phải vì vậy phải là thứ khác loại — không khí, ánh sáng,
//     kết cấu — chứ không phải chính dấu đó phóng to.
//  3. **Bên phải nằm ở vùng nhìn ngoài rìa.** Nó bị nhìn đúng một lần rồi bị
//     bỏ qua mãi mãi, nên chi tiết ở đó là chi tiết phí. Chỉ cần *có mặt*.
//
// Nên bố cục dưới đây hoàn toàn trừu tượng: vài đĩa tròn mờ chồng nhau, hai
// đường cong dài và ít chấm thưa, tất cả lấy đúng tông màu của trang. Cùng một
// bố cục cho mọi màn hình — nó là "không khí" chung của app, không phải 20 bức
// tranh rời rạc — nên đọc ra là cá tính của sản phẩm chứ không phải đồ trang
// trí nhặt về mỗi chỗ một kiểu. Đổi lại còn nhẹ hơn và chỉ có một chỗ để sửa.
//
// Ba điều kiện để nó không bao giờ cản đường:
//  1. Nằm ở vị trí absolute và là **con đầu tiên** của <header>, nên mọi thứ
//     khác vẽ đè lên nó theo đúng thứ tự DOM — không cần z-index.
//  2. pointer-events:none, nên nút "Làm mới" hay huy hiệu bên trên vẫn bấm được.
//  3. Có mask mờ dần về bên trái, nên chữ tiêu đề không bao giờ nằm trên hình.
withDefaults(defineProps<{
  tone?: 'primary' | 'mint' | 'coral' | 'sun' | 'sky' | 'lilac' | 'pink' | 'info' | 'warning' | 'success'
}>(), { tone: 'primary' })

// Hằng số, không phụ thuộc props: dựng sẵn một lần thay vì tính lại mỗi lần vẽ.
const MARKUP = `<svg viewBox="0 0 340 150" preserveAspectRatio="xMaxYMid slice" role="presentation" focusable="false">`
  // Đĩa lớn dồn xuống dưới, chừa trống góc trên bên phải — nút hành động của
  // trang (Làm mới, Tuần hiện hành, huy hiệu đếm) luôn nằm đúng ở đó.
  + `<circle cx="264" cy="104" r="80" fill="var(--band-blob)"/>`
  + `<circle cx="186" cy="126" r="48" fill="var(--band-blob-soft)"/>`
  + `<circle cx="318" cy="28" r="22" fill="var(--band-blob-soft)"/>`
  // Hai đường cong song song kéo dài qua cả dải: cho hướng và chiều sâu mà
  // không tạo ra một hình có nghĩa nào để phải đọc.
  + `<path d="M56 146C132 126 214 100 340 46" fill="none" stroke="var(--band-line)" stroke-width="2.4" stroke-linecap="round"/>`
  + `<path d="M62 160C142 142 222 116 340 62" fill="none" stroke="var(--band-line)" stroke-width="1.4" stroke-linecap="round"/>`
  // Chấm thưa dần về phía mép mờ, để chỗ chuyển sang chữ không bị hụt đột ngột.
  + `<circle cx="138" cy="52" r="5" fill="var(--band-dot)"/>`
  + `<circle cx="112" cy="92" r="3.4" fill="var(--band-dot)"/>`
  + `<circle cx="164" cy="30" r="2.6" fill="var(--band-dot)"/>`
  + `<circle cx="296" cy="126" r="4" fill="var(--band-dot)"/>`
  + `<circle cx="330" cy="88" r="2.8" fill="var(--band-dot)"/>`
  + `</svg>`
</script>

<template>
  <!-- v-html là hằng số viết sẵn trong file này, không ghép dữ liệu người dùng. -->
  <span class="page-banner-art" :class="`tone-${tone}`" aria-hidden="true" v-html="MARKUP" />
</template>

<style scoped>
.page-banner-art{
  --band-tint:var(--color-primary);
  --band-blob:color-mix(in srgb,var(--band-tint) 12%,transparent);
  --band-blob-soft:color-mix(in srgb,var(--band-tint) 7%,transparent);
  --band-line:color-mix(in srgb,var(--band-tint) 22%,transparent);
  --band-dot:color-mix(in srgb,var(--band-tint) 30%,transparent);
  position:absolute;top:0;right:0;bottom:0;
  width:min(44%,380px);
  pointer-events:none;
  /* Mờ dần về trái để chữ tiêu đề không bao giờ chạm vào hình. */
  -webkit-mask-image:linear-gradient(90deg,transparent 0,#000 42%);
  mask-image:linear-gradient(90deg,transparent 0,#000 42%);
}
.page-banner-art :deep(svg){display:block;width:100%;height:100%}
.tone-mint{--band-tint:var(--color-mint)}
.tone-coral{--band-tint:var(--color-coral)}
.tone-sun{--band-tint:var(--color-sun)}
.tone-sky{--band-tint:var(--color-sky)}
.tone-lilac{--band-tint:var(--color-lilac)}
.tone-pink{--band-tint:var(--color-pink)}
.tone-info{--band-tint:var(--color-info)}
.tone-warning{--band-tint:var(--color-warning)}
.tone-success{--band-tint:var(--color-success)}
/* Nền tối nuốt nét mảnh, nên tăng độ đậm một chút thay vì để hình biến mất. */
[data-theme='dark'] .page-banner-art{
  --band-blob:color-mix(in srgb,var(--band-tint) 16%,transparent);
  --band-blob-soft:color-mix(in srgb,var(--band-tint) 10%,transparent);
  --band-line:color-mix(in srgb,var(--band-tint) 30%,transparent);
  --band-dot:color-mix(in srgb,var(--band-tint) 38%,transparent);
}
/* Hẹp hơn thì bên phải hết trống — ẩn đi để không chen vào nút hành động. */
@media(max-width:1080px){.page-banner-art{display:none}}
@media(prefers-reduced-transparency:reduce){.page-banner-art{display:none}}
</style>
