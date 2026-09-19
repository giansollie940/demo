<script setup lang="ts">
// Bản nhỏ của hình minh họa: một tấm thẻ vuông đứng cạnh tiêu đề trang.
// Hình chỉ để trang trí — luôn aria-hidden, không mang thông tin nào mà chữ
// bên cạnh chưa nói. Bộ hình nằm ở page-artwork-glyphs.ts.
import { computed } from 'vue'
import { PAGE_GLYPHS } from './page-artwork-glyphs'

const props = withDefaults(defineProps<{
  name: string
  tone?: 'primary' | 'mint' | 'coral' | 'sun' | 'sky' | 'lilac' | 'pink' | 'info' | 'warning' | 'success'
}>(), { tone: 'primary' })

// Khung chung giữ cả bộ thành một họ: cùng khối bo tròn, cùng vệt sáng, cùng
// độ dày nét — khác nhau ở phần hình bên trong.
const glyph = computed(() => PAGE_GLYPHS[props.name] ?? PAGE_GLYPHS.dashboard)
const markup = computed(() => `<svg viewBox="0 0 64 64" role="presentation" focusable="false">`
  + `<rect x="1.5" y="1.5" width="61" height="61" rx="19" fill="var(--art-wash)"/>`
  + `<circle cx="49" cy="15" r="11" fill="var(--art-glow)"/>`
  + glyph.value
  + `</svg>`)
</script>

<template>
  <!-- Nội dung v-html là hằng số viết sẵn trong file này, không ghép dữ liệu
       người dùng, nên không có đường nào để chèn mã. -->
  <span class="page-artwork" :class="`tone-${tone}`" aria-hidden="true" v-html="markup" />
</template>

<style scoped>
.page-artwork{
  /* Nền của hình phải dựa trên --surface chứ không phải màu wash: thanh tiêu
     đề của mỗi trang vốn đã là một dải wash, nếu hình cũng dùng đúng wash đó
     thì khối vuông tan vào nền và chỉ còn trơ cái icon. Lấy surface làm chính
     rồi pha một chút màu chủ đề thì hình luôn nổi lên như một tấm thẻ nhỏ. */
  --art-ink:var(--color-primary);
  --art-tint:var(--color-primary);
  --art-wash:color-mix(in srgb,var(--surface) 88%,var(--art-tint));
  --art-glow:color-mix(in srgb,var(--color-sun) 26%,transparent);
  display:block;flex:0 0 auto;width:66px;height:66px;
  border-radius:19px;
  box-shadow:0 6px 16px color-mix(in srgb,var(--art-ink) 12%,transparent),
             inset 0 0 0 1px color-mix(in srgb,var(--art-ink) 14%,transparent);
}
.page-artwork :deep(svg){display:block;width:100%;height:100%}
.tone-mint{--art-ink:var(--color-mint);--art-tint:var(--color-mint)}
.tone-coral{--art-ink:var(--color-coral);--art-tint:var(--color-coral)}
.tone-sun{--art-ink:var(--color-sun);--art-tint:var(--color-sun)}
.tone-sky{--art-ink:var(--color-sky);--art-tint:var(--color-sky)}
.tone-lilac{--art-ink:var(--color-lilac);--art-tint:var(--color-lilac)}
.tone-pink{--art-ink:var(--color-pink);--art-tint:var(--color-pink)}
.tone-info{--art-ink:var(--color-info);--art-tint:var(--color-info)}
.tone-warning{--art-ink:var(--color-warning);--art-tint:var(--color-warning)}
.tone-success{--art-ink:var(--color-success);--art-tint:var(--color-success)}
/* Màn hẹp ưu tiên chữ: hình nhỏ lại rồi ẩn hẳn chứ không đẩy tiêu đề xuống. */
@media(max-width:900px){.page-artwork{width:54px;height:54px}}
@media(max-width:560px){.page-artwork{display:none}}
</style>
