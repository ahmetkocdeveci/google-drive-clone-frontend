<script setup lang="ts">
definePageMeta({ layout: 'auth' })

const drive = useDrive()
const route = useRoute()
const isDemo = computed(() => drive.mode.value === 'demo')
const name = ref('')
const email = ref('')
const password = ref('')
const confirmation = ref('')
const showPassword = ref(false)
const pending = ref(false)
const error = ref('')

function destination() {
  const value = typeof route.query.returnTo === 'string' ? route.query.returnTo : ''
  return /^\/(?!\/)/.test(value) && !/[\\\u0000-\u001f]/.test(value) ? value : '/workspaces'
}

const loginLink = computed(() => ({ path: '/login', query: route.query.returnTo ? { returnTo: destination() } : {} }))

async function submit() {
  error.value = ''
  if (!name.value.trim() || !email.value.trim()) { error.value = 'Adını ve e-posta adresini yaz.'; return }
  if (password.value.length < 8 || password.value.length > 128) { error.value = 'Şifren 8 ile 128 karakter arasında olmalı.'; return }
  if (password.value !== confirmation.value) { error.value = 'Şifreler eşleşmiyor. Tekrar kontrol et.'; return }
  pending.value = true
  try {
    await drive.signUp({ name: name.value.trim(), email: email.value.trim(), password: password.value })
    password.value = ''
    confirmation.value = ''
    await navigateTo(drive.user.value?.emailVerified ? destination() : { path: '/verify-email', query: { returnTo: destination() } })
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Hesap oluşturulamadı. Lütfen yeniden dene.'
  } finally { pending.value = false }
}

async function withGoogle() {
  error.value = ''
  pending.value = true
  try { await drive.googleSignIn(destination()) }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'Google ile kayıt başlatılamadı.' }
  finally { pending.value = false }
}
</script>

<template>
  <section class="auth-card" aria-labelledby="register-heading">
    <div class="auth-symbol" aria-hidden="true"><AppIcon name="user-plus" :size="28" /></div>
    <h1 id="register-heading">Birlikte üretmeye başla</h1>
    <p class="intro muted">Hesabını oluştur, dosyalarını bir araya getir ve ekibinle paylaş.</p>
    <button type="button" class="btn btn-secondary google-button" :disabled="pending" @click="withGoogle"><span class="google-g" aria-hidden="true">G</span>Google ile devam et</button>
    <div class="divider"><span>veya e-posta ile</span></div>
    <form :aria-busy="pending" @submit.prevent="submit">
      <div class="form-field">
        <label for="register-name">Ad soyad</label>
        <input id="register-name" v-model="name" class="form-input" type="text" name="name" autocomplete="name" placeholder="Adın ve soyadın" required minlength="2" maxlength="100" :disabled="pending" />
      </div>
      <div class="form-field">
        <label for="register-email">E-posta adresi</label>
        <input id="register-email" v-model="email" class="form-input" type="email" name="email" autocomplete="email" placeholder="ornek@sirket.com" required maxlength="254" :disabled="pending" />
      </div>
      <div class="form-field">
        <label for="register-password">Şifre</label>
        <div class="password-field">
          <input id="register-password" v-model="password" class="form-input" :type="showPassword ? 'text' : 'password'" name="password" autocomplete="new-password" required minlength="8" maxlength="128" aria-describedby="password-hint" :disabled="pending" />
          <button type="button" class="password-toggle" :aria-label="showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'" :aria-pressed="showPassword" @click="showPassword = !showPassword">{{ showPassword ? 'Gizle' : 'Göster' }}</button>
        </div>
        <small id="password-hint" class="field-hint">En az 8 karakter kullan.</small>
      </div>
      <div class="form-field">
        <label for="register-confirmation">Şifreyi tekrar yaz</label>
        <input id="register-confirmation" v-model="confirmation" class="form-input" :type="showPassword ? 'text' : 'password'" name="password-confirmation" autocomplete="new-password" required minlength="8" maxlength="128" :disabled="pending" :aria-describedby="error ? 'register-error' : undefined" />
      </div>
      <p v-if="error" id="register-error" class="form-error" role="alert">{{ error }}</p>
      <button class="btn btn-primary submit-button" type="submit" :disabled="pending">{{ pending ? 'Hesap oluşturuluyor…' : 'Hesap oluştur' }}<AppIcon v-if="!pending" name="arrow-right" :size="18" /></button>
    </form>
    <p v-if="isDemo" class="demo-note">Demo modundasın. Bilgilerin bu oturumda örnek hesap için kullanılır; gerçek kayıt veya e-posta gönderimi yapılmaz.</p>
    <p class="auth-links">Zaten hesabın var mı? <NuxtLink :to="loginLink">Giriş yap</NuxtLink></p>
  </section>
</template>

<style scoped>
h1 { margin: 20px 0 10px; font-size: 27px; line-height: 1.25; letter-spacing: -.8px; }
.intro { margin: 0 0 24px; line-height: 1.65; font-size: 14px; }
.auth-symbol { display: grid; place-items: center; width: 56px; height: 56px; border-radius: 16px; color: var(--accent); background: var(--accent-soft); }
.google-button, .submit-button { width: 100%; justify-content: center; min-height: 46px; }
.google-g { font-family: Arial, sans-serif; font-weight: 700; font-size: 21px; color: #4285f4; margin-right: 4px; }
.divider { display: flex; align-items: center; gap: 14px; margin: 22px 0; color: var(--muted); font-size: 12px; }
.divider::before, .divider::after { content: ''; height: 1px; flex: 1; background: var(--line); }
.password-field { position: relative; }
.password-field input { padding-right: 68px; }
.password-toggle { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); padding: 9px 8px; background: transparent; border: 0; color: var(--accent); cursor: pointer; font: inherit; font-size: 12px; font-weight: 600; border-radius: 6px; }
.password-toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.field-hint { display: block; margin-top: 6px; font-size: 12px; color: var(--muted); }
.submit-button { margin-top: 8px; gap: 12px; }
.demo-note { padding: 13px 15px; margin: 20px 0 0; border-radius: 10px; background: #f0f5ff; color: #324f7c; font-size: 12px; line-height: 1.65; }
.auth-links { text-align: center; margin-top: 24px; margin-bottom: 0; font-size: 13px; }
@media (max-width: 480px) { h1 { font-size: 24px; } }
</style>
