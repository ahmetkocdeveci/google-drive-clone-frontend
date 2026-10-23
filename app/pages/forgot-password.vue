<script setup lang="ts">
definePageMeta({ layout: 'auth' })
const drive = useDrive()
const email = ref(''), pending = ref(false), sent = ref(false), error = ref('')
let controller: AbortController | undefined, disposed = false
async function submit() {
  if (pending.value) return
  pending.value = true; error.value = ''; controller = new AbortController()
  try {
    await drive.api.requestPasswordReset({ email: email.value.trim() }, { signal: controller.signal })
    if (!disposed) sent.value = true
  } catch (cause) { if (!disposed && (cause as { name?: string }).name !== 'AbortError') error.value = cause instanceof Error ? cause.message : 'İstek gönderilemedi. Yeniden dene.' }
  finally { if (!disposed) pending.value = false }
}
onBeforeUnmount(() => { disposed = true; controller?.abort() })
useHead({ title: 'Şifremi unuttum · Ortak Drive' })
</script>
<template>
  <section class="auth-card" aria-labelledby="forgot-title">
    <h1 id="forgot-title">Şifreni yenile</h1>
    <p class="muted intro">Hesabının e-posta adresini yaz. Şifreni belirlemek için bir bağlantı göndereceğiz.</p>
    <div v-if="sent" class="reset-sent" role="status"><AppIcon name="mail" :size="28" /><p>Bu adresle bir hesap varsa şifre yenileme bağlantısını gönderdik. Gelen kutunu ve gereksiz posta klasörünü kontrol et.</p><p>Bağlantı kısa süreliğine geçerlidir ve bir kez kullanılabilir.</p></div>
    <form v-else :aria-busy="pending" @submit.prevent="submit">
      <div class="form-field"><label for="forgot-email">E-posta adresi</label><input id="forgot-email" v-model="email" class="form-input" type="email" autocomplete="email" required maxlength="254" :disabled="pending" /></div>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button type="submit" class="btn btn-primary full-button" :disabled="pending">{{ pending ? 'Gönderiliyor…' : 'Yenileme bağlantısı gönder' }}</button>
    </form>
    <p v-if="drive.mode.value === 'demo'" class="muted intro demo-note">Demo modunda e-posta gönderilmez. Kayıtlı örnek adreslerden biriyle istek yaptıktan sonra <NuxtLink to="/reset-password#token=demo-password-reset">demo bağlantısını açabilirsin</NuxtLink>.</p>
    <NuxtLink to="/login" class="back-link">Giriş sayfasına dön</NuxtLink>
  </section>
</template>
<style scoped>h1{font-size:26px;margin:0 0 14px}.intro{font-size:14px;line-height:1.8;margin:0 0 25px}.full-button{width:100%;justify-content:center}.back-link{display:block;text-align:center;margin-top:25px;font-size:13px}.reset-sent{background:#edf5ff;border-radius:12px;padding:22px;color:#345d8a;font-size:13px;line-height:1.8}.reset-sent p:last-child{margin-bottom:0}.demo-note{font-size:12px;margin-top:22px}</style>
