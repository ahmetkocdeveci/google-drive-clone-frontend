import { ref } from 'vue'
import type { ApiOptions, AuditEvent, Page, PageQuery } from '../../shared/types.ts'

const labels = new Map([
  ['workspace.created', 'Çalışma alanı oluşturuldu'],
  ['workspace.updated', 'Çalışma alanı ayarları güncellendi'],
  ['workspace.deleted', 'Çalışma alanı silindi'],
  ['workspace.ownership-transferred', 'Çalışma alanı sahipliği devredildi'],
  ['member.role-changed', 'Üye rolü değiştirildi'],
  ['member.removed', 'Üye çalışma alanından çıkarıldı'],
  ['invitation.created', 'Ekip daveti oluşturuldu'],
  ['invitation.accepted', 'Ekip daveti kabul edildi'],
  ['invitation.revoked', 'Ekip daveti iptal edildi'],
  ['folder.created', 'Klasör oluşturuldu'],
  ['node.updated', 'Dosya veya klasör güncellendi'],
  ['node.delete-requested', 'Dosya veya klasör silme işlemi başlatıldı'],
  ['file.upload-initiated', 'Dosya yükleme işlemi başlatıldı'],
  ['file.upload-completed', 'Dosya yüklendi'],
])
export function auditActionLabel(action: string): string { return labels.get(action) || 'İşlem kaydı' }

export interface AuditScope { workspaceId: string; userId: string; sessionRevision: number; canRead: boolean }
type LoadPage = (workspaceId: string, query: PageQuery, options: ApiOptions) => Promise<Page<AuditEvent>>

/** Shared by the page and source-level tests; stale account/page responses never publish records. */
export function createAuditHistory(getScope: () => AuditScope, loadPage: LoadPage) {
  const items = ref<AuditEvent[]>([]), nextCursor = ref<string | null>(null)
  const loading = ref(false), loadingMore = ref(false), error = ref(''), needsRefresh = ref(false), accessLost = ref(false)
  const controllers = new Set<AbortController>()
  let epoch = 0, disposed = false
  const key = (scope: AuditScope) => JSON.stringify(scope)
  const active = (version: number, scope: AuditScope) => !disposed && epoch === version && key(scope) === key(getScope())
  function abort() { for (const controller of controllers) controller.abort(); controllers.clear() }
  function failure(cause: unknown) {
    const status = (cause as { status?: number })?.status
    if (status === 403 || status === 404 || status === 401) {
      accessLost.value = true; items.value = []; nextCursor.value = null
      error.value = 'İşlem geçmişine erişimin bulunmuyor.'
    } else if (status === 409) {
      needsRefresh.value = true; nextCursor.value = null
      error.value = 'Çalışma alanında yeni değişiklikler var. Güncel geçmişi görmek için listeyi yenile.'
    } else error.value = cause instanceof Error ? cause.message : 'İşlem geçmişi yüklenemedi. Yeniden dene.'
  }
  async function refresh() {
    if (disposed) return
    abort()
    const version = ++epoch, scope = { ...getScope() }
    items.value = []; nextCursor.value = null; error.value = ''; needsRefresh.value = false; accessLost.value = false
    loadingMore.value = false; loading.value = scope.canRead && !!scope.userId && !!scope.workspaceId
    if (!loading.value) return
    const controller = new AbortController(); controllers.add(controller)
    try {
      const page = await loadPage(scope.workspaceId, { limit: 50 }, { signal: controller.signal })
      if (!active(version, scope)) return
      items.value = page.items; nextCursor.value = page.nextCursor
    } catch (cause) { if (active(version, scope) && !controller.signal.aborted) failure(cause) }
    finally { controllers.delete(controller); if (active(version, scope)) loading.value = false }
  }
  async function more() {
    if (disposed || loading.value || loadingMore.value || !nextCursor.value) return
    const version = epoch, scope = { ...getScope() }, cursor = nextCursor.value
    if (!scope.canRead || !scope.userId) { await refresh(); return }
    const controller = new AbortController(); controllers.add(controller)
    loadingMore.value = true; error.value = ''
    try {
      const page = await loadPage(scope.workspaceId, { limit: 50, cursor }, { signal: controller.signal })
      if (!active(version, scope)) return
      items.value = [...new Map([...items.value, ...page.items].map(event => [event.id, event])).values()]
      nextCursor.value = page.nextCursor
    } catch (cause) { if (active(version, scope) && !controller.signal.aborted) failure(cause) }
    finally { controllers.delete(controller); if (active(version, scope)) loadingMore.value = false }
  }
  function dispose() { disposed = true; epoch++; abort(); items.value = []; nextCursor.value = null; loading.value = false; loadingMore.value = false }
  return { items, nextCursor, loading, loadingMore, error, needsRefresh, accessLost, refresh, more, dispose }
}
