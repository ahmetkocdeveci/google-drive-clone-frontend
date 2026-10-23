<script setup lang="ts">
definePageMeta({ layout: 'auth' })
const drive = useDrive()
const token = useState<string>('pending-password-reset-token', () => '')
const password = ref(''), confirmation = ref(''), pending = ref(false), ready = ref(false), error = ref('')
let disposed = false
onMounted(() => {
  const incoming = new URLSearchParams(window.location.hash.slice(1)).get('token')
  if (incoming) { token.value = incoming; history.replaceState(history.state, '', location.pathname + location.search) }
  ready.value = true
})
async function submit() {
  if (pending.value) return
  error.value = ''
  if (!token.value) { error.value = 'E-postandaki şifre yenileme bağlantısını aç veya yeni bir bağlantı iste.'; return }
  if (password.value.length < 8 || password.value.length > 128) { error.value = 'Şifre 8–128 karakter arasında olmalı.'; return }
  if (password.value !== confirmation.value) { error.value = 'Şifreler eşleşmiyor.'; return }
  pending.value = true
  const input = { token: token.value, password: password.value }
  password.value = ''; confirmation.value = ''
  try { await drive.resetPassword(input) }
  catch (cause) { if (!disposed) error.value = cause instanceof Error ? cause.message : 'Şifre yenilenemedi. Yeniden dene.' }
  finally { if (!disposed) pending.value = false }
}
onBeforeUnmount(() => { disposed = true; password.value = ''; confirmation.value = '' })
useHead({ title: 'Yeni şifre · Ortak Drive' })
</script>
<template><section class="auth-card" aria-labelledby="reset-title"><h1 id="reset-title">Yeni şifreni belirle</h1><p class="muted intro">Şifren yenilendiğinde tüm cihazlardaki oturumların kapatılır. Ardından yeni şifrenle giriş yapabilirsin.</p><p v-if="ready && !token" class="form-error">Yenileme bağlantısı bulunamadı. E-postandaki bağlantıyı aç.</p><form :aria-busy="pending" @submit.prevent="submit"><div class="form-field"><label for="reset-password">Yeni şifre</label><input id="reset-password" v-model="password" type="password" class="form-input" autocomplete="new-password" required minlength="8" maxlength="128" :disabled="pending || !ready || !token" /></div><div class="form-field"><label for="reset-confirm">Yeni şifreyi tekrar yaz</label><input id="reset-confirm" v-model="confirmation" type="password" class="form-input" autocomplete="new-password" required minlength="8" maxlength="128" :disabled="pending || !ready || !token" /></div><p v-if="error" class="form-error" role="alert">{{ error }}</p><button class="btn btn-primary full-button" type="submit" :disabled="pending || !ready || !token">{{ pending ? 'Şifre yenileniyor…' : 'Şifremi yenile' }}</button></form><NuxtLink to="/forgot-password" class="back-link">Yeni bağlantı iste</NuxtLink><NuxtLink to="/login" class="back-link">Giriş sayfasına dön</NuxtLink></section></template>
<style scoped>h1{font-size:26px;margin:0 0 14px}.intro{font-size:14px;line-height:1.8;margin:0 0 25px}.full-button{width:100%;justify-content:center}.back-link{display:block;text-align:center;margin-top:20px;font-size:13px}</style>
