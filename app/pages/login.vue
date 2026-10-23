<script setup lang="ts">
import { googleAuthErrorMessage } from '../../shared/auth-errors'

definePageMeta({ layout: 'auth' })

const drive = useDrive()
const route = useRoute()
const router = useRouter()
const isDemo = computed(() => drive.mode.value === 'demo')
const email = ref('')
const password = ref('')
const showPassword = ref(false)
const pending = ref(false)
const error = ref(googleAuthErrorMessage(route.query.authError))
const passwordReset = ref(route.query.passwordReset === 'success')

onMounted(() => {
  const query = { ...route.query }
  if (googleAuthErrorMessage(query.authError)) delete query.authError
  if (query.passwordReset === 'success') delete query.passwordReset
  if (Object.keys(query).length === Object.keys(route.query).length) return
  // Retain the pending invitation/verification destination while clearing the handled code.
  void router.replace({ path: route.path, query, hash: route.hash })
})

function destination() {
  const value = typeof route.query.returnTo === 'string' ? route.query.returnTo : ''
  return /^\/(?!\/)/.test(value) && !/[\\\u0000-\u001f]/.test(value) ? value : '/workspaces'
}

const registerLink = computed(() => ({ path: '/register', query: route.query.returnTo ? { returnTo: destination() } : {} }))

async function submit() {
  error.value = ''
  if (!email.value.trim() || !password.value) {
    error.value = 'E-posta adresini ve şifreni yaz.'
    return
  }
  pending.value = true
  try {
    await drive.signIn({ email: email.value.trim(), password: password.value })
    password.value = ''
    await navigateTo(drive.user.value?.emailVerified ? destination() : { path: '/verify-email', query: { returnTo: destination() } })
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Giriş yapılamadı. Lütfen yeniden dene.'
  } finally {
    pending.value = false
  }
}

async function withGoogle() {
  error.value = ''
  pending.value = true
  try { await drive.googleSignIn(destination()) }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'Google ile giriş başlatılamadı.' }
  finally { pending.value = false }
}

function fillDemo() {
  email.value = 'ahmet@example.com'
  password.value = 'Demo1234!'
  error.value = ''
}
</script>

<template>
  <section class="auth-card" aria-labelledby="login-heading">
    <div class="auth-symbol" aria-hidden="true"><AppIcon name="drive" :size="30" /></div>
    <h1 id="login-heading">Tekrar hoş geldin</h1>
    <p class="intro muted">Dosyalarına ve ekibinin çalışma alanlarına ulaşmak için giriş yap.</p>
    <p v-if="passwordReset" class="reset-success" role="status">Şifren yenilendi ve önceki oturumların kapatıldı. Yeni şifrenle giriş yapabilirsin.</p>

    <button type="button" class="btn btn-secondary google-button" :disabled="pending" @click="withGoogle">
      <span class="google-g" aria-hidden="true">G</span> Google ile devam et
    </button>
    <p v-if="String(route.query.returnTo || '').includes('/invitations/accept')" class="muted oauth-invitation-note">Google ile giriş yaptıktan sonra davet bağlantını yeniden aç.</p>
    <div class="divider"><span>veya e-posta ile</span></div>

    <form :aria-busy="pending" @submit.prevent="submit">
      <div class="form-field">
        <label for="login-email">E-posta adresi</label>
        <input id="login-email" v-model="email" class="form-input" type="email" name="email" autocomplete="email" placeholder="ornek@sirket.com" required maxlength="254" :disabled="pending" />
      </div>
      <div class="form-field">
        <label for="login-password">Şifre</label>
        <div class="password-field">
          <input id="login-password" v-model="password" class="form-input" :type="showPassword ? 'text' : 'password'" name="password" autocomplete="current-password" required minlength="8" maxlength="128" :disabled="pending" :aria-describedby="error ? 'login-error' : undefined" />
          <button type="button" class="password-toggle" :aria-label="showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'" :aria-pressed="showPassword" @click="showPassword = !showPassword">{{ showPassword ? 'Gizle' : 'Göster' }}</button>
        </div>
      </div>
      <p v-if="error" id="login-error" class="form-error" role="alert">{{ error }}</p>
      <button class="btn btn-primary submit-button" type="submit" :disabled="pending">{{ pending ? 'Giriş yapılıyor…' : 'Giriş yap' }}<AppIcon v-if="!pending" name="arrow-right" :size="18" /></button>
    </form>

    <div v-if="isDemo" class="demo-note">
      <strong>Demoyu keşfet</strong>
      <p>Örnek hesap: ahmet@example.com<br />Şifre: Demo1234!</p>
      <button type="button" :disabled="pending" @click="fillDemo">Örnek bilgileri doldur</button>
      <small>Bu mod örnek verilerle çalışır; gerçek hesap oluşturulmaz.</small>
    </div>
    <p class="auth-links"><NuxtLink to="/forgot-password">Şifremi unuttum</NuxtLink></p>
    <p class="auth-links">Henüz hesabın yok mu? <NuxtLink :to="registerLink">Hesap oluştur</NuxtLink></p>
  </section>
</template>

<style scoped>
.reset-success { background:#edf8f1; color:#17683c; padding:14px; border-radius:10px; font-size:13px; line-height:1.7; }
h1 { margin: 20px 0 10px; font-size: 28px; line-height: 1.25; letter-spacing: -.8px; }
.intro { margin: 0 0 28px; line-height: 1.65; font-size: 14px; }
.auth-symbol { display: grid; place-items: center; width: 56px; height: 56px; border-radius: 16px; color: var(--accent); background: var(--accent-soft); }
.google-button, .submit-button { width: 100%; justify-content: center; min-height: 46px; }
.google-g { font-family: Arial, sans-serif; font-weight: 700; font-size: 21px; color: #4285f4; margin-right: 4px; }
.divider { display: flex; align-items: center; gap: 14px; margin: 24px 0; color: var(--muted); font-size: 12px; }
.divider::before, .divider::after { content: ''; height: 1px; flex: 1; background: var(--line); }
.password-field { position: relative; }
.password-field input { padding-right: 68px; }
.password-toggle { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); padding: 9px 8px; background: transparent; border: 0; color: var(--accent); cursor: pointer; font: inherit; font-size: 12px; font-weight: 600; border-radius: 6px; }
.password-toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.submit-button { margin-top: 8px; gap: 12px; }
.demo-note { padding: 16px; margin-top: 24px; border-radius: 12px; background: #f0f5ff; color: #324f7c; font-size: 12px; line-height: 1.7; }
.demo-note strong { font-size: 13px; }
.demo-note p { margin: 6px 0; }
.demo-note button { padding: 0; background: none; border: 0; color: var(--accent); font: inherit; font-weight: 600; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
.demo-note small { display: block; margin-top: 8px; line-height: 1.5; }
.auth-links { text-align: center; margin-top: 24px; margin-bottom: 0; font-size: 13px; }
@media (max-width: 480px) { h1 { font-size: 25px; } }
</style>
