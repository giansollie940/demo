<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useIntervalFn } from '@vueuse/core'
import { Eye, EyeOff, LockKeyhole, Moon, Sun, UserRound } from 'lucide-vue-next'
import AuthLayout from '../layouts/AuthLayout.vue'
import AppButton from '../components/ui/AppButton.vue'
import IconButton from '../components/ui/IconButton.vue'
import LoginFlashlight from '../components/login/LoginFlashlight.vue'
import LoginOwl from '../components/login/LoginOwl.vue'
import LoginSky from '../components/login/LoginSky.vue'
import { beamGeometry, createOwlCameo, flashRadius, pointNearRect, supportsBeamComposite, supportsFlashlightMask } from '../features/login/flashlight'
// Imported (not served from public/) so each build gives them a content-hashed name and a
// replaced picture can never be stuck behind a cached copy of the old one.
import faviconUrl from '../assets/icons/icon-512.png'
import heroDayUrl from '../assets/images/login/hero-day.webp'
import heroNightUrl from '../assets/images/login/hero-night.webp'
import { useAuthStore } from '../stores/auth'
import { useContextStore } from '../stores/context'
import { usePreferencesStore } from '../stores/preferences'



const auth = useAuthStore()
const context = useContextStore()
const preferences = usePreferencesStore()
const router = useRouter()

const code = ref('')
const password = ref('')
const showPassword = ref(false)
const submitError = ref('')
const touched = ref(false)
const codeInvalid = computed(() => touched.value && !code.value.trim())
const passwordInvalid = computed(() => touched.value && !password.value)

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

// ===== Flashlight password reveal (UIFX-LOGIN-FLASHLIGHT-OWL-001) =====
// Purely visual: the night mode lives only on this page and never touches the saved theme,
// so the app opens in whatever theme Settings holds once the user signs in.
const maskSupported = supportsFlashlightMask()
const beamSupported = maskSupported && supportsBeamComposite()
const flashlight = ref(false)
const revealOn = computed(() => maskSupported ? flashlight.value : showPassword.value)
const heroNight = computed(() => flashlight.value || preferences.resolvedTheme === 'dark')

const fxRoot = ref<HTMLElement | null>(null)
const revealLayer = ref<HTMLElement | null>(null)
const revealText = ref<HTMLElement | null>(null)
const passwordField = ref<HTMLElement | null>(null)
const revealButton = ref<HTMLElement | null>(null)
const headline = ref<HTMLElement | null>(null)
const cardHeading = ref<HTMLElement | null>(null)
const passwordSlot = ref<HTMLElement | null>(null)
const revealOverflow = ref(false)

const owl = createOwlCameo()
const owlBox = ref({ x: 0, y: 0, size: 92 })

let pointerX = 0
let pointerY = 0
let frame = 0
// Keep in sync with the conic-gradient stops in the .beam styles (8deg soft edge, 26deg core).
const BEAM_SPREAD = 26
const BEAM_SOFT = 8

// The torch takes the eye button's place in the password field and swivels on its tail there.
function torchPivot(vw: number) {
  const length = vw < 560 ? 64 : 76
  const eye = revealButton.value?.getBoundingClientRect()
  if (!eye) return { x: vw / 2, y: window.innerHeight - 20, length }
  return { x: eye.left + eye.width / 2, y: eye.top + eye.height / 2, length }
}

function paint() {
  frame = 0
  const root = fxRoot.value
  if (!root) return
  const vw = window.innerWidth
  const pivot = torchPivot(vw)
  const radius = flashRadius(vw)
  const beam = beamGeometry(pivot, { x: pointerX, y: pointerY }, pivot.length * 98 / 120, beamSupported ? radius * 0.45 : radius)
  const set = (name: string, value: string) => root.style.setProperty(name, value)
  set('--flash-x', `${pointerX}px`)
  set('--flash-y', `${pointerY}px`)
  set('--flash-r', `${radius}px`)
  set('--pivot-x', `${pivot.x}px`)
  set('--pivot-y', `${pivot.y}px`)
  set('--torch-length', `${pivot.length}px`)
  set('--beam-rot', `${beam.rotation}deg`)
  set('--hx', `${beam.head.x}px`)
  set('--hy', `${beam.head.y}px`)
  set('--beam-from', `${beam.conicCenter - BEAM_SPREAD / 2 - BEAM_SOFT}deg`)
  set('--beam-reach', `${beam.reach}px`)
  const layer = revealLayer.value
  if (layer) {
    const rect = layer.getBoundingClientRect()
    layer.style.setProperty('--lx', `${pointerX - rect.left}px`)
    layer.style.setProperty('--ly', `${pointerY - rect.top}px`)
    layer.style.setProperty('--lhx', `${beam.head.x - rect.left}px`)
    layer.style.setProperty('--lhy', `${beam.head.y - rect.top}px`)
  }
  // The owl only turns up once the beam actually reaches its perch.
  if (!owl.shown.value) {
    const perch = owlPerch()
    // Glinting eyes wait in the dark at the perch as a hint of where to shine.
    if (perch) {
      set('--hint-x', `${perch.x}px`)
      set('--hint-y', `${perch.y}px`)
      set('--hint-size', `${perch.size}px`)
    }
    if (perch && pointNearRect(pointerX, pointerY, { left: perch.x, top: perch.y, right: perch.x + perch.size, bottom: perch.y + perch.size }, 16)) {
      owlBox.value = perch
      owl.play()
    }
  }
}

function aimAt(x: number, y: number) {
  pointerX = x
  pointerY = y
  if (!frame) frame = requestAnimationFrame(paint)
}

function onPointer(event: PointerEvent) { aimAt(event.clientX, event.clientY) }
function onTouch(event: TouchEvent) {
  const touch = event.touches[0]
  if (touch) aimAt(touch.clientX, touch.clientY)
}
function onKey(event: KeyboardEvent) { if (event.key === 'Escape') setFlashlight(false) }
function onLayout() { aimAt(pointerX, pointerY) }
// Second click anywhere switches the light off. Clicks on the eye button toggle it themselves.
function onClickAnywhere(event: MouseEvent) {
  if (revealButton.value?.contains(event.target as Node)) return
  setFlashlight(false)
}
let clickArmTimer: ReturnType<typeof setTimeout> | undefined

function firstLineRect(heading: HTMLElement | null): DOMRect | undefined {
  const text = heading?.firstChild
  if (!text) return undefined
  const range = document.createRange()
  range.selectNodeContents(text)
  return range.getClientRects()[0]
}

// The owl's perch: the end of the headline's first line ("Mỗi giờ tự học"), feet on that line, as
// if it had landed on the words. On phones that headline has usually scrolled away while the form
// is in view, so the perch moves to the end of the card's "Chào mừng trở lại" heading instead.
// The owl artwork's feet sit ~6% above the bottom of its box.
function owlPerch() {
  const size = window.innerWidth < 560 ? 76 : 104
  const hero = firstLineRect(headline.value)
  const onScreen = (rect?: DOMRect) => rect && rect.top - size > 0 && rect.bottom < window.innerHeight
  const line = onScreen(hero) ? hero : firstLineRect(cardHeading.value) ?? hero
  if (!line) return null
  const x = Math.min(line.right + 6, window.innerWidth - size - 8)
  return { x, y: line.bottom - size * 0.94 - line.height * 0.12, size }
}

function listen(on: boolean) {
  const method = on ? 'addEventListener' : 'removeEventListener'
  window[method]('pointermove', onPointer as EventListener, { passive: true } as AddEventListenerOptions)
  window[method]('pointerdown', onPointer as EventListener, { passive: true } as AddEventListenerOptions)
  window[method]('touchmove', onTouch as EventListener, { passive: true } as AddEventListenerOptions)
  window[method]('keydown', onKey as EventListener)
  // Armed on the next task so the click that switched the light on does not switch it off again.
  clearTimeout(clickArmTimer)
  if (on) clickArmTimer = setTimeout(() => window.addEventListener('click', onClickAnywhere))
  else window.removeEventListener('click', onClickAnywhere)
  window[method]('resize', onLayout)
  window[method]('scroll', onLayout, { passive: true, capture: true } as AddEventListenerOptions)
}

// While the torch is on the whole page wears the dark theme. This only sets the attribute the
// theme CSS reads; the saved preference is untouched, so switching the torch off (or leaving the
// page after signing in) returns to whatever theme Settings holds.
function applyPageTheme() {
  document.documentElement.dataset.theme = flashlight.value ? 'dark' : preferences.resolvedTheme
}

function setFlashlight(on: boolean) {
  if (flashlight.value === on) return
  flashlight.value = on
  listen(on)
  applyPageTheme()
  if (!on) {
    if (frame) cancelAnimationFrame(frame)
    frame = 0
    owl.reset()
  }
}

// The theme button (or a system theme change) re-applies the saved theme; keep the page dark
// for as long as the torch stays on.
watch(() => preferences.resolvedTheme, () => { if (flashlight.value) applyPageTheme() }, { flush: 'post' })

function toggleReveal() {
  if (!maskSupported) {
    showPassword.value = !showPassword.value
    return
  }
  if (!flashlight.value) {
    // The torch sits on the eye button, so start by shining back across the password text.
    const slot = passwordSlot.value?.getBoundingClientRect()
    if (slot) aimAt(slot.left + slot.width * 0.3, slot.top + slot.height / 2)
  }
  setFlashlight(!flashlight.value)
}

// Long passwords: keep the tail (where the caret usually is) in view, like the input does.
watch([password, flashlight], async () => {
  if (!flashlight.value) return
  await nextTick()
  const layer = revealLayer.value
  const text = revealText.value
  revealOverflow.value = Boolean(layer && text && text.scrollWidth > layer.clientWidth)
  if (frame === 0 && layer) paint()
})

onBeforeUnmount(() => setFlashlight(false))

function toggleTheme() {
  const doc = document as Document & { startViewTransition?: (update: () => Promise<void>) => { finished: Promise<void> } }
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (!doc.startViewTransition || reduced) {
    preferences.toggleTheme()
    return
  }
  // The view transition cross-fades the whole page; the hero's own fade is paused meanwhile
  // so the two animations don't stack.
  const root = document.documentElement
  root.classList.add('theme-switching')
  doc.startViewTransition(async () => {
    preferences.toggleTheme()
    await nextTick()
  }).finished.finally(() => root.classList.remove('theme-switching'))
}

async function submit() {
  // novalidate trên form: bong bóng kiểm tra của trình duyệt không theo theme và
  // hiện bằng ngôn ngữ của trình duyệt. Trang này đã có sẵn chỗ báo lỗi riêng
  // (submitError) nên dùng luôn chỗ đó cho cả trường hợp bỏ trống.
  touched.value = true
  if (!code.value.trim() || !password.value) {
    submitError.value = !code.value.trim()
      ? 'Hãy nhập mã đăng nhập.'
      : 'Hãy nhập mật khẩu.'
    return
  }
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
    <div ref="fxRoot" class="login-fx" :class="{ 'flashlight-on': flashlight, beam: beamSupported }">
    <section class="login-shell">
      <div class="login-visual">
        <header class="brand-row">
          <div class="brand">
            <img :src="faviconUrl" alt="" />
            <strong>SỔ TỰ HỌC</strong>
          </div>
          <IconButton label="Đổi giao diện sáng/tối" @click="toggleTheme">
            <Sun v-if="preferences.resolvedTheme === 'dark'" />
            <Moon v-else />
          </IconButton>
        </header>

        <div class="visual-copy">
          <span>HỌC CHỦ ĐỘNG</span>
          <h1 ref="headline">Mỗi giờ tự học<br />đều có mục tiêu.</h1>
          <p>Theo dõi kế hoạch, nhận phản hồi và tiến bộ rõ ràng theo từng tuần.</p>
        </div>

        <figure class="hero-card" :class="{ night: heroNight }">
          <LoginSky :night="heroNight" />
          <img class="hero-day" :src="heroDayUrl" alt="Học sinh cùng học nhóm ban ngày" :aria-hidden="heroNight" />
          <img class="hero-night" :src="heroNightUrl" alt="Học sinh tự học ban đêm" :aria-hidden="!heroNight" />
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
          <h2 ref="cardHeading">Chào mừng trở lại</h2>
          <p>Dùng mã đăng nhập được nhà trường cấp.</p>
        </div>

        <form class="login-form" novalidate @submit.prevent="submit">
          <label>
            <span>Mã đăng nhập</span>
            <div class="field">
              <UserRound />
              <input
                v-model.trim="code"
                autocomplete="username"
                placeholder="Ví dụ: gv-7a9"
                required
                :aria-invalid="codeInvalid"
              />
            </div>
          </label>

          <label>
            <span>Mật khẩu</span>
            <div ref="passwordField" class="field">
              <LockKeyhole />
              <span ref="passwordSlot" class="password-slot">
                <input
                  v-model="password"
                  :type="showPassword ? 'text' : 'password'"
                  autocomplete="current-password"
                  placeholder="Nhập mật khẩu"
                  required
                  :aria-invalid="passwordInvalid"
                />
                <!-- Real characters, visible only inside the flashlight mask. Rendered as text
                     (never an attribute) and only while the flashlight is on. -->
                <span
                  v-if="flashlight && password"
                  ref="revealLayer"
                  class="password-reveal-layer"
                  :class="{ overflow: revealOverflow }"
                  aria-hidden="true"
                ><span ref="revealText">{{ password }}</span></span>
              </span>
              <button
                ref="revealButton"
                type="button"
                class="reveal"
                :class="{ lit: flashlight }"
                :aria-pressed="revealOn"
                :aria-label="revealOn ? 'Tắt xem mật khẩu' : 'Bật xem mật khẩu'"
                @click="toggleReveal"
              >
                <EyeOff v-if="revealOn" />
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

    <div class="night-overlay" aria-hidden="true"></div>
    <div class="flash-glow" aria-hidden="true"></div>
    <LoginFlashlight v-if="maskSupported" :on="flashlight" />
    <LoginOwl
      :phase="owl.phase.value"
      :eyes-closed="owl.eyesClosed.value"
      :x="owlBox.x"
      :y="owlBox.y"
      :size="owlBox.size"
    />
    <div v-if="flashlight && !owl.shown.value" class="owl-hint" aria-hidden="true">
      <i class="eye left"></i>
      <i class="eye right"></i>
    </div>
    </div>
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

.hero-card {
  position: relative;
  display: grid;
  /* One definite cell the size of the hero row, so the stacked day/night images keep
     height: 100% of the row instead of growing to their natural height. */
  grid-template: minmax(0, 1fr) / minmax(0, 1fr);
}

.hero-card img {
  grid-area: 1 / 1;
  min-width: 0;
  min-height: 0;
  transition: opacity 600ms ease;
}

.hero-card .hero-night,
.hero-card.night .hero-day {
  opacity: 0;
}

.hero-card.night .hero-night {
  opacity: 1;
}

:global(html.theme-switching) .hero-card img {
  transition: none;
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

.reveal:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.reveal.lit {
  color: #ffd98a;
  filter: drop-shadow(0 0 6px rgb(255 220 150 / .8));
}

/* ===== UIFX-LOGIN-FLASHLIGHT-OWL-001 ===== */
.login-fx {
  display: contents;
  --flash-x: 50vw;
  --flash-y: 50vh;
  --flash-r: clamp(96px, 11vw, 150px);
}

.night-overlay,
.flash-glow {
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  transition: opacity 500ms ease, visibility 0s linear 500ms;
}

.night-overlay {
  z-index: 40;
  background: radial-gradient(120% 90% at 50% 0%, #0c213d 0%, #091a30 55%, #071426 100%);
  -webkit-mask-image: radial-gradient(circle var(--flash-r) at var(--flash-x) var(--flash-y), transparent 0%, transparent 45%, #000 100%);
  mask-image: radial-gradient(circle var(--flash-r) at var(--flash-x) var(--flash-y), transparent 0%, transparent 45%, #000 100%);
}

/* Warm light inside the beam so it reads as lamp light, not a hole. The page is always in the
   dark theme while the torch is on, so screen lightens and warms what it falls on; kept
   translucent so light text on the dark surfaces is never washed out. */
.flash-glow {
  z-index: 41;
  mix-blend-mode: screen;
  background: radial-gradient(
    circle calc(var(--flash-r) * 1.1) at var(--flash-x) var(--flash-y),
    rgb(255 246 205 / .95) 0%,
    rgb(255 220 150 / .2) 70%,
    transparent 100%
  );
}

.flashlight-on .night-overlay,
.flashlight-on .flash-glow {
  visibility: visible;
  transition: opacity 500ms ease, visibility 0s;
}

.flashlight-on .night-overlay { opacity: .88; }
.flashlight-on .flash-glow { opacity: .32; }

.password-slot {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
}

.password-reveal-layer {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  overflow: hidden;
  white-space: pre;
  pointer-events: none;
  background: var(--field-surface);
  color: var(--text);
  font: inherit;
  font-size: .95rem;
  line-height: 1.45;
  /* Opaque inside the beam (covers the dots), transparent outside it (dots show through). */
  -webkit-mask-image: radial-gradient(circle var(--flash-r) at var(--lx, -999px) var(--ly, -999px), #000 0%, #000 62%, transparent 72%);
  mask-image: radial-gradient(circle var(--flash-r) at var(--lx, -999px) var(--ly, -999px), #000 0%, #000 62%, transparent 72%);
}

.password-reveal-layer.overflow {
  justify-content: flex-end;
}

/* Two glinting eyes above the night overlay, placed exactly where the owl's pupils will be
   (pupil centres at 39% / 60% across and 34% down the owl artwork). */
.owl-hint {
  position: fixed;
  z-index: 42;
  left: var(--hint-x, -200px);
  top: var(--hint-y, -200px);
  width: var(--hint-size, 104px);
  height: var(--hint-size, 104px);
  pointer-events: none;
  animation: owl-hint-in 900ms ease 400ms both;
}

.owl-hint .eye {
  position: absolute;
  top: calc(34% - 4.5%);
  width: 9%;
  height: 9%;
  border-radius: 50%;
  background: radial-gradient(circle at 38% 35%, #fffbe6 0 22%, #ffd75e 45%, #f2a93b 100%);
  box-shadow: 0 0 6px 2px rgb(255 214 110 / .75), 0 0 16px 6px rgb(255 190 80 / .35);
  animation: owl-hint-blink 3.6s ease-in-out infinite, owl-hint-glow 1.8s ease-in-out infinite;
}

.owl-hint .eye.left { left: calc(39% - 4.5%); }
.owl-hint .eye.right { left: calc(60.4% - 4.5%); }

/* A small four-point glint that twinkles off the left eye now and then. */
.owl-hint .eye.left::after {
  content: '';
  position: absolute;
  left: -70%;
  top: -80%;
  width: 110%;
  height: 110%;
  background: #fff8d6;
  clip-path: polygon(50% 0, 60% 40%, 100% 50%, 60% 60%, 50% 100%, 40% 60%, 0 50%, 40% 40%);
  animation: owl-hint-glint 3.6s ease-in-out infinite;
}

@keyframes owl-hint-in { from { opacity: 0; } }
@keyframes owl-hint-blink { 0%, 44%, 52%, 100% { scale: 1 1; } 48% { scale: 1 .1; } }
@keyframes owl-hint-glow { 0%, 100% { filter: brightness(.9); } 50% { filter: brightness(1.25); } }
@keyframes owl-hint-glint { 0%, 60%, 100% { opacity: 0; scale: .4; } 72% { opacity: 1; scale: 1; } 84% { opacity: 0; scale: .6; } }

@media (prefers-reduced-motion: reduce) {
  .owl-hint, .owl-hint .eye, .owl-hint .eye.left::after { animation: none; }
}

/* Trapezoid beam: the torch's cone cut off just past the pointer. Lit area = cone ∩ reach; the
   night overlay uses its complement. There is no round spot at the pointer - only browsers
   without mask-composite (no .beam) fall back to the round spot above. The --lit-* layers are
   resolved on .login-fx in viewport px. */
.login-fx.beam {
  --lit-cone: conic-gradient(from var(--beam-from) at var(--hx) var(--hy), transparent 0deg, #000 8deg, #000 34deg, transparent 42deg, transparent 360deg);
  --lit-reach: radial-gradient(circle var(--beam-reach) at var(--hx) var(--hy), #000 0%, #000 82%, transparent 100%);
}

.beam .night-overlay {
  -webkit-mask-image: linear-gradient(#000, #000), var(--lit-cone), var(--lit-reach);
  mask-image: linear-gradient(#000, #000), var(--lit-cone), var(--lit-reach);
  -webkit-mask-composite: xor, source-in, source-over;
  mask-composite: exclude, intersect, add;
}

.beam .flash-glow {
  /* Warmest right at the lens, fading along the beam. */
  background: radial-gradient(circle var(--beam-reach) at var(--hx) var(--hy), rgb(255 236 190) 0%, rgb(255 246 220) 100%);
  -webkit-mask-image: var(--lit-cone), var(--lit-reach);
  mask-image: var(--lit-cone), var(--lit-reach);
  -webkit-mask-composite: source-in, source-over;
  mask-composite: intersect, add;
}

/* Harder edges than the overlay so characters and dots never show on top of each other. */
.beam .password-reveal-layer {
  -webkit-mask-image:
    conic-gradient(from var(--beam-from) at var(--lhx, -999px) var(--lhy, -999px), transparent 0deg, transparent 6deg, #000 9deg, #000 33deg, transparent 36deg, transparent 360deg),
    radial-gradient(circle var(--beam-reach) at var(--lhx, -999px) var(--lhy, -999px), #000 0%, #000 88%, transparent 94%);
  mask-image:
    conic-gradient(from var(--beam-from) at var(--lhx, -999px) var(--lhy, -999px), transparent 0deg, transparent 6deg, #000 9deg, #000 33deg, transparent 36deg, transparent 360deg),
    radial-gradient(circle var(--beam-reach) at var(--lhx, -999px) var(--lhy, -999px), #000 0%, #000 88%, transparent 94%);
  -webkit-mask-composite: source-in, source-over;
  mask-composite: intersect, add;
}

@media (prefers-reduced-motion: reduce) {
  .night-overlay,
  .flash-glow,
  .flashlight-on .night-overlay,
  .flashlight-on .flash-glow,
  .hero-card img {
    transition-duration: 150ms;
  }
}
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


<style>
/* Light/dark switch on the login page cross-fades the whole page (View Transitions API). */
::view-transition-old(root),
::view-transition-new(root) {
  animation-duration: 550ms;
  animation-timing-function: ease;
}
</style>
