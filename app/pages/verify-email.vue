<script setup lang="ts">
definePageMeta({ layout: 'auth' })

const drive = useDrive()
const route = useRoute()
const token = useState<string>('pending-verification-token', () => '')
const pending = ref(false)
const error = ref('')
const success = ref(false)
const ready = ref(false)
const resending = ref(false)
const resent = ref(false)
const switching = ref(false)
const isDemo = computed(() => drive.mode.value === 'demo')
const user = computed(() => drive.user.value)
const verified = computed(
  () => success.value || (ready.value && !!user.value?.emailVerified && !token.value),
)

function destination() {
  const value = typeof route.query.returnTo === 'string' ? route.query.returnTo : ''
  return /^\/(?!\/)/.test(value) && !/[\\\u0000-\u001f]/.test(value) ? value : '/workspaces'
}

const loginLink = computed(() => ({
  path: '/login',
  query: { returnTo: `/verify-email?returnTo=${encodeURIComponent(destination())}` },
}))

onMounted(() => {
  const fragment = new URLSearchParams(window.location.hash.slice(1))
  const incoming = fragment.get('token')
  if (incoming) {
    token.value = incoming
    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname + window.location.search,
    )
  }
  ready.value = true
})

async function verify() {
  if (pending.value) return
  error.value = ''
  const verificationToken = token.value || (isDemo.value ? 'demo-email-verification' : '')
  if (!verificationToken) {
    error.value = 'Doğrulama bağlantısı bulunamadı. E-postandaki doğrulama bağlantısını aç.'
    return
  }
  pending.value = true
  try {
    await drive.verifyEmail(verificationToken)
    token.value = ''
    success.value = true
  } catch (cause) {
    error.value =
      cause instanceof Error
        ? cause.message
        : 'E-posta doğrulanamadı. Bağlantıyı kontrol edip yeniden dene.'
  } finally {
    pending.value = false
  }
}

async function resend() {
  if (resending.value) return
  error.value = ''
  resent.value = false
  resending.value = true
  try {
    await drive.resendVerification()
    resent.value = true
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Doğrulama e-postası gönderilemedi.'
  } finally {
    resending.value = false
  }
}

async function differentAccount() {
  if (switching.value || pending.value || resending.value) return
  switching.value = true
  error.value = ''
  try {
    await drive.switchAccount(`/verify-email?returnTo=${encodeURIComponent(destination())}`)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Hesap değiştirilemedi. Yeniden dene.'
  } finally {
    switching.value = false
  }
}
</script>

<template>
  <section class="auth-card verification-card" aria-labelledby="verify-heading">
    <div class="verification-symbol" :class="{ verified }" aria-hidden="true">
      <AppIcon :name="verified ? 'check' : 'mail'" :size="32" />
    </div>
    <template v-if="verified">
      <h1 id="verify-heading">E-postan doğrulandı</h1>
      <p class="intro muted">
        Her şey hazır. Çalışma alanlarına geçebilir veya seni bekleyen daveti kabul edebilirsin.
      </p>
      <NuxtLink :to="destination()" class="btn btn-primary full-button"
        >Devam et<AppIcon name="arrow-right" :size="18"
      /></NuxtLink>
    </template>
    <template v-else>
      <h1 id="verify-heading">E-postanı doğrula</h1>
      <p class="intro muted">
        <template v-if="user"
          >Şu anda <strong>{{ user.email }}</strong> hesabıyla giriş yaptın. Bağlantı bu hesaba
          gönderilmiş olmalı.</template
        ><span v-else>E-postana gönderilen bağlantıyı açarak hesabını doğrula.</span>
      </p>
      <div class="verification-instructions">
        <span class="step-number">1</span>
        <p>E-posta kutundaki doğrulama mesajını aç.</p>
        <span class="step-number">2</span>
        <p>Mesajdaki bağlantıyla bu sayfaya gel.</p>
        <span class="step-number">3</span>
        <p>Aşağıdaki butonla doğrulamayı tamamla.</p>
      </div>
      <p v-if="isDemo" class="demo-note">
        Demo modunda e-posta gönderilmez. Aşağıdaki butonla örnek hesabını doğrulayabilirsin.
      </p>
      <p v-else-if="ready && !token" class="missing-note">
        Bu sayfada doğrulama bağlantısı yok. E-postandaki bağlantıyı aç. Bağlantın geçersizse yeni
        bir doğrulama bağlantısı gereklidir.
      </p>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button
        v-if="(isDemo || token) && user"
        type="button"
        class="btn btn-primary full-button"
        :disabled="pending || !ready || switching || resending"
        @click="verify"
      >
        {{ pending ? 'Doğrulanıyor…' : isDemo ? 'Demo hesabını doğrula' : 'E-postamı doğrula'
        }}<AppIcon v-if="!pending" name="arrow-right" :size="18" />
      </button>
      <p v-if="resent" class="muted" role="status">
        Yeni doğrulama bağlantısı e-posta adresine gönderildi. Önceki bağlantı artık geçerli değil.
      </p>
      <button
        v-if="!isDemo && user && !user.emailVerified"
        type="button"
        class="btn btn-secondary full-button resend-button"
        :disabled="resending || pending || switching"
        @click="resend"
      >
        {{ resending ? 'Gönderiliyor…' : 'Yeni doğrulama bağlantısı gönder' }}
      </button>
      <button
        v-if="user"
        type="button"
        class="btn btn-secondary full-button resend-button"
        :disabled="resending || pending || switching"
        @click="differentAccount"
      >
        {{ switching ? 'Hesap değiştiriliyor…' : 'Başka hesapla giriş yap' }}
      </button>
      <p class="auth-links"><NuxtLink :to="loginLink">Giriş sayfasına dön</NuxtLink></p>
    </template>
  </section>
</template>

<style scoped>
.verification-card {
  text-align: center;
}
.verification-symbol {
  display: grid;
  place-items: center;
  width: 76px;
  height: 76px;
  margin: 0 auto 26px;
  border-radius: 24px;
  background: var(--accent-soft);
  color: var(--accent);
}
.verification-symbol.verified {
  background: #e8f5ed;
  color: #18844d;
}
h1 {
  font-size: 27px;
  letter-spacing: -0.7px;
  margin: 0 0 12px;
}
.intro {
  font-size: 14px;
  line-height: 1.75;
  margin: 0 0 26px;
  overflow-wrap: anywhere;
}
.intro strong {
  color: var(--text);
  font-weight: 600;
}
.verification-instructions {
  display: grid;
  grid-template-columns: 24px 1fr;
  text-align: left;
  gap: 16px 12px;
  padding: 20px;
  background: #f8fafd;
  border: 1px solid var(--line);
  border-radius: 14px;
  margin-bottom: 24px;
}
.verification-instructions p {
  margin: 2px 0 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text);
}
.step-number {
  display: grid;
  place-items: center;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  background: #e3edff;
  color: #245db4;
  font-size: 12px;
  font-weight: 700;
}
.demo-note,
.missing-note {
  padding: 14px;
  background: #f0f5ff;
  color: #324f7c;
  border-radius: 10px;
  font-size: 12px;
  line-height: 1.65;
  margin: 0 0 22px;
}
.missing-note {
  background: #fff7e5;
  color: #795b22;
}
.full-button {
  width: 100%;
  justify-content: center;
  min-height: 46px;
  gap: 10px;
}
.auth-links {
  margin: 24px 0 0;
  font-size: 13px;
}
.resend-button {
  margin-top: 12px;
}
.form-error {
  text-align: left;
}
</style>
