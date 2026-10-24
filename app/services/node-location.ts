import { ref } from 'vue'
import type { DriveNode } from '../../shared/types.ts'
import type { DriveApi } from './drive-api.ts'
import { getFolderPath } from './folder-path.ts'

export function createNodeLocation(api: Pick<DriveApi, 'getNode'>) {
  const path = ref<Array<{ id: string | null; name: string }>>([]),
    loading = ref(false),
    error = ref('')
  let revision = 0,
    controller: AbortController | undefined
  function clear() {
    revision++
    controller?.abort()
    path.value = []
    loading.value = false
    error.value = ''
  }
  async function load(workspaceId: string, node: DriveNode) {
    clear()
    const version = revision
    controller = new AbortController()
    const signal = controller.signal
    loading.value = true
    try {
      if (node.workspaceId !== workspaceId)
        throw new Error('Dosyanın konumu bu çalışma alanına ait değil.')
      const folders = await getFolderPath(api, workspaceId, node.parentId, { signal })
      if (version !== revision || signal.aborted) return
      path.value = [
        { id: null, name: 'Çalışma alanı kökü' },
        ...folders.map((folder) => ({ id: folder.id, name: folder.name })),
      ]
    } catch (cause) {
      if (version === revision && !signal.aborted)
        error.value = cause instanceof Error ? cause.message : 'Klasör konumu alınamadı.'
    } finally {
      if (version === revision) loading.value = false
    }
  }
  return { path, loading, error, load, clear }
}
