import type { ApiOptions, DriveNode } from '../../shared/types.ts'
import type { DriveApi } from './drive-api.ts'

/** Match the API's depth limit and reject incomplete or cyclic paths before displaying a location. */
export async function getFolderPath(api: Pick<DriveApi, 'getNode'>, workspaceId: string, folderId: string | null, options?: ApiOptions): Promise<DriveNode[]> {
  const folders: DriveNode[] = []
  const seen = new Set<string>()
  let currentId = folderId
  while (currentId) {
    options?.signal?.throwIfAborted()
    if (seen.has(currentId) || seen.size >= 64) throw new Error('Klasör yolu geçersiz veya 64 klasör sınırını aşıyor.')
    seen.add(currentId)
    const folder = await api.getNode(workspaceId, currentId, options)
    options?.signal?.throwIfAborted()
    if (folder.kind !== 'folder' || folder.id !== currentId || folder.workspaceId !== workspaceId) throw new Error('Bu bağlantı geçerli bir çalışma alanı klasörüne ait değil.')
    folders.unshift(folder)
    currentId = folder.parentId
  }
  return folders
}
