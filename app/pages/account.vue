<script setup lang="ts">
import type { AuthIdentities } from '../../shared/types'
import { googleAuthErrorMessage } from '../../shared/auth-errors'
const drive = useDrive(), route = useRoute(), router = useRouter()
const identities = ref<AuthIdentities | null>(null), googleAvailable = ref(false), loading = ref(true), pending = ref(false), password = ref('')
const error = ref(googleAuthErrorMessage(route.query.authError)), linked = ref(route.query.linked === 'google')
let controller: AbortController | undefined, disposed = false
async function load() {
  controller?.abort(); controller = new AbortController(); loading.value = true
  try {
    const [identity, providers] = await Promise.all([drive.api.getAuthIdentities({ signal: controller.signal }), drive.api.getAuthProviders({ signal: controller.signal })])
    if (!disposed) { identities.value = identity; googleAvailable.value = providers.google }
  } catch (cause) { if (!disposed && (cause as { name?: string }).name !== 'AbortError') error.value = cause instanceof Error ? cause.message : 'Hesap bilgileri alınamadı.' }
  finally { if (!disposed) loading.value = false }
}
async function connectGoogle() {
  if (pending.value || !identities.value || !googleAvailable.value) return
  error.value = ''; linked.value = false; pending.value = true
  const input = identities.value.hasPassword ? { password: password.value } : {}
  password.value = ''
  try {
    const result = await drive.api.startGoogleLink(input)
    const destination = new URL(result.authorizationUrl)
    if (destination.origin !== 'https://accounts.google.com' || destination.username || destination.password) throw new Error('Google bağlantısı başlatılamadı. Yeniden dene.')
    if (!disposed) location.assign(destination.href)
  } catch (cause) { if (!disposed) error.value = cause instanceof Error ? cause.message : 'Google bağlantısı başlatılamadı.' }
  finally { if (!disposed) pending.value = false }
}
onMounted(() => {
  const query = { ...route.query }
  if (googleAuthErrorMessage(query.authError)) delete query.authError
  if (query.linked === 'google') delete query.linked
  if (Object.keys(query).length !== Object.keys(route.query).length) void router.replace({ path: '/account', query })
  void load()
})
onBeforeUnmount(() => { disposed = true; controller?.abort(); password.value = '' })
useHead({ title: 'Hesap güvenliği · Ortak Drive' })
</script>
<template><div class="account-page"><header class="page-heading"><div><h1 class="page-title">Hesap güvenliği</h1><p class="page-subtitle">Giriş yöntemlerini ve şifreni yönet.</p></div><NuxtLink to="/workspaces" class="btn btn-secondary">Çalışma alanlarıma dön</NuxtLink></header><p v-if="error" class="form-error" role="alert">{{ error }}</p><p v-if="linked && identities?.google" class="success-note" role="status">Google hesabın bağlandı. Bundan sonra Google ile de giriş yapabilirsin.</p><div v-if="loading" class="loading-block" role="status">Hesap bilgilerin yükleniyor…</div><template v-else-if="identities"><section class="panel account-panel"><h2>Hesabın</h2><p><strong>{{ drive.user.value?.name }}</strong></p><p class="muted">{{ drive.user.value?.email }}</p></section><section class="panel account-panel"><h2>Şifre</h2><p class="muted">{{ identities.hasPassword ? 'E-posta adresin ve şifrenle giriş yapabilirsin.' : 'Bu hesaba Google ile giriş yapıyorsun. Şifre yenileme yalnız e-posta ve şifreyle oluşturulan hesaplar için kullanılabilir.' }}</p><NuxtLink v-if="identities.hasPassword" to="/forgot-password" class="btn btn-secondary">Şifremi yenile</NuxtLink></section><section class="panel account-panel"><h2>Google ile giriş</h2><p v-if="identities.google" class="success-note">Google hesabın bağlı.</p><template v-else><p class="muted">Google hesabını bu hesabına açıkça bağlayabilirsin. Aynı e-posta adresi hesapları kendiliğinden birleştirmez.</p><p v-if="!googleAvailable" class="muted">Google bağlantısı bu ortamda henüz kullanıma açılmadı. E-posta ile giriş yapmaya devam edebilirsin.</p><form v-else :aria-busy="pending" @submit.prevent="connectGoogle"><div v-if="identities.hasPassword" class="form-field"><label for="link-password">Mevcut şifren</label><input id="link-password" v-model="password" class="form-input" type="password" autocomplete="current-password" required maxlength="128" :disabled="pending" /><small class="muted">Bağlantıyı senin başlattığını doğrulamak için.</small></div><button class="btn btn-primary" type="submit" :disabled="pending">{{ pending ? 'Google açılıyor…' : 'Google hesabımı bağla' }}</button></form></template></section></template><button v-else class="btn btn-primary" @click="load">Yeniden dene</button></div></template>
<style scoped>.account-page{max-width:850px}.account-panel{padding:26px;margin-bottom:22px}.account-panel h2{margin:0 0 15px;font-size:18px}.account-panel p{line-height:1.8;font-size:14px;overflow-wrap:anywhere}.account-panel .form-field{max-width:400px;margin-top:22px}.account-panel small{display:block;margin-top:7px;font-size:12px}.success-note{color:#17683c;background:#edf8f1;padding:13px 16px;border-radius:9px;font-size:13px;line-height:1.7}</style>
