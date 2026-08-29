<script setup lang="ts">
defineProps<{
  name: string
  weekLabel: string
  classLabel: string
  syncLabel: string
  illustrationSrc: string
  subtitle: string
}>()
</script>

<template>
  <section class="dashboard-hero-r7">
    <div class="dashboard-hero-copy">
      <span class="eyebrow">TỔNG QUAN TUẦN</span>
      <h1>Xin chào {{ name }}! 👋</h1>
      <p>{{ subtitle }}</p>
      <div class="hero-pills">
        <span>▣ {{ weekLabel }}</span>
        <span>♙ {{ classLabel }}</span>
        <span class="sync-pill">● {{ syncLabel }}</span>
      </div>
    </div>
    <div class="dashboard-hero-art" aria-hidden="true">
      <img :src="illustrationSrc" alt="" />
    </div>
  </section>
</template>

<style scoped>
.dashboard-hero-r7 {
  position: relative;
  min-height: 146px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--color-primary) 10%, var(--border));
  border-radius: 24px;
  background:
    radial-gradient(circle at 12% 10%, color-mix(in srgb, var(--wash-peach) 70%, transparent), transparent 38%),
    linear-gradient(105deg, color-mix(in srgb, var(--surface) 96%, transparent) 0 48%, color-mix(in srgb, var(--wash-violet) 58%, var(--surface)) 100%);
  box-shadow: 0 12px 32px rgb(49 67 98 / .06);
}
.dashboard-hero-copy {
  position: relative;
  z-index: 2;
  display: grid;
  align-content: center;
  gap: 7px;
  min-height: 146px;
  width: 55%;
  padding: 22px 26px;
}
.eyebrow { color: var(--color-primary); font-size: .68rem; font-weight: 900; letter-spacing: .12em; }
h1 { margin: 0; font-size: clamp(1.7rem, 2.6vw, 2.35rem); line-height: 1.04; letter-spacing: -.035em; color: var(--text); }
p { margin: 0; max-width: 56ch; color: var(--text-muted); font-size: .84rem; }
.hero-pills { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
.hero-pills span { padding: 7px 10px; border: 1px solid color-mix(in srgb, var(--color-primary) 10%, var(--border)); border-radius: 999px; background: rgb(255 255 255 / .72); color: var(--text-muted); font-size: .72rem; font-weight: 800; backdrop-filter: blur(8px); }
.hero-pills .sync-pill { color: var(--color-success); background: color-mix(in srgb, var(--wash-mint) 64%, var(--surface)); }
.dashboard-hero-art { position: absolute; z-index: 1; inset: 0 0 0 auto; width: min(57%, 760px); overflow: hidden; }
.dashboard-hero-art::before { content: ""; position: absolute; z-index: 2; inset: 0 auto 0 0; width: 30%; background: linear-gradient(90deg, color-mix(in srgb, var(--surface) 96%, transparent), transparent); pointer-events: none; }
.dashboard-hero-art img { width: 100%; height: 100%; display: block; object-fit: cover; object-position: center; image-rendering: auto; -webkit-mask-image: linear-gradient(90deg, transparent 0%, #000 16%, #000 100%); mask-image: linear-gradient(90deg, transparent 0%, #000 16%, #000 100%); }
@media (max-width: 980px) {
  .dashboard-hero-copy { width: 62%; }
  .dashboard-hero-art { width: 52%; opacity: .82; }
}
@media (max-width: 760px) {
  .dashboard-hero-r7 { min-height: 300px; }
  .dashboard-hero-copy { width: 100%; min-height: 170px; padding: 20px; }
  .dashboard-hero-art { inset: auto 0 0; width: 100%; height: 145px; opacity: .9; }
  .dashboard-hero-art::before { inset: 0; width: 100%; background: linear-gradient(180deg, color-mix(in srgb, var(--surface) 94%, transparent), transparent 65%); }
}
</style>
