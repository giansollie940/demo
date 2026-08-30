<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useIntervalFn } from '@vueuse/core'
import { Eye, EyeOff, LockKeyhole, Moon, Sun, UserRound } from 'lucide-vue-next'
import AuthLayout from '../layouts/AuthLayout.vue'
import AppButton from '../components/ui/AppButton.vue'
import IconButton from '../components/ui/IconButton.vue'
import { useAuthStore } from '../stores/auth'
import { useContextStore } from '../stores/context'
import { usePreferencesStore } from '../stores/preferences'

const faviconUrl = `${import.meta.env.BASE_URL}assets/images/favicon.png`
const loginHeroUrl = `${import.meta.env.BASE_URL}assets/images/login-hero.png`

const auth = useAuthStore()
const context = useContextStore()
const preferences = usePreferencesStore()
const router = useRouter()

const code = ref('')
const password = ref('')
const showPassword = ref(false)
const submitError = ref('')

const slogans = [
  'Học chủ động. Tiến bộ mỗi ngày.',
  'Mỗi giờ tự học đều có mục tiêu.',
  'Kế hoạch rõ ràng, tiến bộ bền vững.',
  'Tự học hôm nay, tự tin ngày mai.',
  'Một chút mỗi ngày tạo nên khác biệt.',
]

const sloganIndex = ref(0)
useIntervalFn(() => {
  sloganIndex.value = (sloganIndex.value + 1) % slogans.length
}, 7000)

const slogan = computed(() => slogans[sloganIndex.value])

async function submit() {
  submitError.value = ''
  try {
    await auth.login(code.value, password.value)
    context.hydrate(auth.legacyState)
    await router.replace('/dashboard')
  } catch (error) {
    submitError.value = error instanceof Error ? error.message : 'Đăng nhập không thành công.'
  }
}
</script>

<template>
  <AuthLayout>
    <section class="login-shell">
      <div class="login-visual">
        <header class="brand-row">
          <div class="brand">
            <img :src="faviconUrl" alt="" />
            <strong>SỔ TỰ HỌC</strong>
          </div>
          <IconButton label="Đổi giao diện sáng/tối" @click="preferences.toggleTheme">
            <Sun v-if="preferences.resolvedTheme === 'dark'" />
            <Moon v-else />
          </IconButton>
        </header>

        <div class="visual-copy">
          <span>HỌC CHỦ ĐỘNG</span>
          <h1>Mỗi giờ tự học<br />đều có mục tiêu.</h1>
          <p>Theo dõi kế hoạch, nhận phản hồi và tiến bộ rõ ràng theo từng tuần.</p>
        </div>

        <figure class="hero-card">
          <img :src="loginHeroUrl" alt="Học sinh cùng học tập" />
        </figure>

        <div class="slogan" aria-live="polite">
          <span class="slogan-dot"></span>
          <b>{{ slogan }}</b>
        </div>

        <div class="benefits">
          <span><b>01</b> Học mỗi ngày</span>
          <span><b>02</b> Kế hoạch rõ</span>
          <span><b>03</b> Phản hồi đúng lúc</span>
        </div>
      </div>

      <div class="login-panel">
        <div class="form-heading">
          <span>TÀI KHOẢN HỌC TẬP</span>
          <h2>Chào mừng trở lại</h2>
          <p>Dùng mã đăng nhập được nhà trường cấp.</p>
        </div>

        <form class="login-form" @submit.prevent="submit">
          <label>
            <span>Mã đăng nhập</span>
            <div class="field">
              <UserRound />
              <input
                v-model.trim="code"
                autocomplete="username"
                placeholder="Ví dụ: gv-7a9"
                required
              />
            </div>
          </label>

          <label>
            <span>Mật khẩu</span>
            <div class="field">
              <LockKeyhole />
              <input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="current-password"
                placeholder="Nhập mật khẩu"
                required
              />
              <button
                type="button"
                class="reveal"
                :aria-label="showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'"
                @click="showPassword = !showPassword"
              >
                <EyeOff v-if="showPassword" />
                <Eye v-else />
              </button>
            </div>
          </label>

          <p v-if="submitError || auth.error" class="error" role="alert">
            {{ submitError || auth.error }}
          </p>

          <AppButton type="submit" :loading="auth.loading" class="submit">
            Đăng nhập
          </AppButton>
        </form>

        <div class="security-notes">
          <span>✓ Xem kế hoạch tự học theo tuần</span>
          <span>✓ Theo dõi tiến độ của bạn</span>
          <span>✓ Nhận phản hồi từ giáo viên</span>
        </div>
      </div>
    </section>
  </AuthLayout>
</template>

<style scoped>
/* ===== FIX 1: Căn giữa khung hình ===== */
.login-shell {
  position: relative;
  width: min(1500px, calc(100vw - 48px));
  min-height: min(820px, calc(100vh - 48px));
  margin: auto;                        /* ← căn giữa ngang + dọc (nếu parent là flex/grid) */
  display: grid;
  grid-template-columns: 1fr;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--color-primary) 14%, var(--border));
  border-radius: 30px;
  background: var(--surface);
  box-shadow: var(--shadow-md);
}

/* ===== FIX 2: padding-right dùng calc linh hoạt hơn ===== */
.login-visual {
  position: relative;
  padding: 30px clamp(400px, 28vw, 456px) 28px 38px;
  display: grid;
  grid-template-rows: auto auto minmax(360px, 1fr) auto auto;
  gap: 16px;
  min-width: 0;
  background:
    radial-gradient(circle at 10% 12%, var(--wash-pink), transparent 33%),
    radial-gradient(circle at 88% 20%, var(--wash-sky), transparent 34%),
    radial-gradient(circle at 72% 90%, var(--wash-mint), transparent 30%),
    linear-gradient(145deg, var(--wash-violet), var(--surface));
}

.brand-row,
.brand {
  display: flex;
  align-items: center;
}

.brand-row {
  justify-content: space-between;
}

.brand {
  gap: 10px;
  letter-spacing: 0.04em;
}

.brand img {
  width: 40px;
  height: 40px;
  filter: drop-shadow(0 5px 10px color-mix(in srgb, var(--color-primary) 18%, transparent));
}

.visual-copy span,
.form-heading span {
  font-size: var(--font-size-ui-min);
  font-weight: 900;
  letter-spacing: 0.16em;
  color: var(--color-primary);
}

.visual-copy h1 {
  margin: 8px 0 10px;
  font-size: clamp(3rem, 3.7vw, 3.5rem);
  line-height: 1.04;
  color: transparent;
  background: linear-gradient(110deg, var(--color-primary), var(--color-sky), var(--color-pink));
  background-clip: text;
  -webkit-background-clip: text;
}

.visual-copy p,
.form-heading p {
  max-width: 54ch;
  margin: 0;
  color: var(--text-muted);
  font-size: 1rem;
  line-height: 1.55;
}

.hero-card {
  width: min(820px, 100%);
  min-height: 0;
  margin: -26px auto -18px auto;
  justify-self: center;
  overflow: visible;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.hero-card img {
  display: block;
  width: 100%;
  height: 100%;
  max-height: 430px;
  object-fit: contain;
  object-position: center center;
  border: 0;
  filter: none;
  -webkit-mask-image: linear-gradient(90deg, transparent 0%, #000 9%, #000 100%);
  mask-image: linear-gradient(90deg, transparent 0%, #000 9%, #000 100%);
  transform-origin: center;
  animation: login-hero-drift 8s ease-in-out infinite;
  will-change: transform;
}

.slogan {
  display: flex;
  align-items: center;
  gap: 10px;
  width: max-content;
  max-width: 100%;
  min-height: 34px;
  padding: 7px 11px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 10%, var(--border));
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface) 68%, transparent);
}

.slogan-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-mint);
  box-shadow: 0 0 0 6px color-mix(in srgb, var(--color-mint) 12%, transparent);
}

.benefits {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  color: var(--text-muted);
  font-size: 0.88rem;
}

.benefits span {
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface) 65%, transparent);
}

.benefits span:nth-child(1) b { color: var(--color-sky); }
.benefits span:nth-child(2) b { color: var(--color-mint); }
.benefits span:nth-child(3) b { color: var(--color-coral); }
.benefits b { margin-right: 4px; }

/* ===== FIX 3: login-panel căn giữa dọc chính xác hơn ===== */
.login-panel {
  position: absolute;
  z-index: 4;
  top: 50%;
  right: clamp(24px, 3vw, 44px);
  width: min(380px, calc(100% - 48px));
  display: grid;
  align-content: center;
  padding: 30px 28px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 12%, var(--border));
  border-radius: 24px;
  background: color-mix(in srgb, var(--surface-raised) 94%, transparent);
  box-shadow: 0 22px 54px rgb(79 55 73 / .14);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  transform: translateY(-50%);
}

.form-heading h2 {
  margin: 8px 0;
  font-size: clamp(1.65rem, 2.2vw, 2rem);
  line-height: 1.15;
}

.login-form {
  display: grid;
  gap: 18px;
  margin-top: 32px;
}

.login-form label > span {
  display: block;
  margin-bottom: 7px;
  font-size: .82rem;
  font-weight: 800;
  line-height: 1.35;
}

.field {
  --field-surface: var(--input);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 13px;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--field-surface);
  transition:
    border-color var(--transition-fast),
    box-shadow var(--transition-fast),
    transform var(--transition-fast),
    background var(--transition-fast);
}

.field:hover {
  border-color: color-mix(in srgb, var(--color-sky) 48%, var(--border));
  box-shadow: 0 8px 24px color-mix(in srgb, var(--color-sky) 10%, transparent);
  transform: translateY(-1px);
}

.field:focus-within {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-primary) 14%, transparent);
  transform: translateY(-1px);
}

.field > svg {
  width: 19px;
  flex: 0 0 auto;
  color: var(--text-muted);
  transition: color var(--transition-fast);
}

.field:focus-within > svg {
  color: var(--color-primary);
}

.field input {
  flex: 1;
  min-width: 0;
  height: 50px;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text);
  font-size: .95rem;
  line-height: 1.45;
}

.field:has(input:-webkit-autofill),
.field:has(input:autofill) {
  --field-surface: color-mix(in srgb, var(--wash-sky) 28%, var(--input));
  background: var(--field-surface);
  border-color: color-mix(in srgb, var(--color-sky) 46%, var(--border));
}

.field input:-webkit-autofill,
.field input:-webkit-autofill:hover,
.field input:-webkit-autofill:focus,
.field input:autofill {
  -webkit-text-fill-color: var(--text);
  -webkit-box-shadow: 0 0 0 1000px var(--field-surface) inset;
  box-shadow: 0 0 0 1000px var(--field-surface) inset;
  caret-color: var(--text);
  transition: background-color 9999s ease-out 0s;
}

.reveal {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  padding: 5px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;           /* ← FIX: thêm cursor pointer cho nút bấm */
}

.reveal:hover {
  color: var(--color-primary);
  transform: translateY(-1px);
}

.reveal svg { width: 19px; }
.submit { width: 100%; min-height: 50px; font-size: .92rem; }
.error { margin: 0; color: var(--color-danger); font-size: 0.9rem; }

.security-notes {
  display: grid;
  gap: 7px;
  margin-top: 24px;
  color: var(--text-muted);
  font-size: .82rem;
  line-height: 1.45;
}

.security-notes span:nth-child(1) { color: var(--color-mint); }
.security-notes span:nth-child(2) { color: var(--color-sky); }
.security-notes span:nth-child(3) { color: var(--color-lilac); }

@keyframes login-hero-drift {
  0%, 100% { transform: translate3d(0, 0, 0) scale(1.015); }
  50% { transform: translate3d(0, -7px, 0) scale(1.03); }
}

@media (prefers-reduced-motion: reduce) {
  .hero-card img {
    animation: none !important;
    transform: none !important;
  }
}

/* ===== FIX 4: Breakpoint tablet – dọn sạch thuộc tính thừa ===== */
@media (max-width: 980px) {
  .login-shell {
    grid-template-columns: 1fr;
    width: min(760px, calc(100vw - 24px));
    min-height: auto;
  }

  .login-visual {
    padding: 28px 32px;
    grid-template-rows: auto auto 280px auto auto; /* ← FIX: 5 hàng (brand, copy, hero, slogan, benefits) */
  }

  .login-panel {
    position: static;       /* ghi đè absolute */
    width: auto;
    margin: 0;
    padding: 32px;
    border-width: 1px 0 0;
    border-radius: 0;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    transform: none;        /* ghi đè translateY(-50%) */
    top: auto;              /* ← FIX: dọn sạch top kế thừa */
    right: auto;            /* ← FIX: dọn sạch right kế thừa */
  }

  .benefits { display: none; }
  .visual-copy h1 { font-size: 2.65rem; }
}

@media (max-width: 560px) {
  .login-visual {
    padding: 20px;
    grid-template-rows: auto auto 190px auto auto; /* ← FIX: giữ đủ 5 hàng */
  }

  .visual-copy p { display: none; }
  .visual-copy h1 { font-size: 2.25rem; }
  .login-panel { padding: 24px 20px; }
  .login-shell { border-radius: 20px; }
}
</style>

