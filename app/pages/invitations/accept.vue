<script setup lang="ts">
import type { InvitationPreview } from '../../../shared/types'

definePageMeta({ layout: 'auth' })

const drive = useDrive()
const pendingToken = useState<string | null>('pending-invitation-token', () => null)
const preview = ref<InvitationPreview | null>(null)
const ready = ref(false)
const loading = ref(false)
const accepting = ref(false)
const switching = ref(false)
const error = ref('')
const inspectionFailed = ref(false)
const user = computed(() => drive.user.value)
const isDemo = computed(() => drive.mode.value === 'demo')
const invitationRoute = '/invitations/accept'
const roleLabel = computed(() => (preview.value?.role === 'editor' ? 'Editor' : 'Viewer'))
const expiry = computed(() =>
  preview.value
    ? new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(preview.value.expiresAt),
      )
    : '',
)
let requestVersion = 0
let disposed = false
onBeforeUnmount(() => {
  disposed = true
  requestVersion++
})

onMounted(() => {
  const fragment = new URLSearchParams(window.location.hash.slice(1))
  const incomingToken = fragment.get('token')
  if (incomingToken) {
    pendingToken.value = incomingToken
    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname + window.location.search,
    )
  }
  ready.value = true
})

watch(
  [
    ready,
    () => drive.user.value?.id,
    () => drive.user.value?.emailVerified,
    drive.sessionRevision,
    pendingToken,
  ],
  async () => {
    const version = ++requestVersion
    preview.value = null
    error.value = ''
    inspectionFailed.value = false
    loading.value = false
    if (!ready.value || !pendingToken.value || !drive.user.value?.emailVerified) return
    loading.value = true
    try {
      const result = await drive.inspectInvitation(pendingToken.value)
      if (version === requestVersion) preview.value = result
    } catch (cause) {
      if (version === requestVersion) {
        inspectionFailed.value = true
        error.value =
          cause instanceof Error
            ? cause.message
            : 'Davet görüntülenemedi. Bağlantının süresi dolmuş veya davet iptal edilmiş olabilir.'
      }
    } finally {
      if (version === requestVersion) loading.value = false
    }
  },
  { immediate: true },
)

async function accept() {
  if (!pendingToken.value || !preview.value || accepting.value) return
  const token = pendingToken.value,
    revision = drive.sessionRevision.value,
    identity = user.value?.id
  const isCurrent = () =>
    !disposed &&
    token === pendingToken.value &&
    revision === drive.sessionRevision.value &&
    identity === user.value?.id
  error.value = ''
  accepting.value = true
  try {
    const workspace = await drive.acceptInvitation(token)
    if (!isCurrent()) return
    pendingToken.value = null
    await navigateTo(`/workspaces/${encodeURIComponent(workspace.id)}/files`)
  } catch (cause) {
    if (isCurrent())
      error.value =
        cause instanceof Error ? cause.message : 'Davet kabul edilemedi. Lütfen yeniden dene.'
  } finally {
    accepting.value = false
  }
}

function useDemoInvitation() {
  pendingToken.value = 'demo-invitation'
}
async function differentAccount() {
  if (switching.value || accepting.value) return
  switching.value = true
  error.value = ''
  try {
    await drive.switchAccount(invitationRoute)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Hesap değiştirilemedi. Yeniden dene.'
  } finally {
    switching.value = false
  }
}
</script>

<template>
  <section class="auth-card invitation-card" aria-labelledby="invitation-heading">
    <div class="invitation-symbol" aria-hidden="true"><AppIcon name="users" :size="32" /></div>
    <h1 id="invitation-heading">Ekibin seni bekliyor</h1>
    <p class="intro muted">Birlikte çalışmaya başlamak için çalışma alanı davetini kabul et.</p>

    <div v-if="!ready" class="state-note" role="status">Davet bağlantısı kontrol ediliyor…</div>
    <template v-else-if="!pendingToken">
      <div class="empty-invitation">
        <AppIcon name="link" :size="24" />
        <p>
          Bu sayfada bir davet bağlantısı bulunamadı. E-postana gönderilen davet bağlantısını aç.
        </p>
      </div>
      <template v-if="isDemo"
        ><p class="demo-note">Demo modunda örnek bir davetle bu akışı deneyebilirsin.</p>
        <button type="button" class="btn btn-primary full-button" @click="useDemoInvitation">
          Örnek daveti göster
        </button></template
      >
      <NuxtLink to="/workspaces" class="btn btn-secondary full-button secondary-link"
        >Çalışma alanlarıma dön</NuxtLink
      >
    </template>

    <template v-else-if="!user">
      <div class="state-note">
        <AppIcon name="lock" :size="22" />
        <p>Davetini görmek için önce giriş yap. Davet edilen e-posta adresini kullanmalısın.</p>
      </div>
      <NuxtLink
        :to="{ path: '/login', query: { returnTo: invitationRoute } }"
        class="btn btn-primary full-button"
        >Giriş yap<AppIcon name="arrow-right" :size="18"
      /></NuxtLink>
      <p class="auth-links">
        Henüz hesabın yok mu?
        <NuxtLink :to="{ path: '/register', query: { returnTo: invitationRoute } }"
          >Hesap oluştur</NuxtLink
        >
      </p>
    </template>

    <template v-else-if="!user.emailVerified">
      <div class="state-note">
        <AppIcon name="mail" :size="22" />
        <p>
          Davetin güvenliği için önce <strong>{{ user.email }}</strong> adresini doğrulamalısın.
        </p>
      </div>
      <NuxtLink
        :to="{ path: '/verify-email', query: { returnTo: invitationRoute } }"
        class="btn btn-primary full-button"
        >E-postamı doğrula<AppIcon name="arrow-right" :size="18"
      /></NuxtLink>
    </template>

    <div v-else-if="loading" class="state-note" role="status">Davet bilgileri yükleniyor…</div>
    <template v-else-if="preview">
      <div class="workspace-preview">
        <div class="workspace-avatar" aria-hidden="true">
          {{ preview.workspaceName.slice(0, 1).toLocaleUpperCase('tr-TR') }}
        </div>
        <h2>{{ preview.workspaceName }}</h2>
        <span class="role-badge">{{ roleLabel }} olarak katılacaksın</span>
        <p>
          {{
            preview.role === 'editor'
              ? 'Dosyaları görüntüleyebilir, ekleyebilir, düzenleyebilir ve silebilirsin.'
              : 'Çalışma alanındaki dosyaları görüntüleyebilir ve indirebilirsin.'
          }}
        </p>
      </div>
      <dl class="invitation-details">
        <div>
          <dt>Davet edilen hesap</dt>
          <dd>{{ preview.email }}</dd>
        </div>
        <div>
          <dt>Son geçerlilik</dt>
          <dd>{{ expiry }}</dd>
        </div>
      </dl>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button
        type="button"
        class="btn btn-primary full-button"
        :disabled="accepting || switching"
        @click="accept"
      >
        {{ accepting ? 'Katılınıyor…' : 'Daveti kabul et'
        }}<AppIcon v-if="!accepting" name="arrow-right" :size="18" />
      </button>
      <NuxtLink to="/workspaces" class="skip-invitation">Şimdilik geç</NuxtLink>
    </template>
    <template v-else-if="inspectionFailed"
      ><p class="form-error" role="alert">{{ error }}</p>
      <p class="muted unavailable-hint">
        Davet edilen e-posta hesabıyla giriş yaptığını kontrol et. Yeni bir davet gerekiyorsa
        çalışma alanı sahibinden isteyebilirsin.
      </p>
      <NuxtLink to="/workspaces" class="btn btn-secondary full-button"
        >Çalışma alanlarıma dön</NuxtLink
      ></template
    >
    <p v-if="error && !preview && !inspectionFailed" class="form-error" role="alert">{{ error }}</p>
    <button
      v-if="user && pendingToken"
      type="button"
      class="btn btn-secondary full-button secondary-link"
      :disabled="switching || accepting || loading"
      @click="differentAccount"
    >
      {{ switching ? 'Hesap değiştiriliyor…' : 'Başka hesapla giriş yap' }}
    </button>
    <p v-if="isDemo && pendingToken" class="demo-caption">
      Bu bir demo davetidir. Gerçek bir e-posta gönderilmez.
    </p>
  </section>
</template>

<style scoped>
.invitation-card {
  text-align: center;
}
.invitation-symbol {
  display: grid;
  place-items: center;
  width: 72px;
  height: 72px;
  margin: 0 auto 24px;
  border-radius: 22px;
  background: var(--accent-soft);
  color: var(--accent);
}
h1 {
  font-size: 27px;
  letter-spacing: -0.7px;
  margin: 0 0 12px;
}
.intro {
  font-size: 14px;
  line-height: 1.7;
  margin: 0 0 28px;
}
.full-button {
  width: 100%;
  justify-content: center;
  min-height: 46px;
  gap: 10px;
}
.secondary-link {
  margin-top: 12px;
}
.state-note,
.empty-invitation {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
  padding: 22px 18px;
  margin-bottom: 22px;
  color: var(--muted);
  background: #f7f9fc;
  border: 1px solid var(--line);
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.7;
}
.state-note p,
.empty-invitation p {
  margin: 0;
  overflow-wrap: anywhere;
}
.state-note strong {
  font-weight: 600;
  color: var(--text);
}
.workspace-preview {
  border: 1px solid var(--line);
  background: #f8faff;
  border-radius: 16px;
  padding: 24px 20px;
}
.workspace-avatar {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 14px;
  margin: 0 auto 12px;
  background: #dce9ff;
  color: #2358b0;
  font-size: 23px;
  font-weight: 600;
}
h2 {
  font-size: 19px;
  margin: 0 0 12px;
  overflow-wrap: anywhere;
}
.role-badge {
  display: inline-block;
  padding: 5px 10px;
  border-radius: 6px;
  color: #245db4;
  background: #e6eeff;
  font-size: 12px;
  font-weight: 600;
}
.workspace-preview p {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.7;
  margin: 16px 0 0;
}
.invitation-details {
  margin: 24px 0;
  font-size: 12px;
  text-align: left;
}
.invitation-details div {
  padding: 8px 0;
}
.invitation-details dt {
  color: var(--muted);
  margin-bottom: 4px;
}
.invitation-details dd {
  margin: 0;
  color: var(--text);
  font-weight: 500;
  overflow-wrap: anywhere;
}
.skip-invitation {
  display: inline-block;
  margin-top: 20px;
  color: var(--muted);
  font-size: 13px;
}
.auth-links {
  font-size: 13px;
  margin: 24px 0 0;
}
.demo-note,
.demo-caption {
  color: #44618d;
  font-size: 12px;
  line-height: 1.65;
}
.demo-note {
  padding: 12px;
  background: #f0f5ff;
  border-radius: 10px;
}
.demo-caption {
  margin: 22px 0 0;
}
.form-error {
  text-align: left;
}
.unavailable-hint {
  font-size: 13px;
  line-height: 1.7;
  margin: 0 0 24px;
}
</style>
