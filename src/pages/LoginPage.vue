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
const auth=useAuthStore();const context=useContextStore();const preferences=usePreferencesStore();const router=useRouter()
const code=ref('');const password=ref('');const showPassword=ref(false);const submitError=ref('')
const slogans=['Học chủ động. Tiến bộ mỗi ngày.','Mỗi giờ tự học đều có mục tiêu.','Kế hoạch rõ ràng, tiến bộ bền vững.','Tự học hôm nay, tự tin ngày mai.','Một chút mỗi ngày tạo nên khác biệt.']
const sloganIndex=ref(0);useIntervalFn(()=>sloganIndex.value=(sloganIndex.value+1)%slogans.length,7000)
const slogan=computed(()=>slogans[sloganIndex.value])
async function submit(){submitError.value='';try{await auth.login(code.value,password.value);context.hydrate(auth.legacyState);await router.replace('/dashboard')}catch(error){submitError.value=error instanceof Error?error.message:'Đăng nhập không thành công.'}}
</script>
<template>
<AuthLayout>
  <section class="login-shell">
    <div class="login-visual">
      <header class="brand-row"><div class="brand"><img :src="faviconUrl" alt=""/><strong>SỔ TỰ HỌC</strong></div><IconButton label="Đổi giao diện sáng/tối" @click="preferences.toggleTheme"><Sun v-if="preferences.resolvedTheme==='dark'"/><Moon v-else/></IconButton></header>
      <div class="visual-copy"><span>HỌC CHỦ ĐỘNG</span><h1>Mỗi giờ tự học<br/>đều có mục tiêu.</h1><p>Theo dõi kế hoạch, nhận phản hồi và tiến bộ rõ ràng theo từng tuần.</p></div>
      <figure class="hero-card"><img :src="loginHeroUrl" alt="Học sinh cùng học tập"/></figure>
      <div class="slogan" aria-live="polite"><span class="slogan-dot"></span><b>{{ slogan }}</b></div>
      <div class="benefits"><span><b>01</b> Học mỗi ngày</span><span><b>02</b> Kế hoạch rõ</span><span><b>03</b> Phản hồi đúng lúc</span></div>
    </div>
    <div class="login-panel">
      <div class="form-heading"><span>TÀI KHOẢN HỌC TẬP</span><h2>Chào mừng trở lại</h2><p>Dùng mã đăng nhập được nhà trường cấp.</p></div>
      <form @submit.prevent="submit" class="login-form">
        <label><span>Mã đăng nhập</span><div class="field"><UserRound/><input v-model.trim="code" autocomplete="username" placeholder="Ví dụ: gv-7a9" required/></div></label>
        <label><span>Mật khẩu</span><div class="field"><LockKeyhole/><input v-model="password" :type="showPassword?'text':'password'" autocomplete="current-password" placeholder="Nhập mật khẩu" required/><button type="button" class="reveal" :aria-label="showPassword?'Ẩn mật khẩu':'Hiện mật khẩu'" @click="showPassword=!showPassword"><EyeOff v-if="showPassword"/><Eye v-else/></button></div></label>
        <p v-if="submitError||auth.error" class="error" role="alert">{{ submitError||auth.error }}</p>
        <AppButton type="submit" :loading="auth.loading" class="submit">Đăng nhập</AppButton>
      </form>
      <div class="security-notes"><span>✓ Tài khoản theo lớp</span><span>✓ Phiên đăng nhập an toàn</span><span>✓ Đồng bộ dữ liệu Supabase</span></div>
    </div>
  </section>
</AuthLayout>
</template>
<style scoped>
.login-shell{width:min(1500px,calc(100vw - 48px));min-height:min(820px,calc(100vh - 48px));display:grid;grid-template-columns:minmax(0,1.08fr) minmax(420px,.92fr);overflow:hidden;border:1px solid var(--border);border-radius:28px;background:var(--surface);box-shadow:var(--shadow-md)}
.login-visual{padding:28px 34px;display:grid;grid-template-rows:auto auto minmax(280px,1fr) auto auto;gap:18px;background:linear-gradient(145deg,color-mix(in srgb,var(--color-primary) 9%,var(--surface)),var(--surface));min-width:0}.brand-row{display:flex;justify-content:space-between;align-items:center}.brand{display:flex;align-items:center;gap:10px;letter-spacing:.04em}.brand img{width:38px;height:38px}.visual-copy span,.form-heading span{font-size:.76rem;font-weight:900;letter-spacing:.16em;color:var(--color-primary)}.visual-copy h1{font-size:clamp(2rem,4vw,4rem);line-height:1.02;margin:8px 0 10px}.visual-copy p,.form-heading p{color:var(--text-muted);margin:0;max-width:52ch}.hero-card{margin:0;min-height:0;border-radius:22px;overflow:hidden;border:1px solid var(--border);background:var(--surface-soft)}.hero-card img{width:100%;height:100%;object-fit:cover;position:static}.slogan{display:flex;align-items:center;gap:10px;min-height:32px}.slogan-dot{width:8px;height:8px;border-radius:50%;background:var(--color-primary);box-shadow:0 0 0 6px color-mix(in srgb,var(--color-primary) 12%,transparent)}.benefits{display:flex;gap:18px;flex-wrap:wrap;color:var(--text-muted);font-size:.88rem}.benefits b{color:var(--color-primary);margin-right:4px}.login-panel{display:grid;align-content:center;padding:clamp(28px,5vw,72px);background:var(--surface-raised)}.form-heading h2{font-size:clamp(1.8rem,3vw,2.7rem);margin:8px 0}.login-form{display:grid;gap:18px;margin-top:32px}.login-form label>span{display:block;font-weight:800;font-size:.9rem;margin-bottom:7px}.field{display:flex;align-items:center;gap:10px;border:1px solid var(--border);border-radius:14px;background:var(--input);padding:0 13px;transition:border-color var(--transition-fast),box-shadow var(--transition-fast),transform var(--transition-fast),background var(--transition-fast)}.field:hover{border-color:color-mix(in srgb,var(--color-primary) 48%,var(--border));transform:translateY(-1px);box-shadow:0 8px 24px color-mix(in srgb,var(--color-primary) 10%,transparent)}.field:focus-within{border-color:var(--color-primary);box-shadow:0 0 0 4px color-mix(in srgb,var(--color-primary) 14%,transparent);transform:translateY(-1px)}.field>svg{width:19px;color:var(--text-muted);transition:color var(--transition-fast)}.field:focus-within>svg{color:var(--color-primary)}.field input{flex:1;min-width:0;height:50px;border:0;outline:0;background:transparent;color:var(--text)}.reveal{border:0;background:transparent;color:var(--text-muted);display:grid;place-items:center;padding:5px;border-radius:8px}.reveal:hover{color:var(--color-primary);transform:translateY(-1px)}.reveal svg{width:19px}.submit{width:100%;min-height:48px}.error{margin:0;color:var(--color-danger);font-size:.9rem}.security-notes{display:grid;gap:7px;margin-top:24px;color:var(--text-muted);font-size:.85rem}
@media(max-width:980px){.login-shell{grid-template-columns:1fr;width:min(760px,calc(100vw - 24px));min-height:auto}.login-visual{grid-template-rows:auto auto 250px auto}.benefits{display:none}.login-panel{padding:32px}.visual-copy h1{font-size:2.4rem}}
@media(max-width:560px){.login-visual{padding:20px;grid-template-rows:auto auto 190px auto}.visual-copy p{display:none}.visual-copy h1{font-size:2rem}.login-panel{padding:24px 20px}.login-shell{border-radius:20px}}
</style>
