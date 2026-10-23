<script setup lang="ts">
import { auditActionLabel, createAuditHistory } from '~/services/audit-history'

definePageMeta({ layout: 'workspace', middleware: ['workspace'] })
const drive = useDrive(), route = useRoute()
const workspaceId = computed(() => String(route.params.wid || ''))
const canRead = computed(() => drive.currentWorkspace.value?.id === workspaceId.value && drive.currentWorkspace.value.capabilities.includes('audit:read'))
const history = createAuditHistory(
  () => ({ workspaceId: workspaceId.value, userId: drive.user.value?.id || '', sessionRevision: drive.sessionRevision.value, canRead: canRead.value }),
  (wid, query, options) => drive.api.listAuditEventsPage(wid, query, options),
)
const { items, nextCursor, loading, loadingMore, error, needsRefresh, accessLost } = history
function date(value: string) {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '—' : new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed)
}
onMounted(history.refresh)
watch([workspaceId, canRead, () => drive.user.value?.id, () => drive.sessionRevision.value], history.refresh)
onBeforeUnmount(history.dispose)
useHead({ title: 'İşlem geçmişi · Ortak Drive' })
</script>

<template>
  <section class="activity-page" :aria-busy="loading || loadingMore">
    <header class="page-heading">
      <div><h1 class="page-title">İşlem geçmişi</h1><p class="page-subtitle">Çalışma alanındaki değişiklikler, en yeni işlemden başlayarak.</p></div>
      <button v-if="canRead && !accessLost" type="button" class="btn btn-secondary" :disabled="loading" @click="history.refresh"><AppIcon name="refresh" :size="17" />Yenile</button>
    </header>
    <div v-if="!canRead || accessLost" class="empty-state" role="status"><AppIcon name="lock" :size="35" /><h2>Bu geçmişi yalnızca Owner görüntüleyebilir.</h2><p>Çalışma alanındaki rolün değişmiş olabilir.</p><NuxtLink :to="`/workspaces/${encodeURIComponent(workspaceId)}/files`" class="btn btn-secondary">Dosyalara dön</NuxtLink></div>
    <template v-else>
      <div v-if="error" class="activity-error" role="alert"><p>{{ error }}</p><button type="button" class="btn btn-secondary" :disabled="loading" @click="history.refresh">{{ needsRefresh ? 'Listeyi yenile' : 'Yeniden dene' }}</button></div>
      <div v-if="loading" class="empty-state" role="status"><AppIcon name="clock" :size="32" /><p>İşlem geçmişi yükleniyor…</p></div>
      <div v-else-if="!items.length && !error" class="empty-state"><AppIcon name="clock" :size="38" /><h2>Henüz işlem kaydı yok.</h2><p>Çalışma alanında yapılan değişiklikler burada görünecek.</p></div>
      <ol v-if="items.length" class="activity-list" aria-label="İşlem geçmişi kayıtları">
        <li v-for="event in items" :key="event.id">
          <span class="activity-mark"><AppIcon name="clock" :size="19" /></span>
          <div class="activity-copy"><strong>{{ auditActionLabel(event.action) }}</strong><span>{{ event.actor.name }}</span></div>
          <time :datetime="event.createdAt">{{ date(event.createdAt) }}</time>
        </li>
      </ol>
      <div v-if="items.length" class="activity-pagination"><p role="status">{{ items.length }} işlem gösteriliyor.</p><button v-if="nextCursor" type="button" class="btn btn-secondary" :disabled="loadingMore || loading" @click="history.more">{{ loadingMore ? 'Yükleniyor…' : 'Daha eski işlemler' }}</button></div>
    </template>
  </section>
</template>

<style scoped>
.activity-page .page-heading{align-items:flex-start;gap:18px;flex-wrap:wrap}.activity-list{list-style:none;padding:0;margin:26px 0 0;border:1px solid var(--line);border-radius:14px;overflow:hidden}.activity-list li{display:grid;grid-template-columns:38px minmax(0,1fr) auto;gap:14px;align-items:center;padding:19px 20px}.activity-list li+li{border-top:1px solid var(--line)}.activity-mark{width:36px;height:36px;border-radius:50%;background:#edf3fe;color:#0b57d0;display:grid;place-items:center}.activity-copy{display:flex;flex-direction:column;gap:7px;min-width:0;overflow-wrap:anywhere}.activity-copy strong{font-size:13px;font-weight:500;line-height:1.6}.activity-copy span,.activity-list time{font-size:12px;color:var(--muted);line-height:1.6}.activity-list time{text-align:right}.activity-pagination{display:flex;flex-direction:column;align-items:center;gap:10px;margin-top:22px}.activity-pagination p{font-size:12px;color:var(--muted);margin:0}.activity-error{border:1px solid #f4d2cc;background:#fff8f6;padding:16px;border-radius:12px;margin-top:24px}.activity-error p{margin:0 0 12px;font-size:13px;line-height:1.7;color:#8b3328}@media(max-width:600px){.activity-list li{grid-template-columns:32px minmax(0,1fr);gap:5px 12px;padding:16px 14px}.activity-mark{width:31px;height:31px;grid-row:1/3;align-self:start}.activity-list time{grid-column:2;text-align:left}.activity-copy strong{font-size:12px}.activity-copy span,.activity-list time{font-size:11px}}
</style>
