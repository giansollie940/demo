<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Eye, EyeOff, LockKeyhole, Moon, Sun, UserRound } from 'lucide-vue-next'
import AuthLayout from '../layouts/AuthLayout.vue'
import AppButton from '../components/ui/AppButton.vue'
import IconButton from '../components/ui/IconButton.vue'
import loginStudentsUrl from '../assets/images/r7-login-students@2x.png'
import loginPanoramaSoftUrl from '../assets/images/r7-login-panorama-soft@2x.png'
import { useAuthStore } from '../stores/auth'
import { useContextStore } from '../stores/context'
import { usePreferencesStore } from '../stores/preferences'

const faviconUrl = `${import.meta.env.BASE_URL}assets/images/favicon.png`
const auth = useAuthStore()
const context = useContextStore()
const preferences = usePreferencesStore()
const router = useRouter()
const code = ref('')
const password = ref('')
const showPassword = ref(false)
const submitError = ref('')

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
    <main class="login-page-r7">
      <section class="login-panorama">
        <img class="login-panorama-soft" :src="loginPanoramaSoftUrl" alt="" aria-hidden="true" />
        <div class="panorama-overlay" aria-hidden="true"></div>

        <header class="login-brand">
          <img :src="faviconUrl" alt="" />
          <span><strong>SỔ TỰ HỌC</strong><small>Học chủ động – Vững tương lai</small></span>
        </header>

        <div class="login-copy">
          <span>HỌC CHỦ ĐỘNG</span>
          <h1>Mỗi giờ tự học<br /><em>đều có mục tiêu 🚀</em></h1>
          <p>Kế hoạch rõ ràng · Tiến bộ bền vững · Thành công từng ngày</p>
          <div class="login-feature-row">
            <span><b>◎</b><i><strong>Lập kế hoạch</strong><small>Theo tuần</small></i></span>
            <span><b>▥</b><i><strong>Theo dõi tiến độ</strong><small>Thông minh</small></i></span>
            <span><b>★</b><i><strong>Nhận phản hồi</strong><small>Kịp thời</small></i></span>
          </div>
        </div>

        <figure class="login-students-wrap">
          <img class="login-students" :src="loginStudentsUrl" alt="Học sinh cùng học tập" />
        </figure>

        <form class="login-card-float" @submit.prevent="submit">
          <div class="card-toolbar">
            <span></span>
            <IconButton label="Đổi giao diện sáng/tối" @click.prevent="preferences.toggleTheme">
              <Sun v-if="preferences.resolvedTheme === 'dark'" />
              <Moon v-else />
            </IconButton>
          </div>

          <div class="form-heading">
            <span>TÀI KHOẢN HỌC TẬP</span>
            <h2>👋 Chào mừng trở lại!</h2>
            <p>Đăng nhập để tiếp tục hành trình học tập của bạn.</p>
          </div>

          <label>
            <span>Mã đăng nhập</span>
            <div class="field">
              <UserRound />
              <input v-model.trim="code" autocomplete="username" placeholder="Ví dụ: gv-7a9" required />
            </div>
          </label>

          <label>
            <span>Mật khẩu</span>
            <div class="field">
              <LockKeyhole />
              <input v-model="password" :type="showPassword ? 'text' : 'password'" autocomplete="current-password" placeholder="Nhập mật khẩu" required />
              <button type="button" class="reveal" :aria-label="showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'" @click="showPassword = !showPassword">
                <EyeOff v-if="showPassword" /><Eye v-else />
              </button>
            </div>
          </label>

          <p v-if="submitError || auth.error" class="error" role="alert">{{ submitError || auth.error }}</p>
          <AppButton type="submit" :loading="auth.loading" class="submit">→&nbsp; Đăng nhập</AppButton>

          <div class="security-notes">
            <span>✓ Xem kế hoạch tự học theo tuần</span>
            <span>✓ Theo dõi tiến độ của bạn</span>
            <span>✓ Nhận phản hồi từ giáo viên</span>
          </div>
        </form>
      </section>
    </main>
  </AuthLayout>
</template>

<style scoped>
.login-page-r7 { width: min(1536px, calc(100vw - 48px)); min-height: min(900px, calc(100vh - 28px)); }
.login-panorama { position: relative; min-height: min(900px, calc(100vh - 28px)); overflow: hidden; border: 1px solid color-mix(in srgb, var(--color-sky) 16%, var(--border)); border-radius: 32px; background: linear-gradient(120deg, #f8fbff 0%, #eef7ff 56%, #f5f0ff 100%); box-shadow: 0 22px 58px rgb(41 65 99 / .12); }
.login-panorama-soft { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: .2; filter: saturate(.8) blur(1px); transform: scale(1.03); }
.panorama-overlay { position: absolute; inset: 0; background: linear-gradient(90deg, rgb(248 252 255 / .96) 0 29%, rgb(246 251 255 / .35) 51%, rgb(245 249 255 / .08) 68%, rgb(244 248 255 / .58) 100%); }
.login-brand { position: absolute; z-index: 4; left: 42px; top: 34px; display: flex; align-items: center; gap: 10px; }
.login-brand > img { width: 48px; height: 48px; filter: drop-shadow(0 6px 12px rgb(49 99 178 / .16)); }
.login-brand > span { display: grid; gap: 1px; }.login-brand strong { color: #132747; font-size: 1.06rem; letter-spacing: .03em; }.login-brand small { color: #677a97; font-size: .68rem; }
.login-copy { position: absolute; z-index: 4; left: 44px; top: 150px; width: min(450px, 32vw); }
.login-copy > span,.form-heading > span { color: var(--color-primary); font-size: .7rem; font-weight: 900; letter-spacing: .13em; }
.login-copy h1 { margin: 10px 0 11px; color: #1669df; font-size: clamp(2.5rem, 4vw, 4.15rem); line-height: .99; letter-spacing: -.045em; }
.login-copy h1 em { font-style: normal; color: transparent; background: linear-gradient(100deg,#246fe8,#8249e7,#ec5f86); background-clip: text; -webkit-background-clip: text; }
.login-copy > p { margin: 0; color: #65758d; font-size: .85rem; }
.login-feature-row { display: flex; gap: 18px; margin-top: 24px; }
.login-feature-row > span { display: flex; align-items: center; gap: 8px; min-width: 112px; }
.login-feature-row b { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 50%; background: var(--color-success); color: white; font-size: .9rem; }.login-feature-row > span:nth-child(2) b { background: var(--color-lilac); }.login-feature-row > span:nth-child(3) b { background: var(--color-warning); }
.login-feature-row i { display: grid; gap: 1px; font-style: normal; }.login-feature-row strong { color: #263a59; font-size: .68rem; }.login-feature-row small { color: #74839a; font-size: .62rem; }
.login-students-wrap { position: absolute; z-index: 2; left: 30%; right: 21%; bottom: -2px; top: 70px; margin: 0; display: grid; align-items: end; overflow: hidden; pointer-events: none; }
.login-students { width: 100%; height: 100%; object-fit: cover; object-position: center; filter: saturate(1.03) contrast(1.02); -webkit-mask-image: linear-gradient(90deg, transparent 0%, #000 8%, #000 92%, transparent 100%); mask-image: linear-gradient(90deg, transparent 0%, #000 8%, #000 92%, transparent 100%); transform-origin: center bottom; animation: login-students-drift 8s ease-in-out infinite; will-change: transform; }
.login-card-float { --field-surface: color-mix(in srgb, var(--wash-sky) 44%, var(--surface)); position: absolute; z-index: 6; top: 28px; right: 28px; width: min(344px, 27vw); min-width: 320px; display: grid; gap: 14px; padding: 26px 28px 28px; border: 1px solid rgb(213 226 241 / .9); border-radius: 26px; background: rgb(255 255 255 / .91); backdrop-filter: blur(22px) saturate(1.05); box-shadow: 0 18px 42px rgb(47 68 97 / .13); }
.card-toolbar { position: absolute; top: 12px; right: 12px; }.card-toolbar > span { display:none; }
.form-heading { padding-right: 34px; }.form-heading h2 { margin: 7px 0 5px; color: #14213d; font-size: 1.35rem; }.form-heading p { margin: 0; color: var(--text-muted); font-size: .73rem; line-height: 1.45; }
.login-card-float label > span { display: block; margin-bottom: 6px; color: var(--text); font-size: .75rem; font-weight: 850; }
.field { display: flex; align-items: center; gap: 9px; min-height: 50px; padding: 0 12px; overflow: hidden; border: 1px solid color-mix(in srgb, var(--color-sky) 14%, var(--border)); border-radius: 13px; background: var(--field-surface); transition: border-color var(--transition-fast), box-shadow var(--transition-fast), transform var(--transition-fast), background var(--transition-fast); }
.field:hover { border-color: color-mix(in srgb,var(--color-sky) 48%,var(--border)); }.field:focus-within { border-color: var(--color-primary); box-shadow: 0 0 0 4px color-mix(in srgb,var(--color-primary) 12%,transparent); transform: translateY(-1px); }
.field > svg { width: 18px; flex: 0 0 auto; color: var(--color-primary); }.field input { flex: 1; min-width: 0; height: 48px; padding: 0; border: 0; outline: 0; background: transparent; color: var(--text); }
.field:has(input:-webkit-autofill),.field:has(input:autofill){--field-surface:color-mix(in srgb,var(--wash-sky) 58%,var(--surface));background:var(--field-surface)}
.field input:-webkit-autofill,.field input:-webkit-autofill:hover,.field input:-webkit-autofill:focus,.field input:autofill{-webkit-text-fill-color:var(--text);-webkit-box-shadow:0 0 0 1000px var(--field-surface) inset;box-shadow:0 0 0 1000px var(--field-surface) inset;caret-color:var(--text);transition:background-color 9999s ease-out 0s}
.reveal { display:grid;place-items:center;flex:0 0 auto;padding:5px;border:0;border-radius:8px;background:transparent;color:var(--color-primary);cursor:pointer }.reveal svg{width:18px}.submit{width:100%;min-height:48px;margin-top:3px}.error{margin:0;color:var(--color-danger);font-size:.76rem}.security-notes{display:grid;gap:5px;padding-top:4px;color:var(--text-muted);font-size:.7rem}.security-notes span:nth-child(1){color:var(--color-success)}.security-notes span:nth-child(2){color:var(--color-sky)}.security-notes span:nth-child(3){color:var(--color-lilac)}
@keyframes login-students-drift { 0%,100%{transform:translate3d(0,0,0) scale(1.01)} 50%{transform:translate3d(0,-6px,0) scale(1.018)} }
@media (max-width: 1180px) { .login-copy{width:38vw}.login-students-wrap{left:34%;right:27%}.login-card-float{right:20px;width:320px;min-width:300px;padding:24px}.login-feature-row{gap:10px}.login-feature-row>span{min-width:100px} }
@media (max-width: 980px) { .login-page-r7{width:min(820px,calc(100vw - 24px));min-height:auto}.login-panorama{min-height:880px}.login-copy{left:28px;top:115px;width:55%}.login-copy h1{font-size:3rem}.login-feature-row{display:none}.login-students-wrap{left:18%;right:28%;top:250px;bottom:0}.login-card-float{top:auto;right:20px;bottom:20px;width:350px}.login-brand{left:28px;top:24px} }
@media (max-width: 620px) { .login-page-r7{width:calc(100vw - 24px)}.login-panorama{min-height:760px;border-radius:22px}.login-brand{left:18px;top:18px}.login-copy{left:18px;top:92px;width:calc(100% - 36px)}.login-copy h1{font-size:2.25rem}.login-copy>p{display:none}.login-students-wrap{left:8%;right:8%;top:210px;height:245px;bottom:auto;opacity:.82}.login-card-float{left:12px;right:12px;bottom:12px;top:auto;width:auto;min-width:0;padding:22px;border-radius:20px}.form-heading h2{font-size:1.2rem} }
@media (prefers-reduced-motion: reduce) { .login-students{animation:none!important;transform:none!important}.field{transition:none!important} }
</style>
