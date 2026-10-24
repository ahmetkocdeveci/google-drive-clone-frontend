import type { ApiOptions } from '../../shared/types.ts'
import type { DriveApi } from './drive-api.ts'
import { getFolderPath } from './folder-path.ts'

export interface FolderSelection {
  directories: string[]
  files: Array<{ path: string; file: File }>
}
const limit = 10000
function segments(path: string): string[] {
  const parts = path.split('/')
  if (
    !parts.length ||
    parts.length > 64 ||
    parts.some(
      (name) =>
        !name ||
        name !== name.trim() ||
        !name.isWellFormed() ||
        name.length > 180 ||
        name === '.' ||
        name === '..' ||
        /[\\\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/u.test(name),
    )
  )
    throw new Error('Klasör yolu geçersiz. Adları ve 64 seviye sınırını kontrol et.')
  return parts
}
export function planFolderUpload(selection: FolderSelection): FolderSelection {
  if (selection.files.length + selection.directories.length > limit)
    throw new Error('Bir yüklemede en fazla 10000 öğe seçebilirsin.')
  const dirs = new Set<string>(),
    files = new Set<string>()
  const addParents = (parts: string[], count: number) => {
    for (let i = 1; i <= count; i++) dirs.add(parts.slice(0, i).join('/'))
  }
  for (const path of selection.directories) {
    const parts = segments(path)
    addParents(parts, parts.length)
  }
  for (const item of selection.files) {
    const parts = segments(item.path)
    if (parts.at(-1) !== item.file.name || files.has(item.path))
      throw new Error('Tekrarlanan veya geçersiz dosya yolu seçildi.')
    if (item.file.size > 25 * 1024 ** 2)
      throw new Error(`${item.file.name}: dosya başına 25 MiB sınırı aşıldı.`)
    files.add(item.path)
    addParents(parts, parts.length - 1)
  }
  if ([...files].some((path) => dirs.has(path)))
    throw new Error('Aynı yol hem dosya hem klasör olamaz.')
  if (dirs.size + files.size > limit)
    throw new Error('Bir yüklemede en fazla 10000 öğe seçebilirsin.')
  return {
    directories: [...dirs].sort(
      (a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b),
    ),
    files: [...selection.files],
  }
}
export function selectionFromFiles(files: File[]): FolderSelection {
  return planFolderUpload({
    directories: [],
    files: files.map((file) => ({ path: file.webkitRelativePath || file.name, file })),
  })
}
interface Entry {
  name: string
  isFile: boolean
  isDirectory: boolean
  file(success: (file: File) => void, failure: (error: DOMException) => void): void
  createReader(): {
    readEntries(success: (entries: Entry[]) => void, failure: (error: DOMException) => void): void
  }
}
/** Capture entries during the drop event; browsers protect DataTransfer after it returns. */
export async function selectionFromDrop(transfer: DataTransfer): Promise<FolderSelection> {
  const entries = Array.from(transfer.items || [])
    .filter((item) => item.kind === 'file')
    .map((item) =>
      (item as unknown as { webkitGetAsEntry?: () => Entry | null }).webkitGetAsEntry?.(),
    )
  const fallback = Array.from(transfer.files || [])
  if (!entries.length || entries.every((entry) => !entry)) return selectionFromFiles(fallback)
  if (entries.some((entry) => !entry))
    throw new Error('Seçilen klasör okunamadı. Klasör yükle düğmesini kullan.')
  const result: FolderSelection = { directories: [], files: [] }
  let count = 0
  async function walk(entry: Entry, parent = ''): Promise<void> {
    const path = parent ? `${parent}/${entry.name}` : entry.name
    segments(path)
    if (++count > limit) throw new Error('Bir yüklemede en fazla 10000 öğe seçebilirsin.')
    if (entry.isFile)
      result.files.push({
        path,
        file: await new Promise<File>((resolve, reject) => entry.file(resolve, reject)),
      })
    else if (entry.isDirectory) {
      result.directories.push(path)
      const reader = entry.createReader()
      for (;;) {
        const batch = await new Promise<Entry[]>((resolve, reject) =>
          reader.readEntries(resolve, reject),
        )
        if (!batch.length) break
        for (const child of batch) await walk(child, path)
      }
    } else throw new Error('Bu öğe yüklenemiyor.')
  }
  for (const entry of entries) await walk(entry!)
  return planFolderUpload(result)
}
export async function uploadFolderSelection(
  api: Pick<DriveApi, 'getNode' | 'createFolder' | 'uploadFiles'>,
  workspaceId: string,
  parentId: string | null,
  selection: FolderSelection,
  onProgress?: (percent: number) => void,
  options?: ApiOptions,
): Promise<void> {
  options?.signal?.throwIfAborted()
  const plan = planFolderUpload(selection)
  const depth = (await getFolderPath(api, workspaceId, parentId, options)).length
  if (
    [...plan.directories, ...plan.files.map((item) => item.path)].some(
      (path) => depth + path.split('/').length > 64,
    )
  )
    throw new Error('Hedef konumda 64 seviye sınırı aşılacak.')
  const ids = new Map<string, string | null>([['', parentId]])
  let completed = 0
  const total = plan.directories.length + plan.files.length
  const progress = () => onProgress?.(total ? Math.round((++completed / total) * 100) : 100)
  for (const path of plan.directories) {
    options?.signal?.throwIfAborted()
    const parts = path.split('/'),
      name = parts.pop()!
    const folder = await api.createFolder(
      workspaceId,
      { name, parentId: ids.get(parts.join('/'))! },
      options,
    )
    ids.set(path, folder.id)
    progress()
  }
  for (const { path, file } of plan.files) {
    options?.signal?.throwIfAborted()
    const parts = path.split('/')
    parts.pop()
    await api.uploadFiles(workspaceId, ids.get(parts.join('/'))!, [file], undefined, options)
    progress()
  }
}
